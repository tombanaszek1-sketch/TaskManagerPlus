namespace TaskManagerPlus.Core.Model;

public enum ProcessCategory
{
    App,
    Background,
    Windows,
}

public enum SignatureState
{
    Unknown,
    Valid,
    Unsigned,
    Invalid,
}

public enum ThreatLevel
{
    None,
    Notice,
    Warning,
}

public sealed record DiskProcessUsage(int DiskIndex, double ReadBytesPerSec, double WriteBytesPerSec);

public sealed record GpuProcessUsage(string AdapterId, double Utilization, IReadOnlyDictionary<string, double> Engines, long DedicatedBytes, long SharedBytes);

public sealed record ProcessSnapshot(
    int Pid,
    int ParentPid,
    int GroupId,
    string Name,
    string? Path,
    string? Description,
    string? Company,
    ProcessCategory Category,
    bool IsCritical,
    bool IsSelf,
    string? WindowTitle,
    int SessionId,
    DateTimeOffset? StartTime,
    double Cpu,
    long WorkingSet,
    long PrivateBytes,
    int Threads,
    int Handles,
    double DiskReadBytesPerSec,
    double DiskWriteBytesPerSec,
    IReadOnlyList<DiskProcessUsage> Disks,
    double NetReceiveBytesPerSec,
    double NetSendBytesPerSec,
    IReadOnlyList<GpuProcessUsage> Gpu,
    SignatureState Signature,
    string? Signer,
    ThreatLevel Threat,
    IReadOnlyList<string> ThreatReasons);
