using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Hardware;

/// <summary>Helpers to pick the headline value (temperature, clock, power) out of a sensor list.</summary>
public static class SensorQuery
{
    /// <summary>Returns the first sensor of the given kind whose name matches one of the preferred names, in order.</summary>
    public static double? Pick(IReadOnlyList<SensorReading> sensors, SensorKind kind, params string[] preferredNames)
    {
        foreach (var preferred in preferredNames)
        {
            foreach (var sensor in sensors)
            {
                if (sensor.Kind == kind && sensor.Value is not null &&
                    sensor.Name.Equals(preferred, StringComparison.OrdinalIgnoreCase))
                {
                    return sensor.Value;
                }
            }
        }

        foreach (var preferred in preferredNames)
        {
            foreach (var sensor in sensors)
            {
                if (sensor.Kind == kind && sensor.Value is not null &&
                    sensor.Name.Contains(preferred, StringComparison.OrdinalIgnoreCase))
                {
                    return sensor.Value;
                }
            }
        }

        return null;
    }

    public static double? Max(IReadOnlyList<SensorReading> sensors, SensorKind kind)
    {
        double? max = null;
        foreach (var sensor in sensors)
        {
            if (sensor.Kind == kind && sensor.Value is { } value && (max is null || value > max))
            {
                max = value;
            }
        }

        return max;
    }

    public static double? Average(IReadOnlyList<SensorReading> sensors, SensorKind kind, string nameContains)
    {
        var values = sensors
            .Where(s => s.Kind == kind && s.Value is > 0 && s.Name.Contains(nameContains, StringComparison.OrdinalIgnoreCase))
            .Select(s => s.Value!.Value)
            .ToList();
        return values.Count == 0 ? null : values.Average();
    }

    /// <summary>Loose name match used to pair sensor hardware with DXGI adapters and WMI disks.</summary>
    public static bool NamesMatch(string a, string b)
    {
        static string Normalize(string s) => new(s.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());

        var na = Normalize(a.Replace("(TM)", string.Empty, StringComparison.OrdinalIgnoreCase).Replace("(R)", string.Empty, StringComparison.OrdinalIgnoreCase));
        var nb = Normalize(b.Replace("(TM)", string.Empty, StringComparison.OrdinalIgnoreCase).Replace("(R)", string.Empty, StringComparison.OrdinalIgnoreCase));
        return na.Length > 0 && nb.Length > 0 && (na.Contains(nb) || nb.Contains(na));
    }
}
