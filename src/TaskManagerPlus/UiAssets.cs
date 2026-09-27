using System.Reflection;

namespace TaskManagerPlus;

/// <summary>
/// The web UI ships inside the executable as embedded resources. On start it is unpacked once per
/// build into the local data folder, where WebView2 serves it from a virtual host.
/// </summary>
internal static class UiAssets
{
    private const string Prefix = "ui/";
    private const string Marker = ".complete";

    /// <summary>Returns the folder that contains index.html, unpacking the embedded files if needed.</summary>
    public static string EnsureExtracted()
    {
        var assembly = typeof(UiAssets).Assembly;
        var buildId = assembly.ManifestModule.ModuleVersionId.ToString("N")[..12];
        var root = Path.Combine(AppSettings.DataDirectory, "ui");
        var target = Path.Combine(root, buildId);

        if (!File.Exists(Path.Combine(target, Marker)))
        {
            Extract(assembly, target);
        }

        RemoveOldBuilds(root, target);
        return target;
    }

    private static void Extract(Assembly assembly, string target)
    {
        if (Directory.Exists(target))
        {
            Directory.Delete(target, recursive: true);
        }

        var names = assembly.GetManifestResourceNames().Where(n => n.StartsWith(Prefix, StringComparison.Ordinal)).ToList();
        if (names.Count == 0)
        {
            throw new InvalidOperationException("The user interface is missing from this build. Build the ui folder before the app.");
        }

        foreach (var name in names)
        {
            var relative = name[Prefix.Length..].Replace('\\', Path.DirectorySeparatorChar).Replace('/', Path.DirectorySeparatorChar);
            var path = Path.GetFullPath(Path.Combine(target, relative));
            if (!path.StartsWith(target, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var source = assembly.GetManifestResourceStream(name)!;
            using var file = File.Create(path);
            source.CopyTo(file);
        }

        File.WriteAllText(Path.Combine(target, Marker), DateTime.UtcNow.ToString("O"));
    }

    private static void RemoveOldBuilds(string root, string current)
    {
        foreach (var directory in Directory.EnumerateDirectories(root))
        {
            if (string.Equals(directory, current, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            try
            {
                Directory.Delete(directory, recursive: true);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // Still in use by another WebView instance; it is removed on a later start.
            }
        }
    }
}
