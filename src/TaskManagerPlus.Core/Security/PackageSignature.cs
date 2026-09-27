using System.Xml;
using System.Xml.Linq;

namespace TaskManagerPlus.Core.Security;

/// <summary>
/// Store (MSIX/APPX) apps are signed as a package, not per file. Windows only installs packages with a
/// valid signature into the protected WindowsApps folder, so the publisher from the manifest is trusted.
/// </summary>
public static class PackageSignature
{
    private static readonly string WindowsAppsRoot =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WindowsApps") + Path.DirectorySeparatorChar;

    public static bool IsPackaged(string path) => path.StartsWith(WindowsAppsRoot, StringComparison.OrdinalIgnoreCase);

    /// <summary>Returns the package publisher display name, or null when the manifest cannot be read.</summary>
    public static string? ReadPublisher(string path)
    {
        if (!IsPackaged(path))
        {
            return null;
        }

        var relative = path[WindowsAppsRoot.Length..];
        var separator = relative.IndexOf(Path.DirectorySeparatorChar);
        if (separator <= 0)
        {
            return null;
        }

        var manifest = Path.Combine(WindowsAppsRoot, relative[..separator], "AppxManifest.xml");
        try
        {
            var document = XDocument.Load(manifest);
            var displayName = document.Descendants().FirstOrDefault(e => e.Name.LocalName == "PublisherDisplayName")?.Value;
            if (!string.IsNullOrWhiteSpace(displayName) && !displayName.StartsWith("ms-resource:", StringComparison.OrdinalIgnoreCase))
            {
                return displayName.Trim();
            }

            var publisher = document.Descendants().FirstOrDefault(e => e.Name.LocalName == "Identity")?.Attribute("Publisher")?.Value;
            return publisher?.Split(',').FirstOrDefault(p => p.TrimStart().StartsWith("CN=", StringComparison.OrdinalIgnoreCase))?.Trim()[3..];
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or XmlException)
        {
            return null;
        }
    }
}
