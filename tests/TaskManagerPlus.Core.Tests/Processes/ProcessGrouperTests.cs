using TaskManagerPlus.Core.Processes;

namespace TaskManagerPlus.Core.Tests.Processes;

public class ProcessGrouperTests
{
    private const string DiscordPath = @"C:\Users\U\AppData\Local\Discord\app-1.0\Discord.exe";

    [Fact]
    public void Helpers_with_same_image_join_the_root()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(100, 50, 10, "explorer.exe", @"C:\Windows\explorer.exe", false),
            new(200, 100, 20, "Discord.exe", DiscordPath, false),
            new(201, 200, 21, "Discord.exe", DiscordPath, false),
            new(202, 201, 22, "Discord.exe", DiscordPath, false),
        ]);

        Assert.Equal(200, groups[200]);
        Assert.Equal(200, groups[201]);
        Assert.Equal(200, groups[202]);
        Assert.Equal(100, groups[100]);
    }

    [Fact]
    public void Apps_started_from_explorer_stay_separate()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(100, 50, 10, "explorer.exe", @"C:\Windows\explorer.exe", false),
            new(200, 100, 20, "Discord.exe", DiscordPath, false),
        ]);

        Assert.Equal(200, groups[200]);
    }

    [Fact]
    public void System32_tools_started_from_explorer_stay_separate()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(100, 50, 10, "explorer.exe", @"C:\Windows\explorer.exe", false),
            new(210, 100, 20, "notepad.exe", @"C:\Windows\System32\notepad.exe", false),
        ]);

        Assert.Equal(210, groups[210]);
    }

    [Fact]
    public void Same_vendor_folder_below_program_files_is_grouped()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(300, 1, 10, "EpicGamesLauncher.exe", @"C:\Program Files\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe", false),
            new(301, 300, 11, "EpicWebHelper.exe", @"C:\Program Files\Epic Games\Launcher\Engine\Binaries\Win64\EpicWebHelper.exe", false),
        ]);

        Assert.Equal(300, groups[301]);
    }

    [Fact]
    public void Webview_host_joins_its_app()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(400, 1, 10, "notes.exe", @"C:\Program Files\WindowsApps\Contoso.Notes\notes.exe", false),
            new(401, 400, 11, "msedgewebview2.exe", @"C:\Program Files (x86)\Microsoft\EdgeWebView\msedgewebview2.exe", false),
        ]);

        Assert.Equal(400, groups[401]);
    }

    [Fact]
    public void Reused_parent_pid_is_ignored()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(500, 1, 99, "Discord.exe", DiscordPath, false),
            new(501, 500, 10, "Discord.exe", DiscordPath, false),
        ]);

        Assert.Equal(501, groups[501]);
    }

    [Fact]
    public void Windows_processes_never_absorb_user_programs()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(600, 1, 10, "svchost.exe", @"C:\Windows\System32\svchost.exe", true),
            new(601, 600, 11, "tool.exe", @"C:\Tools\tool.exe", false),
        ]);

        Assert.Equal(601, groups[601]);
    }

    [Fact]
    public void Webview_host_joins_windows_component()
    {
        var groups = ProcessGrouper.BuildGroups(
        [
            new(700, 1, 10, "SearchHost.exe", @"C:\Windows\SystemApps\SearchHost.exe", true),
            new(701, 700, 11, "msedgewebview2.exe", @"C:\Program Files (x86)\Microsoft\EdgeWebView\msedgewebview2.exe", false),
            new(702, 701, 12, "msedgewebview2.exe", @"C:\Program Files (x86)\Microsoft\EdgeWebView\msedgewebview2.exe", false),
        ]);

        Assert.Equal(700, groups[701]);
        Assert.Equal(700, groups[702]);
    }
}
