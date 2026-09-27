namespace TaskManagerPlus.Core.Performance;

public sealed record AdapterUsage(double Utilization, IReadOnlyDictionary<string, double> Engines, long DedicatedUsed, long SharedUsed);

public sealed record ProcessAdapterUsage(double Utilization, IReadOnlyDictionary<string, double> Engines, long DedicatedBytes, long SharedBytes);

public sealed record GpuUsage(
    IReadOnlyDictionary<string, AdapterUsage> Adapters,
    IReadOnlyDictionary<int, IReadOnlyDictionary<string, ProcessAdapterUsage>> Processes)
{
    public static readonly GpuUsage Empty = new(new Dictionary<string, AdapterUsage>(), new Dictionary<int, IReadOnlyDictionary<string, ProcessAdapterUsage>>());
}

/// <summary>
/// Turns raw per-engine, per-process counter values into adapter and process utilization.
/// An adapter (or process) is as busy as its busiest engine, which matches how Windows reports GPU load.
/// </summary>
public static class GpuUsageAggregator
{
    public static GpuUsage Aggregate(
        IEnumerable<KeyValuePair<string, double>> engineUtilization,
        IEnumerable<KeyValuePair<string, double>> processDedicated,
        IEnumerable<KeyValuePair<string, double>> processShared,
        IEnumerable<KeyValuePair<string, double>> adapterDedicated,
        IEnumerable<KeyValuePair<string, double>> adapterShared)
    {
        // (luid, engine) -> summed utilization across processes
        var engineTotals = new Dictionary<(string Luid, int Engine), (string Type, double Value)>();
        // pid -> luid -> engine type -> summed utilization
        var perProcess = new Dictionary<int, Dictionary<string, Dictionary<string, double>>>();

        foreach (var (instance, value) in engineUtilization)
        {
            if (!GpuInstanceName.TryParse(instance, out var name) || value <= 0)
            {
                continue;
            }

            var type = GpuInstanceName.NormalizeEngineType(name.EngineType);
            var key = (name.Luid, name.Engine);
            engineTotals[key] = engineTotals.TryGetValue(key, out var existing)
                ? (type, existing.Value + value)
                : (type, value);

            if (name.Pid <= 0)
            {
                continue;
            }

            if (!perProcess.TryGetValue(name.Pid, out var adapters))
            {
                perProcess[name.Pid] = adapters = [];
            }

            if (!adapters.TryGetValue(name.Luid, out var engines))
            {
                adapters[name.Luid] = engines = [];
            }

            engines[type] = engines.GetValueOrDefault(type) + value;
        }

        var adapterEngines = new Dictionary<string, Dictionary<string, double>>();
        foreach (var ((luid, _), (type, value)) in engineTotals)
        {
            if (!adapterEngines.TryGetValue(luid, out var engines))
            {
                adapterEngines[luid] = engines = [];
            }

            engines[type] = Math.Round(Math.Max(engines.GetValueOrDefault(type), Math.Min(100, value)), 2);
        }

        var dedicated = SumByLuid(adapterDedicated);
        var shared = SumByLuid(adapterShared);
        var adapterResult = new Dictionary<string, AdapterUsage>();
        foreach (var luid in adapterEngines.Keys.Union(dedicated.Keys).Union(shared.Keys))
        {
            var engines = adapterEngines.GetValueOrDefault(luid) ?? [];
            adapterResult[luid] = new AdapterUsage(
                engines.Count == 0 ? 0 : engines.Values.Max(),
                engines,
                (long)dedicated.GetValueOrDefault(luid),
                (long)shared.GetValueOrDefault(luid));
        }

        var processDedicatedBytes = ByPidAndLuid(processDedicated);
        var processSharedBytes = ByPidAndLuid(processShared);
        var processResult = new Dictionary<int, IReadOnlyDictionary<string, ProcessAdapterUsage>>();
        foreach (var pid in perProcess.Keys.Union(processDedicatedBytes.Keys.Select(k => k.Pid)).Distinct())
        {
            var adapters = perProcess.GetValueOrDefault(pid) ?? [];
            var luids = adapters.Keys
                .Union(processDedicatedBytes.Keys.Where(k => k.Pid == pid).Select(k => k.Luid))
                .ToList();

            var byAdapter = new Dictionary<string, ProcessAdapterUsage>();
            foreach (var luid in luids)
            {
                var engines = adapters.GetValueOrDefault(luid) ?? [];
                foreach (var type in engines.Keys.ToList())
                {
                    engines[type] = Math.Round(Math.Min(100, engines[type]), 2);
                }

                var ded = (long)processDedicatedBytes.GetValueOrDefault((pid, luid));
                var sha = (long)processSharedBytes.GetValueOrDefault((pid, luid));
                var utilization = engines.Count == 0 ? 0 : engines.Values.Max();
                if (utilization <= 0 && ded <= 0 && sha <= 0)
                {
                    continue;
                }

                byAdapter[luid] = new ProcessAdapterUsage(utilization, engines, ded, sha);
            }

            if (byAdapter.Count > 0)
            {
                processResult[pid] = byAdapter;
            }
        }

        return new GpuUsage(adapterResult, processResult);
    }

    private static Dictionary<string, double> SumByLuid(IEnumerable<KeyValuePair<string, double>> values)
    {
        var result = new Dictionary<string, double>();
        foreach (var (instance, value) in values)
        {
            if (GpuInstanceName.TryParse(instance, out var name))
            {
                result[name.Luid] = result.GetValueOrDefault(name.Luid) + value;
            }
        }

        return result;
    }

    private static Dictionary<(int Pid, string Luid), double> ByPidAndLuid(IEnumerable<KeyValuePair<string, double>> values)
    {
        var result = new Dictionary<(int, string), double>();
        foreach (var (instance, value) in values)
        {
            if (GpuInstanceName.TryParse(instance, out var name) && name.Pid > 0)
            {
                result[(name.Pid, name.Luid)] = result.GetValueOrDefault((name.Pid, name.Luid)) + value;
            }
        }

        return result;
    }
}
