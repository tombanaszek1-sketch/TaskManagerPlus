using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Processes;

namespace TaskManagerPlus.Core.Tests.Processes;

public class ProcessClassifierTests
{
    private static readonly string System32 = Environment.GetFolderPath(Environment.SpecialFolder.System);

    [Theory]
    [InlineData(4, "System")]
    [InlineData(120, "Registry")]
    [InlineData(300, "Memory Compression")]
    public void Kernel_processes_are_critical(int pid, string name) =>
        Assert.True(ProcessClassifier.IsCritical(pid, name, null));

    [Fact]
    public void Csrss_in_system32_is_critical() =>
        Assert.True(ProcessClassifier.IsCritical(700, "csrss.exe", Path.Combine(System32, "csrss.exe")));

    [Fact]
    public void System_name_outside_system32_is_not_protected()
    {
        const string fake = @"C:\Users\Someone\AppData\Local\Temp\svchost.exe";

        Assert.False(ProcessClassifier.IsCritical(900, "svchost.exe", fake));
        Assert.True(ProcessClassifier.IsSystemNameOutsideSystemDirectory("svchost.exe", fake));
    }

    [Fact]
    public void Process_with_window_is_an_app() =>
        Assert.Equal(
            ProcessCategory.App,
            ProcessClassifier.Classify(new ProcessFacts(1000, "Discord.exe", @"C:\Users\U\AppData\Local\Discord\Discord.exe", true, false)));

    [Fact]
    public void Microsoft_signed_image_in_windows_directory_is_windows() =>
        Assert.Equal(
            ProcessCategory.Windows,
            ProcessClassifier.Classify(new ProcessFacts(1000, "RuntimeBroker.exe", Path.Combine(System32, "RuntimeBroker.exe"), false, true)));

    [Fact]
    public void Unsigned_image_in_windows_directory_is_background() =>
        Assert.Equal(
            ProcessCategory.Background,
            ProcessClassifier.Classify(new ProcessFacts(1000, "helper.exe", Path.Combine(System32, "helper.exe"), false, false)));

    [Fact]
    public void Vendor_tool_without_window_is_background() =>
        Assert.Equal(
            ProcessCategory.Background,
            ProcessClassifier.Classify(new ProcessFacts(1000, "iCUE.exe", @"C:\Program Files\Corsair\iCUE.exe", false, false)));
}
