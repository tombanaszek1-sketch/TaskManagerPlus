using System.Text.Json;
using System.Text.Json.Serialization;

namespace TaskManagerPlus;

/// <summary>User preferences, persisted as JSON in the local application data folder.</summary>
public sealed class AppSettings
{
    public static readonly string DataDirectory =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TaskManagerPlus");

    private static readonly string FilePath = Path.Combine(DataDirectory, "settings.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public bool CloseToTray { get; set; } = true;

    public bool StartWithWindows { get; set; }

    public bool StartMinimized { get; set; }

    public bool DetailMode { get; set; }

    public int RetentionDays { get; set; } = 30;

    public int RefreshIntervalMs { get; set; } = 1000;

    public string Theme { get; set; } = "system";

    /// <summary>Renders the window without the GPU and slows down collection to use as little as possible.</summary>
    public bool PerformanceMode { get; set; }

    public OverlaySettings Overlay { get; set; } = new();

    public WindowPlacement? Window { get; set; }

    public sealed record WindowPlacement(int X, int Y, int Width, int Height, bool Maximized);

    /// <summary>The always-on-top gauge bar docked to a screen edge.</summary>
    public sealed class OverlaySettings
    {
        /// <summary>Metric ids and the values each one can show; the first value is the default.</summary>
        public static readonly IReadOnlyDictionary<string, string[]> MetricModes = new Dictionary<string, string[]>
        {
            ["cpu"] = ["load", "temperature"],
            ["gpu"] = ["load", "temperature"],
            ["ram"] = ["load"],
            ["disk"] = ["load", "temperature"],
            ["net"] = ["traffic", "ping"],
        };

        public bool Enabled { get; set; }

        /// <summary>top, left or right.</summary>
        public string Edge { get; set; } = "top";

        /// <summary>small, medium or large.</summary>
        public string Size { get; set; } = "small";

        /// <summary>Device name of the display; null means the primary display.</summary>
        public string? Display { get; set; }

        public List<OverlayMetric> Metrics { get; set; } = [new("cpu", "load"), new("gpu", "load"), new("ram", "load")];

        public OverlaySettings Normalize()
        {
            Edge = Edge is "left" or "right" ? Edge : "top";
            Size = Size is "medium" or "large" ? Size : "small";
            Display = string.IsNullOrWhiteSpace(Display) ? null : Display;
            Metrics = (Metrics ?? [])
                .Where(m => m?.Id is not null && MetricModes.ContainsKey(m.Id))
                .DistinctBy(m => m.Id)
                .Select(m => MetricModes[m.Id].Contains(m.Show) ? m : m with { Show = MetricModes[m.Id][0] })
                .ToList();
            return this;
        }
    }

    public sealed record OverlayMetric(string Id, string Show);

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath), JsonOptions)?.Normalize() ?? new AppSettings();
            }
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            // A corrupt settings file falls back to defaults instead of blocking the app.
        }

        return new AppSettings();
    }

    public void Save()
    {
        Directory.CreateDirectory(DataDirectory);
        var temp = FilePath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(this, JsonOptions));
        File.Move(temp, FilePath, overwrite: true);
    }

    private AppSettings Normalize()
    {
        RetentionDays = Math.Clamp(RetentionDays, 1, 365);
        RefreshIntervalMs = Math.Clamp(RefreshIntervalMs, 250, 5000);
        Theme = Theme is "light" or "dark" ? Theme : "system";
        Overlay = (Overlay ?? new OverlaySettings()).Normalize();
        return this;
    }
}
