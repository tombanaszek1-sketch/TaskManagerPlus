namespace TaskManagerPlus.Core.Model;

public sealed record CpuSnapshot(
    string Id,
    string Name,
    int Cores,
    int LogicalProcessors,
    double Utilization,
    IReadOnlyList<double> LogicalLoads,
    double? ClockMhz,
    double? BaseClockMhz,
    double? Temperature,
    double? PackagePower,
    long? L2CacheBytes,
    long? L3CacheBytes,
    IReadOnlyList<SensorReading> Sensors);

public sealed record GpuSnapshot(
    string Id,
    string Name,
    string Vendor,
    bool IsIntegrated,
    double Utilization,
    IReadOnlyDictionary<string, double> Engines,
    long DedicatedTotal,
    long DedicatedUsed,
    long SharedTotal,
    long SharedUsed,
    double? Temperature,
    double? CoreClockMhz,
    double? MemoryClockMhz,
    double? Power,
    double? FanRpm,
    IReadOnlyList<SensorReading> Sensors);

public sealed record MemorySnapshot(
    long Installed,
    long Total,
    long Used,
    long Available,
    long Committed,
    long CommitLimit,
    long Cached,
    long PagedPool,
    long NonPagedPool,
    int? SpeedMts,
    IReadOnlyList<MemoryModule> Modules,
    IReadOnlyList<SensorReading> Sensors);

public sealed record MemoryModule(string Slot, string Manufacturer, string PartNumber, long Capacity, int? SpeedMts, string FormFactor);

public sealed record DiskSnapshot(
    string Id,
    int Index,
    string Name,
    string MediaType,
    string BusType,
    long Size,
    IReadOnlyList<VolumeInfo> Volumes,
    double ActivePercent,
    double ReadBytesPerSec,
    double WriteBytesPerSec,
    double AverageResponseMs,
    double? Temperature,
    double? LifeRemainingPercent,
    IReadOnlyList<SensorReading> Sensors);

public sealed record VolumeInfo(string Letter, string Label, string FileSystem, long Total, long Free);

public sealed record NetworkAdapterSnapshot(
    string Id,
    string Name,
    string Description,
    string Kind,
    bool IsUp,
    long LinkSpeedBitsPerSec,
    string MacAddress,
    IReadOnlyList<string> IPv4,
    IReadOnlyList<string> IPv6,
    IReadOnlyList<string> Gateways,
    IReadOnlyList<string> DnsServers,
    bool DhcpEnabled,
    double ReceiveBytesPerSec,
    double SendBytesPerSec,
    long TotalReceived,
    long TotalSent,
    WifiInfo? Wifi);

public sealed record WifiInfo(string Ssid, int SignalPercent, int? Channel, string? Band, double? RxRateMbps, double? TxRateMbps);

public sealed record LatencySnapshot(string? GatewayAddress, double? GatewayMs, string InternetTarget, double? InternetMs, double PacketLossPercent);
