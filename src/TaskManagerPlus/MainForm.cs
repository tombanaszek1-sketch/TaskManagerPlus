using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using TaskManagerPlus.Bridge;
using TaskManagerPlus.Core.Monitoring;

namespace TaskManagerPlus;

/// <summary>
/// Hosts the web UI. When closed to the tray the WebView2 instance is destroyed so the app only keeps
/// the lightweight monitor running; it is recreated when the window is shown again.
/// </summary>
internal sealed class MainForm : Form
{
    private const string VirtualHost = "app.taskmanagerplus";
    private static readonly Color DarkBackground = Color.FromArgb(13, 14, 16);
    private static readonly Color LightBackground = Color.FromArgb(246, 246, 243);

    private readonly MonitorEngine _engine;
    private readonly AppSettings _settings;
    private readonly RequestRouter _router;
    private static readonly TimeSpan PerformanceTick = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Browser switches for performance mode: software rendering without a GPU process and a single
    /// renderer. A separate profile folder lets the browser restart with them while the old one exits.
    /// </summary>
    private const string PerformanceBrowserArguments =
        "--disable-gpu --disable-gpu-compositing --disable-software-rasterizer --in-process-gpu " +
        "--renderer-process-limit=1 --disable-background-networking";

    private readonly string? _devServerUrl;
    private readonly OverlayWindow _overlay;
    private CoreWebView2Environment? _environment;
    private bool _environmentLite;
    private WebView2? _webView;
    private WebBridge? _bridge;
    private bool _exiting;
    private bool _foreground;

    public MainForm(MonitorEngine engine, AppSettings settings, string? devServerUrl)
    {
        _engine = engine;
        _settings = settings;
        _devServerUrl = devServerUrl;
        _router = new RequestRouter(engine, settings, OnSettingsChanged);
        _overlay = new OverlayWindow(engine);

        Text = "Task Manager+";
        Icon = TrayController.LoadIcon();
        MinimumSize = new Size(760, 520);
        BackColor = DarkBackground;
        StartPosition = FormStartPosition.Manual;
        RestorePlacement();
    }

    public event Action? ExitRequested;

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        WindowTheme.ApplyTheme(Handle, dark: true, DarkBackground);
        _overlay.Apply(_settings.Overlay);
    }

    public async Task ShowFromTrayAsync()
    {
        if (!Visible)
        {
            Show();
        }

        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = _settings.Window?.Maximized == true ? FormWindowState.Maximized : FormWindowState.Normal;
        }

        Activate();
        SetForeground(true);
        await EnsureWebViewAsync();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (Visible)
        {
            SetForeground(WindowState != FormWindowState.Minimized);
        }
    }

    /// <summary>Time between monitor ticks for the given settings and window state.</summary>
    public static TimeSpan TickInterval(AppSettings settings, bool liveWindow)
    {
        var interval = liveWindow ? TimeSpan.FromMilliseconds(settings.RefreshIntervalMs)
            : settings.Overlay.Enabled ? TimeSpan.FromSeconds(1)
            : TimeSpan.FromSeconds(2);
        return settings.PerformanceMode && interval < PerformanceTick ? PerformanceTick : interval;
    }

    /// <summary>Time between hardware sensor updates; slow while neither the window nor the overlay shows them.</summary>
    public static TimeSpan SensorInterval(AppSettings settings, bool liveWindow) =>
        !liveWindow && !settings.Overlay.Enabled ? TimeSpan.FromSeconds(10)
        : settings.PerformanceMode ? TimeSpan.FromSeconds(5)
        : TimeSpan.FromSeconds(2);

    private void ApplyCadence()
    {
        _engine.Interval = TickInterval(_settings, _foreground);
        _engine.SensorInterval = SensorInterval(_settings, _foreground);
    }

    /// <summary>
    /// While minimized or in the tray nothing shows live data: the page stops receiving snapshots,
    /// WebView2 throttles its rendering, and the monitor slows down.
    /// </summary>
    private void SetForeground(bool foreground)
    {
        _foreground = foreground;
        ApplyCadence();
        if (_bridge is not null)
        {
            _bridge.Paused = !foreground;
        }

        if (_webView is not null)
        {
            _webView.Visible = foreground;
        }
    }

    public void ExitApplication()
    {
        _exiting = true;
        Close();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        SavePlacement();
        if (!_exiting && _settings.CloseToTray && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            HideToTray();
            return;
        }

        DestroyWebView();
        _overlay.Dispose();
        base.OnFormClosing(e);
        ExitRequested?.Invoke();
    }

    private void HideToTray()
    {
        Hide();
        DestroyWebView();
        SetForeground(false);
    }

    private async Task EnsureWebViewAsync(string? startView = null)
    {
        if (_webView is not null)
        {
            return;
        }

        try
        {
            var lite = _settings.PerformanceMode;
            if (_environment is null || _environmentLite != lite)
            {
                _environmentLite = lite;
                _environment = await CoreWebView2Environment.CreateAsync(
                    browserExecutableFolder: null,
                    userDataFolder: Path.Combine(AppSettings.DataDirectory, lite ? "WebView2-Lite" : "WebView2"),
                    options: lite ? new CoreWebView2EnvironmentOptions(PerformanceBrowserArguments) : null);
            }
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                this,
                "Task Manager+ needs the Microsoft Edge WebView2 Runtime, which is part of Windows 11. " +
                "Install it from https://developer.microsoft.com/microsoft-edge/webview2/ and start the app again.",
                "WebView2 Runtime missing",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            ExitApplication();
            return;
        }

        var webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = BackColor,
        };
        _webView = webView;
        Controls.Add(webView);
        await webView.EnsureCoreWebView2Async(_environment);
        if (_webView != webView)
        {
            return;
        }

        var core = webView.CoreWebView2;
        var debug = _devServerUrl is not null || Debugger.IsAttached;
        core.Settings.AreDevToolsEnabled = debug;
        core.Settings.AreBrowserAcceleratorKeysEnabled = debug;
        core.Settings.AreDefaultContextMenusEnabled = debug;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.NewWindowRequested += (_, args) =>
        {
            args.Handled = true;
            OpenExternal(args.Uri);
        };
        core.NavigationStarting += (_, args) =>
        {
            if (!IsAppUri(args.Uri))
            {
                args.Cancel = true;
                OpenExternal(args.Uri);
            }
        };
        core.WebMessageReceived += OnPageMessage;

        var uiFolder = UiAssets.EnsureExtracted();
        core.SetVirtualHostNameToFolderMapping(VirtualHost, uiFolder, CoreWebView2HostResourceAccessKind.Deny);

        _bridge = new WebBridge(this, core, _engine, _router);
        var hash = startView is null ? string.Empty : "#" + startView;
        core.Navigate((_devServerUrl ?? $"https://{VirtualHost}/index.html") + hash);
    }

    private bool IsAppUri(string uri) =>
        uri.StartsWith($"https://{VirtualHost}/", StringComparison.OrdinalIgnoreCase) ||
        (_devServerUrl is not null && uri.StartsWith(_devServerUrl, StringComparison.OrdinalIgnoreCase)) ||
        uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase);

    private void OnPageMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // The page reports its effective theme so the native title bar can follow it.
        if (e.WebMessageAsJson.Contains("\"type\":\"theme\"", StringComparison.Ordinal))
        {
            var dark = e.WebMessageAsJson.Contains("\"dark\":true", StringComparison.Ordinal);
            BackColor = dark ? DarkBackground : LightBackground;
            if (_webView is not null)
            {
                _webView.DefaultBackgroundColor = BackColor;
            }

            WindowTheme.ApplyTheme(Handle, dark, BackColor);
        }
    }

    private static void OpenExternal(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && parsed.Scheme is "https" or "http")
        {
            Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true });
        }
    }

    private void DestroyWebView()
    {
        _bridge?.Dispose();
        _bridge = null;
        if (_webView is not null)
        {
            Controls.Remove(_webView);
            _webView.Dispose();
            _webView = null;
        }
    }

    private void OnSettingsChanged(AppSettings settings)
    {
        if (IsHandleCreated)
        {
            BeginInvoke(async () =>
            {
                ApplyCadence();
                _overlay.Apply(settings.Overlay);

                // Browser switches only apply to a new browser process, so the page is reloaded once.
                if (_webView is not null && _environmentLite != settings.PerformanceMode)
                {
                    DestroyWebView();
                    await EnsureWebViewAsync(startView: "settings");
                }
            });
        }
    }

    private void RestorePlacement()
    {
        var placement = _settings.Window;
        var bounds = placement is null ? Rectangle.Empty : new Rectangle(placement.X, placement.Y, placement.Width, placement.Height);
        var visible = Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(bounds));
        if (placement is null || !visible || bounds.Width < MinimumSize.Width || bounds.Height < MinimumSize.Height)
        {
            var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1600, 1000);
            var size = new Size(Math.Min(1440, area.Width - 80), Math.Min(900, area.Height - 80));
            Bounds = new Rectangle(area.X + (area.Width - size.Width) / 2, area.Y + (area.Height - size.Height) / 2, size.Width, size.Height);
            return;
        }

        Bounds = bounds;
        if (placement.Maximized)
        {
            WindowState = FormWindowState.Maximized;
        }
    }

    private void SavePlacement()
    {
        if (!Visible || WindowState == FormWindowState.Minimized)
        {
            return;
        }

        var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        _settings.Window = new AppSettings.WindowPlacement(bounds.X, bounds.Y, bounds.Width, bounds.Height, WindowState == FormWindowState.Maximized);
        try
        {
            _settings.Save();
        }
        catch (IOException)
        {
        }
    }
}
