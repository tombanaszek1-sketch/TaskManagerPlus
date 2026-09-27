namespace TaskManagerPlus.Core.Startup;

public static class CommandLine
{
    private static readonly string[] ExecutableExtensions = [".exe", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".dll", ".lnk", ".msc"];

    /// <summary>
    /// Extracts the program path from a command line such as
    /// <c>"C:\Program Files\App\app.exe" --silent</c> or <c>C:\Tools\app.exe /tray</c>.
    /// Environment variables are expanded; returns null when no path can be found.
    /// </summary>
    public static string? ExtractImagePath(string? command)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            return null;
        }

        var text = Environment.ExpandEnvironmentVariables(command.Trim());

        if (text.StartsWith('"'))
        {
            var end = text.IndexOf('"', 1);
            return end > 1 ? Normalize(text[1..end]) : null;
        }

        foreach (var extension in ExecutableExtensions)
        {
            var index = text.IndexOf(extension, StringComparison.OrdinalIgnoreCase);
            while (index >= 0)
            {
                var endIndex = index + extension.Length;
                if (endIndex == text.Length || char.IsWhiteSpace(text[endIndex]) || text[endIndex] == ',')
                {
                    return Normalize(text[..endIndex]);
                }

                index = text.IndexOf(extension, endIndex, StringComparison.OrdinalIgnoreCase);
            }
        }

        var space = text.IndexOf(' ');
        return Normalize(space < 0 ? text : text[..space]);
    }

    private static string Normalize(string path)
    {
        var trimmed = path.Trim().Trim('"');
        if (trimmed.StartsWith(@"\??\", StringComparison.Ordinal))
        {
            trimmed = trimmed[4..];
        }

        if (trimmed.StartsWith(@"\SystemRoot\", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), trimmed[12..]);
        }
        else if (trimmed.StartsWith(@"system32\", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), trimmed);
        }

        return trimmed;
    }
}
