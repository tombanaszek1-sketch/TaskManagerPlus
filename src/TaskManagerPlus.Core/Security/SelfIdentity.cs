namespace TaskManagerPlus.Core.Security;

/// <summary>
/// Recognizes the running Task Manager+ executable so the app never reports itself as a finding,
/// regardless of whether the build carries a code signature.
/// </summary>
public static class SelfIdentity
{
    /// <summary>Name of the scheduled task that starts the app at logon.</summary>
    public const string StartupTaskName = "Task Manager+";

    private static readonly string? ExecutablePath = Environment.ProcessPath;

    /// <summary>True for the app's own logon task, even when it still points at an older copy of the app.</summary>
    public static bool IsStartupTask(string taskPath) =>
        string.Equals(taskPath.TrimStart('\\'), StartupTaskName, StringComparison.OrdinalIgnoreCase);

    public static bool IsSelf(int pid, string? path) =>
        pid == Environment.ProcessId || IsSelfPath(path);

    public static bool IsSelfPath(string? path)
    {
        if (string.IsNullOrEmpty(path) || ExecutablePath is null)
        {
            return false;
        }

        try
        {
            return string.Equals(Path.GetFullPath(path), ExecutablePath, StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception e) when (e is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return false;
        }
    }
}
