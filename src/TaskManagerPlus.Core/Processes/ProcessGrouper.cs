namespace TaskManagerPlus.Core.Processes;

/// <summary>Minimal process description used to build application groups.</summary>
public readonly record struct GroupNode(int Pid, int ParentPid, long CreateTime, string Name, string? Path, bool IsWindows);

/// <summary>
/// Groups helper processes under the process that owns them, the way Task Manager folds
/// "Discord (6)" into one row. A child joins its parent when it runs the same image, lives in the
/// parent's install directory, or is a generic host (console, WebView2) spawned by a non-Windows parent.
/// </summary>
public static class ProcessGrouper
{
    private static readonly HashSet<string> HostImages = new(StringComparer.OrdinalIgnoreCase)
    {
        "conhost.exe", "msedgewebview2.exe", "crashpad_handler.exe", "CefSharp.BrowserSubprocess.exe",
    };

    private static readonly string WindowsDirectory =
        Environment.GetFolderPath(Environment.SpecialFolder.Windows).TrimEnd('\\') + '\\';

    /// <summary>Returns the group root pid for every pid.</summary>
    public static Dictionary<int, int> BuildGroups(IReadOnlyList<GroupNode> nodes)
    {
        var byPid = new Dictionary<int, GroupNode>(nodes.Count);
        foreach (var node in nodes)
        {
            byPid[node.Pid] = node;
        }

        var roots = new Dictionary<int, int>(nodes.Count);
        foreach (var node in nodes)
        {
            roots[node.Pid] = FindRoot(node, byPid, roots);
        }

        return roots;
    }

    private static int FindRoot(GroupNode node, Dictionary<int, GroupNode> byPid, Dictionary<int, int> cache)
    {
        var current = node;
        var depth = 0;
        while (depth++ < 64)
        {
            if (cache.TryGetValue(current.Pid, out var cached) && current.Pid != node.Pid)
            {
                return cached;
            }

            if (!byPid.TryGetValue(current.ParentPid, out var parent) ||
                parent.Pid == current.Pid ||
                parent.CreateTime > current.CreateTime ||
                !BelongsToParent(current, parent))
            {
                return current.Pid;
            }

            current = parent;
        }

        return current.Pid;
    }

    public static bool BelongsToParent(GroupNode child, GroupNode parent)
    {
        // Generic hosts (WebView2, console hosts) always belong to whoever started them, including
        // Windows components such as the search host.
        if (HostImages.Contains(child.Name) && !string.Equals(child.Name, parent.Name, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (child.IsWindows != parent.IsWindows)
        {
            return false;
        }

        if (string.Equals(child.Name, parent.Name, StringComparison.OrdinalIgnoreCase))
        {
            return !child.IsWindows || string.Equals(child.Path, parent.Path, StringComparison.OrdinalIgnoreCase);
        }

        if (parent.IsWindows)
        {
            return false;
        }

        if (parent.Path is null || child.Path is null)
        {
            return false;
        }

        // Inside the Windows directory only the very same folder counts, otherwise explorer.exe
        // would swallow every tool from System32.
        if (ProcessClassifier.IsInDirectory(parent.Path, WindowsDirectory))
        {
            return string.Equals(Path.GetDirectoryName(child.Path), Path.GetDirectoryName(parent.Path), StringComparison.OrdinalIgnoreCase);
        }

        var parentRoot = InstallRoot(parent.Path);
        return parentRoot is not null && child.Path.StartsWith(parentRoot, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Folder that identifies an installation: the directory of the image, widened to the product folder
    /// for images below "Program Files" so that e.g. Launcher\Portal and Launcher\Engine match.
    /// </summary>
    internal static string? InstallRoot(string? path)
    {
        var directory = Path.GetDirectoryName(path);
        if (directory is null)
        {
            return null;
        }

        var parts = directory.Split('\\');
        var programFilesIndex = Array.FindIndex(parts, p => p.StartsWith("Program Files", StringComparison.OrdinalIgnoreCase));
        if (programFilesIndex >= 0 && parts.Length > programFilesIndex + 2)
        {
            // e.g. C:\Program Files\Vendor\Product\...
            return string.Join('\\', parts.Take(programFilesIndex + 3)) + '\\';
        }

        return directory + '\\';
    }
}
