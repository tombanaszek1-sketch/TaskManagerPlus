using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Processes;

namespace TaskManagerPlus.Core.Security;

public readonly record struct ThreatFacts(
    string Name,
    string? Path,
    bool PathAccessible,
    bool IsCritical,
    SignatureState Signature,
    double NetworkBytesPerSec);

/// <summary>Stable reason codes; the UI translates them.</summary>
public static class ThreatReason
{
    public const string SystemNameMimic = "systemNameMimic";
    public const string MissingFile = "missingFile";
    public const string InvalidSignature = "invalidSignature";
    public const string UnsignedInWritableFolder = "unsignedInWritableFolder";
    public const string Unsigned = "unsigned";
    public const string UnsignedWithTraffic = "unsignedWithTraffic";
}

/// <summary>
/// Heuristics that make suspicious processes stand out. They do not replace an antivirus scanner;
/// they highlight what a human should look at first.
/// </summary>
public static class ThreatAssessor
{
    private static readonly string[] UserWritableMarkers =
    [
        @"\AppData\Local\Temp\", @"\Windows\Temp\", @"\Downloads\", @"\Users\Public\", @"\$Recycle.Bin\", @"\ProgramData\",
    ];

    public static (ThreatLevel Level, IReadOnlyList<string> Reasons) Assess(ThreatFacts facts)
    {
        var reasons = new List<string>();
        var level = ThreatLevel.None;

        void Raise(ThreatLevel candidate, string reason)
        {
            reasons.Add(reason);
            if (candidate > level)
            {
                level = candidate;
            }
        }

        if (facts.IsCritical)
        {
            return (ThreatLevel.None, reasons);
        }

        if (ProcessClassifier.IsSystemNameOutsideSystemDirectory(facts.Name, facts.Path))
        {
            Raise(ThreatLevel.Warning, ThreatReason.SystemNameMimic);
        }

        if (facts.PathAccessible && facts.Path is not null && !File.Exists(facts.Path))
        {
            Raise(ThreatLevel.Warning, ThreatReason.MissingFile);
        }

        switch (facts.Signature)
        {
            case SignatureState.Invalid:
                Raise(ThreatLevel.Warning, ThreatReason.InvalidSignature);
                break;
            case SignatureState.Unsigned:
                var inWritableFolder = facts.Path is not null &&
                                       Array.Exists(UserWritableMarkers, m => facts.Path.Contains(m, StringComparison.OrdinalIgnoreCase));
                if (inWritableFolder)
                {
                    Raise(ThreatLevel.Warning, ThreatReason.UnsignedInWritableFolder);
                }
                else
                {
                    Raise(ThreatLevel.Notice, ThreatReason.Unsigned);
                }

                if (facts.NetworkBytesPerSec > 50_000)
                {
                    Raise(ThreatLevel.Warning, ThreatReason.UnsignedWithTraffic);
                }

                break;
        }

        return (level, reasons);
    }
}
