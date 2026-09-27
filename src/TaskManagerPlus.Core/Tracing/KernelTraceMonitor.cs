using System.Diagnostics;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Parsers;
using Microsoft.Diagnostics.Tracing.Session;

namespace TaskManagerPlus.Core.Tracing;

public readonly record struct DiskRates(double Read, double Write);

public sealed record ProcessIoRates(double NetReceive, double NetSend, double DiskRead, double DiskWrite, IReadOnlyDictionary<int, DiskRates> Disks);

/// <summary>
/// Real-time kernel ETW session that attributes network and physical disk traffic to processes.
/// Requires administrator rights; when the session cannot start, <see cref="IsActive"/> stays false
/// and callers fall back to less precise per-process I/O counters.
/// </summary>
public sealed class KernelTraceMonitor : IDisposable
{
    private const string SessionName = "TaskManagerPlus-Kernel";

    private sealed class Counters
    {
        public long NetReceive;
        public long NetSend;
        public long DiskRead;
        public long DiskWrite;
        public Dictionary<int, (long Read, long Write)>? Disks;
    }

    private static readonly IReadOnlyDictionary<int, DiskRates> NoDisks = new Dictionary<int, DiskRates>();

    private readonly object _gate = new();
    private Dictionary<int, Counters> _current = [];
    private long _lastSwap = Stopwatch.GetTimestamp();
    private TraceEventSession? _session;
    private Thread? _thread;

    public bool IsActive { get; private set; }

    public string? FailureReason { get; private set; }

    public void Start()
    {
        if (TraceEventSession.IsElevated() != true)
        {
            FailureReason = "Administrator rights are required for per-process network and disk tracing.";
            return;
        }

        try
        {
            _session = new TraceEventSession(SessionName) { StopOnDispose = true, BufferSizeMB = 32 };
            _session.EnableKernelProvider(
                KernelTraceEventParser.Keywords.NetworkTCPIP |
                KernelTraceEventParser.Keywords.DiskIO |
                KernelTraceEventParser.Keywords.Process |
                KernelTraceEventParser.Keywords.Thread);

            var kernel = _session.Source.Kernel;
            kernel.TcpIpRecv += e => AddNetwork(e.ProcessID, e.size, 0);
            kernel.TcpIpRecvIPV6 += e => AddNetwork(e.ProcessID, e.size, 0);
            kernel.UdpIpRecv += e => AddNetwork(e.ProcessID, e.size, 0);
            kernel.UdpIpRecvIPV6 += e => AddNetwork(e.ProcessID, e.size, 0);
            kernel.TcpIpSend += e => AddNetwork(e.ProcessID, 0, e.size);
            kernel.TcpIpSendIPV6 += e => AddNetwork(e.ProcessID, 0, e.size);
            kernel.UdpIpSend += e => AddNetwork(e.ProcessID, 0, e.size);
            kernel.UdpIpSendIPV6 += e => AddNetwork(e.ProcessID, 0, e.size);
            kernel.DiskIORead += e => AddDisk(e.ProcessID, e.DiskNumber, e.TransferSize, 0);
            kernel.DiskIOWrite += e => AddDisk(e.ProcessID, e.DiskNumber, 0, e.TransferSize);

            _thread = new Thread(Process) { IsBackground = true, Name = "Kernel trace" };
            _thread.Start();
            IsActive = true;
        }
        catch (Exception e) when (e is UnauthorizedAccessException or InvalidOperationException or System.Runtime.InteropServices.COMException)
        {
            FailureReason = e.Message;
            _session?.Dispose();
            _session = null;
        }
    }

    private void Process()
    {
        try
        {
            _session?.Source.Process();
        }
        catch (Exception e)
        {
            FailureReason = e.Message;
        }
        finally
        {
            IsActive = false;
        }
    }

    private void AddNetwork(int pid, long receive, long send)
    {
        if (pid <= 0)
        {
            return;
        }

        lock (_gate)
        {
            var counters = Get(pid);
            counters.NetReceive += receive;
            counters.NetSend += send;
        }
    }

    private void AddDisk(int pid, int disk, long read, long write)
    {
        if (pid <= 0)
        {
            return;
        }

        lock (_gate)
        {
            var counters = Get(pid);
            counters.DiskRead += read;
            counters.DiskWrite += write;
            counters.Disks ??= [];
            var current = counters.Disks.GetValueOrDefault(disk);
            counters.Disks[disk] = (current.Read + read, current.Write + write);
        }
    }

    private Counters Get(int pid)
    {
        if (!_current.TryGetValue(pid, out var counters))
        {
            _current[pid] = counters = new Counters();
        }

        return counters;
    }

    /// <summary>Returns bytes per second per process since the previous call and resets the counters.</summary>
    public IReadOnlyDictionary<int, ProcessIoRates> Swap()
    {
        Dictionary<int, Counters> taken;
        double seconds;
        lock (_gate)
        {
            taken = _current;
            _current = new Dictionary<int, Counters>(taken.Count);
            var now = Stopwatch.GetTimestamp();
            seconds = Math.Max(0.001, Stopwatch.GetElapsedTime(_lastSwap, now).TotalSeconds);
            _lastSwap = now;
        }

        var result = new Dictionary<int, ProcessIoRates>(taken.Count);
        foreach (var (pid, c) in taken)
        {
            var disks = c.Disks is null
                ? NoDisks
                : c.Disks.ToDictionary(d => d.Key, d => new DiskRates(d.Value.Read / seconds, d.Value.Write / seconds));
            result[pid] = new ProcessIoRates(c.NetReceive / seconds, c.NetSend / seconds, c.DiskRead / seconds, c.DiskWrite / seconds, disks);
        }

        return result;
    }

    public void Dispose()
    {
        IsActive = false;
        _session?.Dispose();
        _thread?.Join(TimeSpan.FromSeconds(2));
    }
}
