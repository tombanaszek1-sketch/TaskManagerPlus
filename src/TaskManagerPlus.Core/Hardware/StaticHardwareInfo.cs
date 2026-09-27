using System.Management;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Hardware;

public sealed record CpuInfo(string Id, string Name, int Cores, int LogicalProcessors, double? MaxClockMhz, long? L2CacheBytes, long? L3CacheBytes);

public sealed record DiskInfo(int Index, string Name, string MediaType, string BusType, long Size, IReadOnlyList<string> DriveLetters);

/// <summary>Hardware facts that do not change while the app runs, read once through WMI.</summary>
public sealed record StaticHardwareInfo(
    IReadOnlyList<CpuInfo> Cpus,
    IReadOnlyList<MemoryModule> MemoryModules,
    IReadOnlyList<DiskInfo> Disks,
    string OsName,
    string OsVersion,
    string? Motherboard,
    string? Bios)
{
    public static StaticHardwareInfo Load() => new(
        LoadCpus(),
        LoadMemoryModules(),
        LoadDisks(),
        ReadFirst("Win32_OperatingSystem", o => $"{o["Caption"]}".Replace("Microsoft ", string.Empty).Trim()) ?? "Windows",
        ReadFirst("Win32_OperatingSystem", o => $"{o["Version"]}") ?? Environment.OSVersion.Version.ToString(),
        ReadFirst("Win32_BaseBoard", o => $"{o["Manufacturer"]} {o["Product"]}".Trim()),
        ReadFirst("Win32_BIOS", o => $"{o["Manufacturer"]} {o["SMBIOSBIOSVersion"]}".Trim()));

    private static List<CpuInfo> LoadCpus() => Query(
        "SELECT DeviceID, Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, L2CacheSize, L3CacheSize FROM Win32_Processor",
        o => new CpuInfo(
            $"{o["DeviceID"]}",
            $"{o["Name"]}".Trim(),
            ToInt(o["NumberOfCores"]) ?? Environment.ProcessorCount,
            ToInt(o["NumberOfLogicalProcessors"]) ?? Environment.ProcessorCount,
            ToInt(o["MaxClockSpeed"]),
            ToInt(o["L2CacheSize"]) * 1024L,
            ToInt(o["L3CacheSize"]) * 1024L));

    private static List<MemoryModule> LoadMemoryModules() => Query(
        "SELECT DeviceLocator, Manufacturer, PartNumber, Capacity, ConfiguredClockSpeed, Speed, FormFactor FROM Win32_PhysicalMemory",
        o => new MemoryModule(
            $"{o["DeviceLocator"]}".Trim(),
            $"{o["Manufacturer"]}".Trim(),
            $"{o["PartNumber"]}".Trim(),
            Convert.ToInt64(o["Capacity"] ?? 0L),
            ToInt(o["ConfiguredClockSpeed"]) ?? ToInt(o["Speed"]),
            FormFactorName(ToInt(o["FormFactor"]))));

    private static List<DiskInfo> LoadDisks()
    {
        var letters = new Dictionary<int, List<string>>();
        foreach (var (disk, letter) in Query(
                     @"root\Microsoft\Windows\Storage",
                     "SELECT DiskNumber, DriveLetter FROM MSFT_Partition",
                     o => (ToInt(o["DiskNumber"]) ?? -1, Convert.ToChar(o["DriveLetter"] ?? '\0'))))
        {
            if (disk >= 0 && letter != '\0')
            {
                (letters.TryGetValue(disk, out var list) ? list : letters[disk] = []).Add($"{letter}:");
            }
        }

        return Query(
                @"root\Microsoft\Windows\Storage",
                "SELECT DeviceId, FriendlyName, MediaType, BusType, Size FROM MSFT_PhysicalDisk",
                o =>
                {
                    var index = int.TryParse($"{o["DeviceId"]}", out var i) ? i : -1;
                    return new DiskInfo(
                        index,
                        $"{o["FriendlyName"]}".Trim(),
                        MediaTypeName(ToInt(o["MediaType"])),
                        BusTypeName(ToInt(o["BusType"])),
                        Convert.ToInt64(o["Size"] ?? 0L),
                        letters.TryGetValue(index, out var l) ? l.Order().ToList() : []);
                })
            .Where(d => d.Index >= 0)
            .OrderBy(d => d.Index)
            .ToList();
    }

    private static string MediaTypeName(int? value) => value switch
    {
        3 => "HDD",
        4 => "SSD",
        5 => "SCM",
        _ => "Unknown",
    };

    private static string BusTypeName(int? value) => value switch
    {
        1 => "SCSI",
        3 => "ATA",
        7 => "USB",
        8 => "RAID",
        10 => "SAS",
        11 => "SATA",
        12 => "SD",
        13 => "MMC",
        15 => "File-backed virtual",
        16 => "Storage Spaces",
        17 => "NVMe",
        _ => "Other",
    };

    private static string FormFactorName(int? value) => value switch
    {
        8 => "DIMM",
        12 => "SODIMM",
        _ => "Other",
    };

    private static int? ToInt(object? value) => value is null ? null : Convert.ToInt32(value);

    private static string? ReadFirst(string wmiClass, Func<ManagementBaseObject, string> map) =>
        Query($"SELECT * FROM {wmiClass}", map).FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));

    private static List<T> Query<T>(string query, Func<ManagementBaseObject, T> map) => Query(@"root\CIMV2", query, map);

    private static List<T> Query<T>(string scope, string query, Func<ManagementBaseObject, T> map)
    {
        var result = new List<T>();
        try
        {
            using var searcher = new ManagementObjectSearcher(scope, query);
            using var collection = searcher.Get();
            foreach (var item in collection)
            {
                using (item)
                {
                    result.Add(map(item));
                }
            }
        }
        catch (Exception e) when (e is ManagementException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException)
        {
            // WMI providers can be missing or broken; the app keeps working with less detail.
        }

        return result;
    }
}
