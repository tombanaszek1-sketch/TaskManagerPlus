using System.Diagnostics;
using System.Management;
using System.Text.Json;
using TaskManagerPlus.Core.Monitoring;
using TaskManagerPlus.Core.Processes;
using TaskManagerPlus.Core.Services;

namespace TaskManagerPlus.Bridge;

public sealed class BridgeException(string message) : Exception(message);

/// <summary>Executes requests sent by the web UI. Every handler runs off the UI thread.</summary>
internal sealed class RequestRouter(MonitorEngine engine, AppSettings settings, Action<AppSettings> settingsChanged)
{
    private static readonly Dictionary<string, (int Seconds, int Bucket)> Ranges = new()
    {
        ["1h"] = (3600, 60),
        ["6h"] = (6 * 3600, 120),
        ["24h"] = (24 * 3600, 300),
        ["7d"] = (7 * 86400, 1800),
        ["30d"] = (30 * 86400, 7200),
    };

    public object? Handle(string action, JsonElement args) => action switch
    {
        "system.info" => new { info = engine.SystemInfo, traceFailure = engine.TraceFailure, sensorDriverBundled = SensorDriver.IsBundled },
        "sensors.installDriver" => InstallSensorDriver(),
        "process.kill" => Kill(args),
        "process.details" => Details(Int(args, "pid")),
        "process.openLocation" => OpenLocation(Str(args, "path")),
        "process.searchOnline" => SearchOnline(Str(args, "query")),
        "process.icons" => IconCache.Get(args.GetProperty("paths").EnumerateArray().Select(e => e.GetString()).OfType<string>()),
        "system.openSettings" => OpenSettings(Str(args, "page")),
        "autostart.list" => engine.Autostart.List(),
        "autostart.set" => SetAutostart(args),
        "services.list" => engine.Services.List(),
        "services.action" => ServiceAction(args),
        "services.startMode" => ServiceStartMode(args),
        "network.connections" => engine.Connections(),
        "history.query" => History(args),
        "history.top" => engine.History.TopProcesses(Str(args, "resource"), Long(args, "from"), Long(args, "to"), 10),
        "history.clear" => ClearHistory(),
        "settings.get" => settings,
        "settings.set" => UpdateSettings(args),
        "overlay.displays" => Screen.AllScreens.Select((s, i) => new { id = s.DeviceName, index = i + 1, primary = s.Primary, width = s.Bounds.Width, height = s.Bounds.Height }),
        _ => throw new BridgeException($"Unknown action '{action}'."),
    };

    private static object? Kill(JsonElement args)
    {
        var pids = args.TryGetProperty("pids", out var list)
            ? list.EnumerateArray().Select(e => e.GetInt32()).ToList()
            : [Int(args, "pid")];
        var tree = args.TryGetProperty("tree", out var t) && t.GetBoolean();

        var failures = new List<string>();
        foreach (var pid in pids)
        {
            try
            {
                ProcessTerminator.Terminate(pid, tree);
            }
            catch (ArgumentException)
            {
                // Already exited.
            }
            catch (Exception e) when (e is InvalidOperationException or System.ComponentModel.Win32Exception)
            {
                failures.Add(e.Message);
            }
        }

        if (failures.Count > 0 && failures.Count == pids.Count)
        {
            throw new BridgeException(failures[0]);
        }

        return new { terminated = pids.Count - failures.Count, failed = failures.Count };
    }

    private static object Details(int pid)
    {
        using var searcher = new ManagementObjectSearcher(
            $"SELECT CommandLine, ExecutablePath, Priority FROM Win32_Process WHERE ProcessId = {pid}");
        using var results = searcher.Get();
        foreach (ManagementObject item in results)
        {
            using (item)
            {
                string? owner = null;
                try
                {
                    var outParams = new object[2];
                    if (Convert.ToInt32(item.InvokeMethod("GetOwner", outParams)) == 0)
                    {
                        owner = outParams[1] is string domain && domain.Length > 0 ? $@"{domain}\{outParams[0]}" : outParams[0] as string;
                    }
                }
                catch (ManagementException)
                {
                }

                return new
                {
                    commandLine = item["CommandLine"] as string,
                    executablePath = item["ExecutablePath"] as string,
                    priority = Convert.ToInt32(item["Priority"] ?? 0),
                    owner,
                };
            }
        }

        throw new BridgeException("The process has exited.");
    }

    private static object? OpenLocation(string path)
    {
        if (!File.Exists(path))
        {
            throw new BridgeException("The file does not exist.");
        }

        Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
        return null;
    }

    private static object? SearchOnline(string query)
    {
        var url = "https://duckduckgo.com/?q=" + Uri.EscapeDataString(query + " process");
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        return null;
    }

    private object InstallSensorDriver()
    {
        var installed = SensorDriver.Install();
        if (installed)
        {
            engine.ReloadSensors();
        }

        return new { installed, info = engine.SystemInfo };
    }

    private static object? OpenSettings(string page)
    {
        var target = page switch
        {
            "network" => "ms-settings:network-status",
            "adapters" => "ncpa.cpl",
            "startup" => "ms-settings:startupapps",
            "services" => "services.msc",
            _ => throw new BridgeException($"Unknown settings page '{page}'."),
        };
        Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        return null;
    }

    private object? SetAutostart(JsonElement args)
    {
        engine.Autostart.SetEnabled(Str(args, "id"), args.GetProperty("enabled").GetBoolean());
        return null;
    }

    private object? ServiceAction(JsonElement args)
    {
        engine.Services.Execute(Str(args, "name"), Enum.Parse<ServiceAction>(Str(args, "action"), ignoreCase: true));
        return null;
    }

    private object? ServiceStartMode(JsonElement args)
    {
        engine.Services.SetStartMode(Str(args, "name"), Enum.Parse<ServiceStartMode>(Str(args, "mode"), ignoreCase: true));
        return null;
    }

    private object History(JsonElement args)
    {
        var range = args.TryGetProperty("range", out var r) ? r.GetString() ?? "1h" : "1h";
        if (!Ranges.TryGetValue(range, out var spec))
        {
            throw new BridgeException($"Unknown range '{range}'.");
        }

        var to = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var from = to - spec.Seconds;
        var metrics = engine.History.Metrics(from, to);
        return new
        {
            from,
            to,
            bucket = spec.Bucket,
            series = engine.History.Query(metrics, from, to, spec.Bucket),
        };
    }

    private object? ClearHistory()
    {
        engine.History.Clear();
        return null;
    }

    private object UpdateSettings(JsonElement args)
    {
        if (args.TryGetProperty("closeToTray", out var closeToTray))
        {
            settings.CloseToTray = closeToTray.GetBoolean();
        }

        if (args.TryGetProperty("startMinimized", out var startMinimized))
        {
            settings.StartMinimized = startMinimized.GetBoolean();
        }

        if (args.TryGetProperty("detailMode", out var detailMode))
        {
            settings.DetailMode = detailMode.GetBoolean();
        }

        if (args.TryGetProperty("retentionDays", out var retention))
        {
            settings.RetentionDays = Math.Clamp(retention.GetInt32(), 1, 365);
        }

        if (args.TryGetProperty("refreshIntervalMs", out var refresh))
        {
            settings.RefreshIntervalMs = Math.Clamp(refresh.GetInt32(), 250, 5000);
        }

        if (args.TryGetProperty("theme", out var theme) && theme.GetString() is "light" or "dark" or "system")
        {
            settings.Theme = theme.GetString()!;
        }

        if (args.TryGetProperty("performanceMode", out var performanceMode))
        {
            settings.PerformanceMode = performanceMode.GetBoolean();
        }

        if (args.TryGetProperty("overlay", out var overlay) && overlay.Deserialize<AppSettings.OverlaySettings>(BridgeJson.Options) is { } next)
        {
            settings.Overlay = next.Normalize();
        }

        if (args.TryGetProperty("startWithWindows", out var startWithWindows))
        {
            var enable = startWithWindows.GetBoolean();
            if (enable)
            {
                StartupRegistration.Register();
            }
            else
            {
                StartupRegistration.Unregister();
            }

            settings.StartWithWindows = enable;
        }

        settings.Save();
        settingsChanged(settings);
        return settings;
    }

    private static string Str(JsonElement args, string name) =>
        args.TryGetProperty(name, out var value) && value.GetString() is { Length: > 0 } s
            ? s
            : throw new BridgeException($"Missing argument '{name}'.");

    private static int Int(JsonElement args, string name) =>
        args.TryGetProperty(name, out var value) ? value.GetInt32() : throw new BridgeException($"Missing argument '{name}'.");

    private static long Long(JsonElement args, string name) =>
        args.TryGetProperty(name, out var value) ? value.GetInt64() : throw new BridgeException($"Missing argument '{name}'.");
}
