namespace TaskManagerPlus.Core.Model;

public enum AutostartSource
{
    RegistryUser,
    RegistryMachine,
    RegistryMachine32,
    StartupFolderUser,
    StartupFolderCommon,
    ScheduledTask,
}

public sealed record AutostartEntry(
    string Id,
    string Name,
    string Command,
    string? ImagePath,
    string? Publisher,
    AutostartSource Source,
    string Location,
    bool Enabled,
    bool CanToggle,
    SignatureState Signature,
    bool IsSelf);

public sealed record ServiceEntry(
    string Name,
    string DisplayName,
    string? Description,
    string Status,
    string StartType,
    bool DelayedStart,
    string? ImagePath,
    int? Pid,
    string Account,
    bool IsMicrosoft,
    bool CanStop,
    SignatureState Signature,
    string? Signer);

public sealed record ConnectionEntry(
    string Protocol,
    string LocalAddress,
    int LocalPort,
    string RemoteAddress,
    int RemotePort,
    string State,
    int Pid,
    string ProcessName);

public sealed record SystemInfo(
    string ComputerName,
    string OsName,
    string OsVersion,
    string? Motherboard,
    string? Bios,
    bool IsElevated,
    bool SensorDriverAvailable,
    string AppVersion);
