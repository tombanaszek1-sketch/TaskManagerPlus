using System.Diagnostics;
using TaskManagerPlus.Core.Interop;

namespace TaskManagerPlus.Core.Processes;

/// <summary>Raw per-process counters for one sample, with rates computed against the previous sample.</summary>
public sealed record RawProcess(
    int Pid,
    int ParentPid,
    string Name,
    long CreateTime,
    int SessionId,
    int Threads,
    int Handles,
    long WorkingSet,
    long PrivateBytes,
    double CpuPercent,
    double IoReadBytesPerSec,
    double IoWriteBytesPerSec);

/// <summary>
/// Reads all processes with a single NtQuerySystemInformation call and derives CPU and I/O rates
/// from the delta to the previous call.
/// </summary>
public sealed unsafe class ProcessSampler
{
    private readonly record struct Previous(long CpuTime, long ReadBytes, long WriteBytes);

    private readonly Dictionary<(int Pid, long Created), Previous> _previous = [];
    private readonly int _processorCount = Environment.ProcessorCount;
    private byte[] _buffer = new byte[1024 * 1024];
    private long _lastTimestamp;

    public IReadOnlyList<RawProcess> Sample()
    {
        var now = Stopwatch.GetTimestamp();
        var elapsedSeconds = _lastTimestamp == 0 ? 0 : Stopwatch.GetElapsedTime(_lastTimestamp, now).TotalSeconds;
        _lastTimestamp = now;

        var result = new List<RawProcess>(400);
        var seen = new HashSet<(int, long)>();

        fixed (byte* start = Query())
        {
            var offset = 0L;
            while (true)
            {
                var info = (NtDll.SystemProcessInfo*)(start + offset);
                var pid = (int)info->UniqueProcessId;
                if (pid != 0)
                {
                    result.Add(Read(info, pid, elapsedSeconds, seen));
                }

                if (info->NextEntryOffset == 0)
                {
                    break;
                }

                offset += info->NextEntryOffset;
            }
        }

        foreach (var key in _previous.Keys.Where(k => !seen.Contains(k)).ToList())
        {
            _previous.Remove(key);
        }

        return result;
    }

    private RawProcess Read(NtDll.SystemProcessInfo* info, int pid, double elapsedSeconds, HashSet<(int, long)> seen)
    {
        var key = (pid, info->CreateTime);
        seen.Add(key);

        var cpuTime = info->UserTime + info->KernelTime;
        double cpu = 0, read = 0, write = 0;
        if (elapsedSeconds > 0 && _previous.TryGetValue(key, out var prev))
        {
            // Times are in 100 ns units.
            cpu = Math.Clamp((cpuTime - prev.CpuTime) / (elapsedSeconds * 10_000_000d * _processorCount) * 100d, 0, 100);
            read = Math.Max(0, (info->ReadTransferCount - prev.ReadBytes) / elapsedSeconds);
            write = Math.Max(0, (info->WriteTransferCount - prev.WriteBytes) / elapsedSeconds);
        }

        _previous[key] = new Previous(cpuTime, info->ReadTransferCount, info->WriteTransferCount);

        var name = info->ImageName.Buffer == null
            ? (pid == 4 ? "System" : $"pid {pid}")
            : new string(info->ImageName.Buffer, 0, info->ImageName.Length / 2);

        return new RawProcess(
            pid,
            (int)info->InheritedFromUniqueProcessId,
            name,
            info->CreateTime,
            (int)info->SessionId,
            (int)info->NumberOfThreads,
            (int)info->HandleCount,
            (long)info->WorkingSetSize,
            (long)info->PrivatePageCount,
            cpu,
            read,
            write);
    }

    private byte[] Query()
    {
        while (true)
        {
            uint status;
            uint needed;
            fixed (byte* p = _buffer)
            {
                status = NtDll.NtQuerySystemInformation(NtDll.SystemProcessInformation, p, (uint)_buffer.Length, out needed);
            }

            if (status == 0)
            {
                return _buffer;
            }

            if (status != NtDll.StatusInfoLengthMismatch)
            {
                throw new InvalidOperationException($"NtQuerySystemInformation failed with 0x{status:X8}.");
            }

            _buffer = new byte[Math.Max(needed + 64 * 1024, (uint)_buffer.Length * 2)];
        }
    }
}
