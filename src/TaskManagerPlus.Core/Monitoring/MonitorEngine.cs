using System.Diagnostics;
using System.Reflection;
using System.Security.Principal;
using TaskManagerPlus.Core.Hardware;
using TaskManagerPlus.Core.History;
using TaskManagerPlus.Core.Interop;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Network;
using TaskManagerPlus.Core.Performance;
using TaskManagerPlus.Core.Processes;
using TaskManagerPlus.Core.Security;
using TaskManagerPlus.Core.Services;
using TaskManagerPlus.Core.Startup;
using TaskManagerPlus.Core.Tracing;

namespace TaskManagerPlus.Core.Monitoring;

public sealed class MonitorOptions
{
    public required string HistoryDatabasePath { get; init; }

    public Func<int> RetentionDays { get; init; } = () => 30;
}

/// <summary>
/// Owns every collector and produces one <see cref="Snapshot"/> per tick on a dedicated thread.
/// The tick interval can be relaxed while no window is visible; history keeps recording either way.
/// </summary>
public sealed class MonitorEngine : IDisposable
{
    private readonly SystemCounters _counters = new();
    private readonly ProcessSampler _processes = new();
    private readonly ProcessMetadataCache _metadata = new();
    private readonly SignatureCache _signatures = new();
    private readonly SensorHub _sensors = new();
    private readonly KernelTraceMonitor _trace = new();
    private readonly AdapterSampler _adapters = new();
    private readonly LatencyProbe _latency = new();
    private readonly HistoryRecorder _recorder;
    private readonly ProcessSnapshotBuilder _processBuilder;
    private readonly DeviceSnapshotBuilder _deviceBuilder;
    private readonly CancellationTokenSource _cts = new();
    private Thread? _thread;
    private volatile Snapshot? _latest;
    private volatile string? _gateway;

    public MonitorEngine(MonitorOptions options)
    {
        var hardware = StaticHardwareInfo.Load();
        _deviceBuilder = new DeviceSnapshotBuilder(hardware, Dxgi.EnumerateAdapters());
        _processBuilder = new ProcessSnapshotBuilder(_metadata, _signatures);

        History = new HistoryStore(options.HistoryDatabasePath);
        _recorder = new HistoryRecorder(History, options.RetentionDays);
        Autostart = new AutostartRepository(_signatures, _metadata);
        Services = new ServiceRepository(_signatures);

        SystemInfo = new SystemInfo(
            Environment.MachineName,
            hardware.OsName,
            hardware.OsVersion,
            hardware.Motherboard,
            hardware.Bios,
            IsElevated(),
            SensorHub.DriverAvailable,
            Assembly.GetEntryAssembly()?.GetName().Version?.ToString(3) ?? "1.0.0");
    }

    /// <summary>Raised on the monitor thread after every tick.</summary>
    public event Action<Snapshot>? SnapshotReady;

    public SystemInfo SystemInfo { get; private set; }

    /// <summary>Re-detects hardware sensors, e.g. after the sensor driver was installed.</summary>
    public void ReloadSensors()
    {
        _sensors.Reopen();
        SystemInfo = SystemInfo with { SensorDriverAvailable = SensorHub.DriverAvailable };
    }

    public HistoryStore History { get; }

    public AutostartRepository Autostart { get; }

    public ServiceRepository Services { get; }

    public Snapshot? Latest => _latest;

    public string? TraceFailure => _trace.FailureReason;

    /// <summary>Time between ticks; lowered while the window is visible, raised in the tray.</summary>
    public TimeSpan Interval { get; set; } = TimeSpan.FromSeconds(1);

    /// <summary>
    /// Time between hardware sensor updates. Sensors are the most expensive collector, so they refresh
    /// slower than the tick and slower still while nothing shows live data.
    /// </summary>
    public TimeSpan SensorInterval
    {
        set => _sensors.Interval = value;
    }

    public void Start()
    {
        _trace.Start();
        _sensors.Start();
        _latency.Start(() => _gateway, TimeSpan.FromSeconds(2));
        _thread = new Thread(Run) { IsBackground = true, Name = "Monitor", Priority = ThreadPriority.AboveNormal };
        _thread.Start();
    }

    public IReadOnlyList<ConnectionEntry> Connections()
    {
        var names = _latest?.Processes.ToDictionary(p => p.Pid, p => p.Name) ?? [];
        return ConnectionTable.Read(names);
    }

    private void Run()
    {
        // Prime rate based counters so the first published tick has real values.
        _counters.Collect();
        _processes.Sample();
        _adapters.Sample();

        var token = _cts.Token;
        while (!token.IsCancellationRequested)
        {
            var wait = Interval - TickDuration;
            if (token.WaitHandle.WaitOne(wait > TimeSpan.Zero ? wait : TimeSpan.Zero))
            {
                break;
            }

            var started = Stopwatch.GetTimestamp();
            try
            {
                var snapshot = Tick();
                _latest = snapshot;
                _recorder.Record(snapshot);
                SnapshotReady?.Invoke(snapshot);
            }
            catch (Exception e)
            {
                Trace.TraceError($"Monitor tick failed: {e}");
            }

            TickDuration = Stopwatch.GetElapsedTime(started);
        }
    }

    /// <summary>How long the last tick took to compute, excluding the wait.</summary>
    public TimeSpan TickDuration { get; private set; }

    /// <summary>Milliseconds spent in each stage of the last tick, for diagnostics.</summary>
    public IReadOnlyDictionary<string, double> LastTimings { get; private set; } = new Dictionary<string, double>();

    private Snapshot Tick()
    {
        var timings = new Dictionary<string, double>();
        var clock = Stopwatch.StartNew();
        void Mark(string stage)
        {
            timings[stage] = clock.Elapsed.TotalMilliseconds;
            clock.Restart();
        }

        _counters.Collect();
        var cpu = _counters.ReadCpu();
        Mark("counters");
        var gpu = _counters.ReadGpu();
        Mark("gpu");
        var diskCounters = _counters.ReadDisks();
        var raw = _processes.Sample();
        Mark("processes");
        var io = _trace.IsActive ? _trace.Swap() : null;
        var sensors = _sensors.Latest;
        Mark("sensors");
        var adapters = _adapters.Sample();
        Mark("network");
        _gateway = adapters.FirstOrDefault(a => a.IsUp && a.Gateways.Count > 0 && a.Kind != "Virtual")?.Gateways
            .FirstOrDefault(g => !g.Contains(':'));

        var processes = _processBuilder.Build(raw, gpu, io);
        Mark("build");
        Psapi.TryGetPerformanceInfo(out var perf);
        LastTimings = timings;

        return new Snapshot(
            DateTimeOffset.Now,
            new SystemSummary(
                (int)perf.ProcessCount,
                (int)perf.ThreadCount,
                (int)perf.HandleCount,
                Kernel32.GetTickCount64() / 1000d,
                _trace.IsActive,
                SystemInfo.SensorDriverAvailable),
            _deviceBuilder.BuildCpus(cpu, sensors),
            _deviceBuilder.BuildGpus(gpu, sensors),
            _deviceBuilder.BuildMemory(sensors),
            _deviceBuilder.BuildDisks(diskCounters, sensors),
            adapters,
            _latency.Latest,
            processes);
    }

    private static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    public void Dispose()
    {
        _cts.Cancel();
        _thread?.Join(TimeSpan.FromSeconds(3));
        _trace.Dispose();
        _latency.Dispose();
        _sensors.Dispose();
        _signatures.Dispose();
        _counters.Dispose();
        History.Dispose();
        _cts.Dispose();
    }
}
