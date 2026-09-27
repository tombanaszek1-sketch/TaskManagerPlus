using System.Globalization;

namespace TaskManagerPlus.Core.Performance;

/// <summary>
/// Parsed form of GPU performance counter instance names such as
/// <c>pid_1234_luid_0x00000000_0x0000EC5D_phys_0_eng_3_engtype_3D</c>.
/// </summary>
public readonly record struct GpuInstanceName(int Pid, string Luid, int Engine, string EngineType)
{
    public static bool TryParse(string instance, out GpuInstanceName result)
    {
        result = default;
        var span = instance.AsSpan();

        var pid = -1;
        if (span.StartsWith("pid_"))
        {
            span = span[4..];
            var end = span.IndexOf('_');
            if (end <= 0 || !int.TryParse(span[..end], NumberStyles.None, CultureInfo.InvariantCulture, out pid))
            {
                return false;
            }

            span = span[(end + 1)..];
        }

        if (!span.StartsWith("luid_") || span.Length < 5 + 21)
        {
            return false;
        }

        var luid = span.Slice(5, 21).ToString().ToLowerInvariant();
        span = span[(5 + 21)..];

        var engine = -1;
        var engineType = string.Empty;
        var engIndex = span.IndexOf("_eng_");
        if (engIndex >= 0)
        {
            var rest = span[(engIndex + 5)..];
            var end = rest.IndexOf('_');
            var number = end < 0 ? rest : rest[..end];
            if (!int.TryParse(number, NumberStyles.None, CultureInfo.InvariantCulture, out engine))
            {
                return false;
            }

            var typeIndex = rest.IndexOf("engtype_");
            if (typeIndex >= 0)
            {
                engineType = rest[(typeIndex + 8)..].ToString();
            }
        }

        result = new GpuInstanceName(pid, luid, engine, engineType);
        return true;
    }

    /// <summary>Maps raw engine type names to stable display groups.</summary>
    public static string NormalizeEngineType(string engineType)
    {
        if (engineType.Length == 0)
        {
            return "Other";
        }

        var type = engineType.Trim();
        if (type.StartsWith("Compute", StringComparison.OrdinalIgnoreCase))
        {
            return "Compute";
        }

        if (type.StartsWith("Copy", StringComparison.OrdinalIgnoreCase))
        {
            return "Copy";
        }

        if (type.StartsWith("VideoDecode", StringComparison.OrdinalIgnoreCase) || type.StartsWith("Video Decode", StringComparison.OrdinalIgnoreCase))
        {
            return "Video Decode";
        }

        if (type.StartsWith("VideoEncode", StringComparison.OrdinalIgnoreCase) || type.StartsWith("Video Encode", StringComparison.OrdinalIgnoreCase))
        {
            return "Video Encode";
        }

        if (type.StartsWith("3D", StringComparison.OrdinalIgnoreCase) || type.StartsWith("Graphics", StringComparison.OrdinalIgnoreCase))
        {
            return "3D";
        }

        return type;
    }
}
