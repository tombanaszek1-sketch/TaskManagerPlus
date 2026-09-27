using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Security;

namespace TaskManagerPlus.Core.Tests.Security;

public class ThreatAssessorTests
{
    private static ThreatFacts Facts(string name, string? path, SignatureState signature, double network = 0, bool critical = false) =>
        new(name, path, PathAccessible: false, critical, signature, network);

    [Fact]
    public void Signed_program_is_clean()
    {
        var (level, reasons) = ThreatAssessor.Assess(Facts("app.exe", @"C:\Program Files\App\app.exe", SignatureState.Valid));

        Assert.Equal(ThreatLevel.None, level);
        Assert.Empty(reasons);
    }

    [Fact]
    public void Unsigned_program_is_a_notice() =>
        Assert.Equal(ThreatLevel.Notice, ThreatAssessor.Assess(Facts("tool.exe", @"C:\Tools\tool.exe", SignatureState.Unsigned)).Level);

    [Fact]
    public void Unsigned_program_in_temp_is_a_warning() =>
        Assert.Equal(
            ThreatLevel.Warning,
            ThreatAssessor.Assess(Facts("x.exe", @"C:\Users\U\AppData\Local\Temp\x.exe", SignatureState.Unsigned)).Level);

    [Fact]
    public void Fake_system_process_is_a_warning() =>
        Assert.Equal(
            ThreatLevel.Warning,
            ThreatAssessor.Assess(Facts("svchost.exe", @"C:\Users\U\AppData\Roaming\svchost.exe", SignatureState.Valid)).Level);

    [Fact]
    public void Unsigned_program_with_traffic_is_a_warning() =>
        Assert.Equal(ThreatLevel.Warning, ThreatAssessor.Assess(Facts("tool.exe", @"C:\Tools\tool.exe", SignatureState.Unsigned, 200_000)).Level);

    [Fact]
    public void Critical_processes_are_never_flagged() =>
        Assert.Equal(ThreatLevel.None, ThreatAssessor.Assess(Facts("System", null, SignatureState.Unknown, critical: true)).Level);
}
