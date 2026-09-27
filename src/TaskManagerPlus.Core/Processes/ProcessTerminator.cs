using System.Diagnostics;

namespace TaskManagerPlus.Core.Processes;

public sealed class ProcessProtectedException(string name)
    : InvalidOperationException($"{name} is a core Windows process and cannot be terminated.");

public static class ProcessTerminator
{
    /// <summary>Terminates a process and optionally all of its descendants. Core Windows processes are refused.</summary>
    public static void Terminate(int pid, bool entireTree)
    {
        using var process = Process.GetProcessById(pid);
        var path = Interop.Kernel32.TryGetImagePath(pid);
        var name = process.ProcessName + ".exe";
        if (ProcessClassifier.IsCritical(pid, name, path) || ProcessClassifier.IsCritical(pid, process.ProcessName, path))
        {
            throw new ProcessProtectedException(process.ProcessName);
        }

        if (pid == Environment.ProcessId)
        {
            throw new InvalidOperationException("Task Manager+ cannot terminate itself.");
        }

        process.Kill(entireTree);
    }
}
