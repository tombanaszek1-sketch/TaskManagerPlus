namespace TaskManagerPlus.Core.Startup;

public static class ShortcutReader
{
    /// <summary>Resolves the target of a .lnk file through the Windows Script Host shell object.</summary>
    public static string? ResolveTarget(string shortcutPath)
    {
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type is null)
            {
                return null;
            }

            dynamic shell = Activator.CreateInstance(type)!;
            dynamic shortcut = shell.CreateShortcut(shortcutPath);
            string target = shortcut.TargetPath;
            return string.IsNullOrWhiteSpace(target) ? null : target;
        }
        catch (System.Runtime.InteropServices.COMException)
        {
            return null;
        }
    }
}
