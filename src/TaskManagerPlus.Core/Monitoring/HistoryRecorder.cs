using TaskManagerPlus.Core.History;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Monitoring;

/// <summary>Maps snapshots to history metrics and persists one record per minute.</summary>
public sealed class HistoryRecorder(HistoryStore store, Func<int> retentionDays)
{
    public static class Resources
    {
        public const string Cpu = "cpu";
        public const string Memory = "ram";
        public const string Gpu = "gpu";
        public const string Disk = "disk";
        public const string Network = "net";
    }

    private readonly MinuteAggregator _aggregator = new();
    private DateTimeOffset _lastPrune = DateTimeOffset.MinValue;

    public void Record(Snapshot snapshot)
    {
        var record = _aggregator.Add(snapshot.Timestamp, Metrics(snapshot), ProcessUsage(snapshot.Processes));
        if (record is null)
        {
            return;
        }

        store.Write(record);

        if (snapshot.Timestamp - _lastPrune > TimeSpan.FromHours(1))
        {
            _lastPrune = snapshot.Timestamp;
            store.Prune(snapshot.Timestamp.AddDays(-Math.Max(1, retentionDays())).ToUnixTimeSeconds());
        }
    }

    public static Dictionary<string, double> Metrics(Snapshot snapshot)
    {
        var metrics = new Dictionary<string, double>();

        for (var i = 0; i < snapshot.Cpus.Count; i++)
        {
            var cpu = snapshot.Cpus[i];
            var suffix = snapshot.Cpus.Count > 1 ? $":{i}" : string.Empty;
            metrics["cpu" + suffix] = cpu.Utilization;
            AddIf(metrics, "temp:cpu" + suffix, cpu.Temperature);
            AddIf(metrics, "power:cpu" + suffix, cpu.PackagePower);
        }

        foreach (var gpu in snapshot.Gpus)
        {
            metrics[$"gpu:{gpu.Id}"] = gpu.Utilization;
            metrics[$"vram:{gpu.Id}"] = gpu.DedicatedUsed;
            AddIf(metrics, $"temp:gpu:{gpu.Id}", gpu.Temperature);
            AddIf(metrics, $"power:gpu:{gpu.Id}", gpu.Power);
        }

        var memory = snapshot.Memory;
        metrics["ram"] = memory.Total == 0 ? 0 : memory.Used * 100d / memory.Total;
        metrics["ram:used"] = memory.Used;

        foreach (var disk in snapshot.Disks)
        {
            metrics[$"disk:{disk.Index}:active"] = disk.ActivePercent;
            metrics[$"disk:{disk.Index}:read"] = disk.ReadBytesPerSec;
            metrics[$"disk:{disk.Index}:write"] = disk.WriteBytesPerSec;
            AddIf(metrics, $"temp:disk:{disk.Index}", disk.Temperature);
        }

        var physical = snapshot.Adapters.Where(a => a.IsUp && a.Kind != "Virtual").ToList();
        metrics["net:down"] = physical.Sum(a => a.ReceiveBytesPerSec);
        metrics["net:up"] = physical.Sum(a => a.SendBytesPerSec);
        foreach (var adapter in physical)
        {
            metrics[$"net:{adapter.Id}:down"] = adapter.ReceiveBytesPerSec;
            metrics[$"net:{adapter.Id}:up"] = adapter.SendBytesPerSec;
            if (adapter.Wifi is { } wifi)
            {
                metrics[$"wifi:{adapter.Id}:signal"] = wifi.SignalPercent;
            }
        }

        AddIf(metrics, "ping:internet", snapshot.Latency.InternetMs);
        AddIf(metrics, "ping:gateway", snapshot.Latency.GatewayMs);
        metrics["ping:loss"] = snapshot.Latency.PacketLossPercent;

        return metrics;
    }

    public static Dictionary<string, IReadOnlyDictionary<string, double>> ProcessUsage(IReadOnlyList<ProcessSnapshot> processes)
    {
        var cpu = new Dictionary<string, double>();
        var ram = new Dictionary<string, double>();
        var gpu = new Dictionary<string, double>();
        var disk = new Dictionary<string, double>();
        var net = new Dictionary<string, double>();

        foreach (var p in processes)
        {
            var name = p.Name;
            Add(cpu, name, p.Cpu);
            Add(ram, name, p.WorkingSet);
            Add(gpu, name, p.Gpu.Count == 0 ? 0 : p.Gpu.Max(g => g.Utilization));
            Add(disk, name, p.DiskReadBytesPerSec + p.DiskWriteBytesPerSec);
            Add(net, name, p.NetReceiveBytesPerSec + p.NetSendBytesPerSec);
        }

        return new Dictionary<string, IReadOnlyDictionary<string, double>>
        {
            [Resources.Cpu] = cpu,
            [Resources.Memory] = ram,
            [Resources.Gpu] = gpu,
            [Resources.Disk] = disk,
            [Resources.Network] = net,
        };

        static void Add(Dictionary<string, double> target, string name, double value)
        {
            if (value > 0)
            {
                target[name] = target.GetValueOrDefault(name) + value;
            }
        }
    }

    private static void AddIf(Dictionary<string, double> metrics, string key, double? value)
    {
        if (value is { } v)
        {
            metrics[key] = v;
        }
    }
}
