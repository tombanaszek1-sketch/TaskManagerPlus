using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Processes;

/// <summary>Facts about a process that decide which folder it belongs to.</summary>
public readonly record struct ProcessFacts(int Pid, string Name, string? Path, bool HasWindow, bool IsMicrosoftSigned);

public static class ProcessClassifier
{
    private static readonly string WindowsDirectory =
        Environment.GetFolderPath(Environment.SpecialFolder.Windows).TrimEnd('\\') + '\\';

    private static readonly string System32Directory =
        Environment.GetFolderPath(Environment.SpecialFolder.System).TrimEnd('\\') + '\\';

    /// <summary>Kernel pseudo processes that never expose an image path.</summary>
    private static readonly HashSet<string> KernelProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "System", "Registry", "Memory Compression", "Secure System", "Idle",
    };

    /// <summary>Terminating any of these crashes or destabilizes Windows.</summary>
    private static readonly HashSet<string> CriticalImages = new(StringComparer.OrdinalIgnoreCase)
    {
        "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe",
        "LsaIso.exe", "svchost.exe", "dwm.exe", "fontdrvhost.exe", "sihost.exe", "MsMpEng.exe",
    };

    private static readonly string[] WindowsComponentRoots =
    [
        @"C:\ProgramData\Microsoft\Windows Defender\",
        @"C:\Program Files\Windows Defender\",
        @"C:\Program Files\Common Files\microsoft shared\",
    ];

    /// <summary>True when the process is a real Windows core process that must never be terminated.</summary>
    public static bool IsCritical(int pid, string name, string? path)
    {
        if (pid is 0 or 4 || KernelProcesses.Contains(name))
        {
            return true;
        }

        if (!CriticalImages.Contains(name))
        {
            return false;
        }

        // A process that merely borrows a system name from another folder is not protected.
        return path is null || IsInDirectory(path, System32Directory) || IsInDirectory(path, WindowsComponentRoots[0]);
    }

    public static ProcessCategory Classify(in ProcessFacts facts)
    {
        if (IsCritical(facts.Pid, facts.Name, facts.Path))
        {
            return ProcessCategory.Windows;
        }

        if (facts.HasWindow)
        {
            return ProcessCategory.App;
        }

        if (facts.Path is null)
        {
            return ProcessCategory.Background;
        }

        var path = facts.Path;
        if (facts.IsMicrosoftSigned &&
            (IsInDirectory(path, WindowsDirectory) || Array.Exists(WindowsComponentRoots, root => IsInDirectory(path, root))))
        {
            return ProcessCategory.Windows;
        }

        return ProcessCategory.Background;
    }

    public static bool IsInDirectory(string path, string directory) =>
        path.StartsWith(directory, StringComparison.OrdinalIgnoreCase);

    /// <summary>A system image name found outside the Windows directory is a classic malware disguise.</summary>
    public static bool IsSystemNameOutsideSystemDirectory(string name, string? path) =>
        path is not null && CriticalImages.Contains(name) && !IsInDirectory(path, WindowsDirectory) &&
        !Array.Exists(WindowsComponentRoots, root => IsInDirectory(path, root));
}
