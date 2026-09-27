using System.Diagnostics;
using TaskManagerPlus.Core.Security;

namespace TaskManagerPlus;

/// <summary>
/// Starts the app at logon through a scheduled task with highest privileges. Unlike a Run key this
/// launches the elevated app without a UAC prompt on every logon.
/// </summary>
public static class StartupRegistration
{
    private const string TaskName = SelfIdentity.StartupTaskName;

    public static bool IsRegistered() => RunSchtasks($"/Query /TN \"{TaskName}\"") == 0;

    public static void Register()
    {
        var executable = Environment.ProcessPath ?? throw new InvalidOperationException("Executable path is unknown.");
        var exitCode = RunSchtasks($"/Create /F /TN \"{TaskName}\" /SC ONLOGON /RL HIGHEST /DELAY 0000:15 /TR \"\\\"{executable}\\\" --tray\"");
        if (exitCode != 0)
        {
            throw new InvalidOperationException($"Could not register the startup task (exit code {exitCode}).");
        }
    }

    /// <summary>
    /// Points an existing logon task at the executable that is running now, so moving or updating
    /// the app never leaves a stale autostart entry behind.
    /// </summary>
    public static void RefreshPath()
    {
        if (IsRegistered())
        {
            Register();
        }
    }

    public static void Unregister()
    {
        if (IsRegistered())
        {
            RunSchtasks($"/Delete /F /TN \"{TaskName}\"");
        }
    }

    private static int RunSchtasks(string arguments)
    {
        using var process = Process.Start(new ProcessStartInfo("schtasks.exe", arguments)
        {
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        })!;
        process.WaitForExit(10_000);
        return process.ExitCode;
    }
}
