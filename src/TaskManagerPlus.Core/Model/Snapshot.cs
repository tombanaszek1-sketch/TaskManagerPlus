namespace TaskManagerPlus.Core.Model;

/// <summary>Complete, immutable state of the machine at one point in time.</summary>
public sealed record Snapshot(
    DateTimeOffset Timestamp,
    SystemSummary Summary,
    IReadOnlyList<CpuSnapshot> Cpus,
    IReadOnlyList<GpuSnapshot> Gpus,
    MemorySnapshot Memory,
    IReadOnlyList<DiskSnapshot> Disks,
    IReadOnlyList<NetworkAdapterSnapshot> Adapters,
    LatencySnapshot Latency,
    IReadOnlyList<ProcessSnapshot> Processes);

public sealed record SystemSummary(
    int ProcessCount,
    int ThreadCount,
    int HandleCount,
    double UptimeSeconds,
    bool TracingActive,
    bool SensorDriverAvailable);

/// <summary>A single sensor value as reported by the hardware monitor.</summary>
public sealed record SensorReading(string Name, SensorKind Kind, double? Value, double? Min, double? Max);

public enum SensorKind
{
    Load,
    Temperature,
    Clock,
    Power,
    Voltage,
    Current,
    Fan,
    Control,
    Data,
    SmallData,
    Throughput,
    Level,
    Factor,
    Energy,
    Frequency,
    Other,
}
