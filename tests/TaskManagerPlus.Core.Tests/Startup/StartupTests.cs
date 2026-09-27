using TaskManagerPlus.Core.Startup;

namespace TaskManagerPlus.Core.Tests.Startup;

public class StartupTests
{
    [Theory]
    [InlineData("\"C:\\Program Files\\App\\app.exe\" --silent", @"C:\Program Files\App\app.exe")]
    [InlineData(@"C:\Tools\tray.exe /background", @"C:\Tools\tray.exe")]
    [InlineData(@"C:\Program Files\My App\app.exe -autostart", @"C:\Program Files\My App\app.exe")]
    [InlineData(@"\??\C:\Windows\system32\drivers\x.sys", @"C:\Windows\system32\drivers\x.sys")]
    [InlineData(@"rundll32.exe shell32.dll,Control_RunDLL", "rundll32.exe")]
    public void Extracts_image_path(string command, string expected) =>
        Assert.Equal(expected, CommandLine.ExtractImagePath(command), ignoreCase: true);

    [Fact]
    public void Expands_environment_variables() =>
        Assert.Equal(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "system32", "SecurityHealthSystray.exe"),
            CommandLine.ExtractImagePath(@"%windir%\system32\SecurityHealthSystray.exe"),
            ignoreCase: true);

    [Fact]
    public void Missing_approval_value_means_enabled() => Assert.True(StartupApproval.IsEnabled(null));

    [Theory]
    [InlineData(0x02, true)]
    [InlineData(0x06, true)]
    [InlineData(0x03, false)]
    [InlineData(0x07, false)]
    public void Reads_approval_flag(byte first, bool expected) =>
        Assert.Equal(expected, StartupApproval.IsEnabled([first, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

    [Fact]
    public void Encodes_round_trip()
    {
        var now = new DateTime(2026, 9, 25, 12, 0, 0, DateTimeKind.Utc);

        Assert.True(StartupApproval.IsEnabled(StartupApproval.Encode(true, now)));
        var disabled = StartupApproval.Encode(false, now);
        Assert.False(StartupApproval.IsEnabled(disabled));
        Assert.Equal(now.ToFileTimeUtc(), BitConverter.ToInt64(disabled, 4));
    }
}
