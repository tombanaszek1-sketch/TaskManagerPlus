using TaskManagerPlus.Core.Security;

namespace TaskManagerPlus.Core.Tests.Security;

public class SelfIdentityTests
{
    [Fact]
    public void Own_process_id_is_self() => Assert.True(SelfIdentity.IsSelf(Environment.ProcessId, null));

    [Fact]
    public void Own_executable_path_is_self() => Assert.True(SelfIdentity.IsSelfPath(Environment.ProcessPath));

    [Theory]
    [InlineData(@"\Task Manager+", true)]
    [InlineData("Task Manager+", true)]
    [InlineData(@"\Vendor\Task Manager+ Updater", false)]
    public void Recognizes_own_logon_task(string taskPath, bool expected) =>
        Assert.Equal(expected, SelfIdentity.IsStartupTask(taskPath));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(@"C:\Windows\System32\notepad.exe")]
    public void Other_paths_are_not_self(string? path) => Assert.False(SelfIdentity.IsSelfPath(path));
}
