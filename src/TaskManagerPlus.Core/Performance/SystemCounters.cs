using System.Globalization;

namespace TaskManagerPlus.Core.Performance;

public sealed record CpuCounterValues(double Total, IReadOnlyList<double> Logical, double? PerformancePercent, double? BaseFrequencyMhz);

public sealed record DiskCounterValues(int Index, double ActivePercent, double ReadBytesPerSec, double WriteBytesPerSec, double AverageResponseMs);

/// <summary>All PDH counters the monitor needs, collected in one query per tick.</summary>
public sealed class SystemCounters : IDisposable
{
    private const string CpuUtility = @"\Processor Information(*)\% Processor Utility";
    private const string CpuTime = @"\Processor Information(*)\% Processor Time";
    private const string CpuPerformance = @"\Processor Information(_Total)\% Processor Performance";
    private const string CpuFrequency = @"\Processor Information(_Total)\Processor Frequency";
    private const string GpuEngine = @"\GPU Engine(*)\Utilization Percentage";
    private const string GpuProcessDedicated = @"\GPU Process Memory(*)\Dedicated Usage";
    private const string GpuProcessShared = @"\GPU Process Memory(*)\Shared Usage";
    private const string GpuAdapterDedicated = @"\GPU Adapter Memory(*)\Dedicated Usage";
    private const string GpuAdapterShared = @"\GPU Adapter Memory(*)\Shared Usage";
    private const string DiskIdle = @"\PhysicalDisk(*)\% Idle Time";
    private const string DiskRead = @"\PhysicalDisk(*)\Disk Read Bytes/sec";
    private const string DiskWrite = @"\PhysicalDisk(*)\Disk Write Bytes/sec";
    private const string DiskLatency = @"\PhysicalDisk(*)\Avg. Disk sec/Transfer";

    private readonly PdhQuery _query = new();
    private readonly string _cpuLoad;

    public SystemCounters()
    {
        // "% Processor Utility" matches Task Manager; fall back to time based load on older systems.
        _cpuLoad = _query.Add(CpuUtility) ? CpuUtility : CpuTime;
        _query.Add(_cpuLoad);
        _query.Add(CpuPerformance);
        _query.Add(CpuFrequency);
        GpuAvailable = _query.Add(GpuEngine);
        _query.Add(GpuProcessDedicated);
        _query.Add(GpuProcessShared);
        _query.Add(GpuAdapterDedicated);
        _query.Add(GpuAdapterShared);
        _query.Add(DiskIdle);
        _query.Add(DiskRead);
        _query.Add(DiskWrite);
        _query.Add(DiskLatency);
        _query.Collect();
    }

    public bool GpuAvailable { get; }

    public void Collect() => _query.Collect();

    public CpuCounterValues ReadCpu()
    {
        var values = _query.ReadArray(_cpuLoad);
        double total = 0;
        var logical = new SortedDictionary<(int Group, int Index), double>();
        foreach (var (instance, value) in values)
        {
            if (instance == "_Total")
            {
                total = Math.Clamp(value, 0, 100);
                continue;
            }

            var comma = instance.IndexOf(',');
            if (comma > 0 &&
                int.TryParse(instance.AsSpan(0, comma), NumberStyles.None, CultureInfo.InvariantCulture, out var group) &&
                int.TryParse(instance.AsSpan(comma + 1), NumberStyles.None, CultureInfo.InvariantCulture, out var index))
            {
                logical[(group, index)] = Math.Clamp(value, 0, 100);
            }
        }

        return new CpuCounterValues(total, logical.Values.ToList(), _query.Read(CpuPerformance), _query.Read(CpuFrequency));
    }

    public GpuUsage ReadGpu() => !GpuAvailable
        ? GpuUsage.Empty
        : GpuUsageAggregator.Aggregate(
            _query.ReadArray(GpuEngine),
            _query.ReadArray(GpuProcessDedicated),
            _query.ReadArray(GpuProcessShared),
            _query.ReadArray(GpuAdapterDedicated),
            _query.ReadArray(GpuAdapterShared));

    public IReadOnlyList<DiskCounterValues> ReadDisks()
    {
        var idle = ByDiskIndex(_query.ReadArray(DiskIdle));
        var read = ByDiskIndex(_query.ReadArray(DiskRead));
        var write = ByDiskIndex(_query.ReadArray(DiskWrite));
        var latency = ByDiskIndex(_query.ReadArray(DiskLatency));

        return idle.Keys
            .Order()
            .Select(index => new DiskCounterValues(
                index,
                Math.Clamp(100 - idle[index], 0, 100),
                read.GetValueOrDefault(index),
                write.GetValueOrDefault(index),
                latency.GetValueOrDefault(index) * 1000))
            .ToList();
    }

    /// <summary>PhysicalDisk instances look like "0 C: D:"; the leading number is the disk index.</summary>
    internal static Dictionary<int, double> ByDiskIndex(IEnumerable<KeyValuePair<string, double>> values)
    {
        var result = new Dictionary<int, double>();
        foreach (var (instance, value) in values)
        {
            var space = instance.IndexOf(' ');
            var number = space < 0 ? instance : instance[..space];
            if (int.TryParse(number, NumberStyles.None, CultureInfo.InvariantCulture, out var index))
            {
                result[index] = value;
            }
        }

        return result;
    }

    public void Dispose() => _query.Dispose();
}
