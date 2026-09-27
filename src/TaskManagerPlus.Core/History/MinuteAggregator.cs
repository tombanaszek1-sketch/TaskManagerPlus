namespace TaskManagerPlus.Core.History;

/// <summary>
/// Accumulates per-second samples and emits one averaged <see cref="MinuteRecord"/> whenever a
/// minute boundary is crossed. Processes are keyed by display name so that restarts count as one.
/// </summary>
public sealed class MinuteAggregator(int topCount = 5)
{
    private readonly Dictionary<string, (double Sum, int Count)> _metrics = [];
    private readonly Dictionary<string, Dictionary<string, double>> _processes = [];
    private long _minute = -1;
    private int _ticks;

    /// <summary>Adds one sample. Returns the completed record of the previous minute when the minute changed.</summary>
    public MinuteRecord? Add(
        DateTimeOffset timestamp,
        IReadOnlyDictionary<string, double> metrics,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, double>> processUsage)
    {
        var minute = timestamp.ToUnixTimeSeconds() / 60 * 60;
        MinuteRecord? completed = null;
        if (_minute >= 0 && minute != _minute)
        {
            completed = Flush();
        }

        _minute = minute;
        _ticks++;

        foreach (var (key, value) in metrics)
        {
            if (double.IsFinite(value))
            {
                var current = _metrics.GetValueOrDefault(key);
                _metrics[key] = (current.Sum + value, current.Count + 1);
            }
        }

        foreach (var (resource, byName) in processUsage)
        {
            if (!_processes.TryGetValue(resource, out var totals))
            {
                _processes[resource] = totals = [];
            }

            foreach (var (name, value) in byName)
            {
                totals[name] = totals.GetValueOrDefault(name) + value;
            }
        }

        return completed;
    }

    private MinuteRecord Flush()
    {
        var metrics = _metrics.ToDictionary(kv => kv.Key, kv => kv.Value.Sum / kv.Value.Count);
        var ticks = Math.Max(1, _ticks);
        var top = _processes.ToDictionary(
            kv => kv.Key,
            kv => (IReadOnlyList<TopProcessEntry>)kv.Value
                .Select(p => new TopProcessEntry(p.Key, p.Value / ticks))
                .Where(p => p.Value > 0)
                .OrderByDescending(p => p.Value)
                .Take(topCount)
                .ToList());

        var record = new MinuteRecord(_minute, metrics, top);
        _metrics.Clear();
        _processes.Clear();
        _ticks = 0;
        return record;
    }
}
