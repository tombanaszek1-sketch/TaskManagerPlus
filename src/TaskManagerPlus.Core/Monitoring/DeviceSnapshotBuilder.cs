using System.Text.RegularExpressions;
using TaskManagerPlus.Core.Hardware;
using TaskManagerPlus.Core.Interop;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Performance;

namespace TaskManagerPlus.Core.Monitoring;

/// <summary>Builds the CPU, GPU, memory and disk device snapshots from counters, sensors and static facts.</summary>
internal sealed partial class DeviceSnapshotBuilder(StaticHardwareInfo hardware, IReadOnlyList<Dxgi.AdapterInfo> adapters)
{
    private static readonly IReadOnlyList<SensorReading> NoSensors = [];

    public IReadOnlyList<CpuSnapshot> BuildCpus(CpuCounterValues counters, IReadOnlyList<HardwareSensors> sensors)
    {
        var cpuSensors = sensors.Where(s => s.Kind == HardwareKind.Cpu).ToList();
        var infos = hardware.Cpus.Count > 0
            ? hardware.Cpus
            : [new CpuInfo("CPU0", "Processor", Environment.ProcessorCount, Environment.ProcessorCount, null, null, null)];

        var result = new List<CpuSnapshot>(infos.Count);
        var offset = 0;
        for (var i = 0; i < infos.Count; i++)
        {
            var info = infos[i];
            var readings = i < cpuSensors.Count ? cpuSensors[i].Sensors : NoSensors;

            // Logical processors are reported in socket order, so each package owns a contiguous slice.
            var logical = counters.Logical.Skip(offset).Take(info.LogicalProcessors).ToList();
            offset += info.LogicalProcessors;
            var utilization = infos.Count == 1 || logical.Count == 0 ? counters.Total : logical.Average();

            double? clock = SensorQuery.Average(readings, SensorKind.Clock, "Core #");
            if (clock is null && counters.BaseFrequencyMhz is { } baseMhz && counters.PerformancePercent is { } perf)
            {
                clock = baseMhz * perf / 100;
            }

            result.Add(new CpuSnapshot(
                info.Id,
                info.Name,
                info.Cores,
                info.LogicalProcessors,
                Math.Round(utilization, 2),
                logical.Select(v => Math.Round(v, 1)).ToList(),
                clock is null ? null : Math.Round(clock.Value),
                info.MaxClockMhz ?? counters.BaseFrequencyMhz,
                SensorQuery.Pick(readings, SensorKind.Temperature, "Core (Tctl/Tdie)", "CPU Package", "Core (Tctl)", "Package", "Core Average", "Core Max"),
                Positive(SensorQuery.Pick(readings, SensorKind.Power, "Package", "CPU Package", "Core Power")),
                info.L2CacheBytes,
                info.L3CacheBytes,
                readings));
        }

        return result;
    }

    public IReadOnlyList<GpuSnapshot> BuildGpus(GpuUsage usage, IReadOnlyList<HardwareSensors> sensors)
    {
        var gpuSensors = sensors.Where(s => s.Kind == HardwareKind.Gpu).ToList();
        var used = new HashSet<HardwareSensors>();
        var result = new List<GpuSnapshot>(adapters.Count);

        foreach (var adapter in adapters)
        {
            var match = gpuSensors.FirstOrDefault(s => !used.Contains(s) && SensorQuery.NamesMatch(s.Name, adapter.Description));
            if (match is not null)
            {
                used.Add(match);
            }

            var readings = match?.Sensors ?? NoSensors;
            usage.Adapters.TryGetValue(adapter.Luid, out var load);

            result.Add(new GpuSnapshot(
                adapter.Luid,
                adapter.Description,
                Vendor(adapter.VendorId),
                adapter.DedicatedVideoMemory < 1024L * 1024 * 1024,
                Math.Round(load?.Utilization ?? 0, 2),
                load?.Engines ?? new Dictionary<string, double>(),
                (long)adapter.DedicatedVideoMemory,
                load?.DedicatedUsed ?? 0,
                (long)adapter.SharedSystemMemory,
                load?.SharedUsed ?? 0,
                SensorQuery.Pick(readings, SensorKind.Temperature, "GPU Core", "GPU Temperature", "GPU Hot Spot", "Core"),
                SensorQuery.Pick(readings, SensorKind.Clock, "GPU Core", "Core"),
                SensorQuery.Pick(readings, SensorKind.Clock, "GPU Memory", "Memory"),
                SensorQuery.Pick(readings, SensorKind.Power, "GPU Package", "GPU Power", "GPU Core", "Package"),
                SensorQuery.Pick(readings, SensorKind.Fan, "GPU Fan", "Fan"),
                readings));
        }

        return result;
    }

    public MemorySnapshot BuildMemory(IReadOnlyList<HardwareSensors> sensors)
    {
        var status = Kernel32.MemoryStatusEx.Create();
        Kernel32.GlobalMemoryStatusEx(ref status);
        Psapi.TryGetPerformanceInfo(out var perf);
        var page = (long)perf.PageSize;

        var memoryHardware = sensors.Where(s => s.Kind == HardwareKind.Memory).ToList();
        var readings = memoryHardware.Count == 1
            ? memoryHardware[0].Sensors
            : memoryHardware.SelectMany(s => s.Sensors.Select(r => r with { Name = $"{s.Name} / {r.Name}" })).ToList();

        return new MemorySnapshot(
            InstalledMemory((long)status.TotalPhys),
            (long)status.TotalPhys,
            (long)(status.TotalPhys - status.AvailPhys),
            (long)status.AvailPhys,
            (long)perf.CommitTotal * page,
            (long)perf.CommitLimit * page,
            (long)perf.SystemCache * page,
            (long)perf.KernelPaged * page,
            (long)perf.KernelNonpaged * page,
            hardware.MemoryModules.Select(m => m.SpeedMts).FirstOrDefault(s => s is > 0),
            hardware.MemoryModules,
            readings);
    }

    public IReadOnlyList<DiskSnapshot> BuildDisks(IReadOnlyList<DiskCounterValues> counters, IReadOnlyList<HardwareSensors> sensors)
    {
        var storage = sensors.Where(s => s.Kind == HardwareKind.Storage).ToList();
        var byIndex = counters.ToDictionary(c => c.Index);
        var result = new List<DiskSnapshot>();

        foreach (var disk in hardware.Disks)
        {
            byIndex.TryGetValue(disk.Index, out var counter);
            var match = storage.FirstOrDefault(s => IdentifierIndex(s.Identifier) == disk.Index)
                        ?? storage.FirstOrDefault(s => SensorQuery.NamesMatch(s.Name, disk.Name));
            var readings = match?.Sensors ?? NoSensors;

            result.Add(new DiskSnapshot(
                $"disk{disk.Index}",
                disk.Index,
                disk.Name,
                disk.MediaType,
                disk.BusType,
                disk.Size,
                disk.DriveLetters.Select(ReadVolume).OfType<VolumeInfo>().ToList(),
                Math.Round(counter?.ActivePercent ?? 0, 2),
                Math.Round(counter?.ReadBytesPerSec ?? 0),
                Math.Round(counter?.WriteBytesPerSec ?? 0),
                Math.Round(counter?.AverageResponseMs ?? 0, 2),
                SensorQuery.Pick(readings, SensorKind.Temperature, "Temperature", "Composite", "Temperature 1"),
                SensorQuery.Pick(readings, SensorKind.Level, "Remaining Life", "Life", "Percentage Used"),
                readings));
        }

        return result;
    }

    private static VolumeInfo? ReadVolume(string letter)
    {
        try
        {
            var drive = new DriveInfo(letter);
            return drive.IsReady
                ? new VolumeInfo(letter, drive.VolumeLabel, drive.DriveFormat, drive.TotalSize, drive.AvailableFreeSpace)
                : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return null;
        }
    }

    /// <summary>LibreHardwareMonitor storage identifiers end with the physical drive number, e.g. "/nvme/1".</summary>
    internal static int IdentifierIndex(string identifier)
    {
        var match = TrailingNumber().Match(identifier);
        return match.Success ? int.Parse(match.Value) : -1;
    }

    /// <summary>
    /// RAM as installed on the mainboard. Windows reports less as usable because firmware and
    /// integrated graphics reserve part of it.
    /// </summary>
    private long InstalledMemory(long usable)
    {
        if (Kernel32.GetPhysicallyInstalledSystemMemory(out var kilobytes) && kilobytes > 0)
        {
            return Math.Max(usable, (long)kilobytes * 1024);
        }

        var modules = hardware.MemoryModules.Sum(m => m.Capacity);
        return Math.Max(usable, modules);
    }

    /// <summary>Sensors that are present but unreadable without the optional driver report 0.</summary>
    private static double? Positive(double? value) => value > 0 ? value : null;

    private static string Vendor(uint vendorId) => vendorId switch
    {
        0x10DE => "NVIDIA",
        0x1002 or 0x1022 => "AMD",
        0x8086 => "Intel",
        0x1414 => "Microsoft",
        0x5143 => "Qualcomm",
        _ => "Unknown",
    };

    [GeneratedRegex(@"\d+$")]
    private static partial Regex TrailingNumber();
}
