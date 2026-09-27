using System.Collections.Concurrent;
using System.Drawing.Imaging;

namespace TaskManagerPlus.Bridge;

/// <summary>Extracts program icons as PNG data URLs so the web UI can show them next to process names.</summary>
internal static class IconCache
{
    private static readonly ConcurrentDictionary<string, string?> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static Dictionary<string, string?> Get(IEnumerable<string> paths)
    {
        var result = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in paths.Distinct(StringComparer.OrdinalIgnoreCase).Take(200))
        {
            result[path] = Cache.GetOrAdd(path, Extract);
        }

        return result;
    }

    private static string? Extract(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return null;
            }

            using var icon = Icon.ExtractAssociatedIcon(path);
            if (icon is null)
            {
                return null;
            }

            using var sized = new Icon(icon, 32, 32);
            using var bitmap = sized.ToBitmap();
            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
        }
        catch (Exception e) when (e is ArgumentException or IOException or UnauthorizedAccessException or System.ComponentModel.Win32Exception or System.Runtime.InteropServices.ExternalException)
        {
            return null;
        }
    }
}
