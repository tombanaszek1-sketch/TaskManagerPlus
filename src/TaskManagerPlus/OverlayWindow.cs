using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Monitoring;

namespace TaskManagerPlus;

/// <summary>
/// Small always-on-top bar of ring gauges docked to a screen edge. It is a click-through layered
/// window drawn with GDI+, so it needs no browser, no GPU work of its own and almost no memory.
/// It stays visible over games in windowed or borderless mode; exclusive fullscreen hides it.
/// </summary>
internal sealed partial class OverlayWindow : Form
{
    private const int WsExTopmost = 0x00000008;
    private const int WsExTransparent = 0x00000020;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExLayered = 0x00080000;
    private const int WsExNoActivate = 0x08000000;
    private const int UlwAlpha = 0x02;
    private const uint SwpNoSize = 0x0001;
    private const uint SwpNoMove = 0x0002;
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpNoOwnerZOrder = 0x0200;
    private static readonly nint HwndTopmost = -1;

    private static readonly Color Background = Color.FromArgb(214, 13, 14, 16);
    private static readonly Color Border = Color.FromArgb(34, 255, 255, 255);
    private static readonly Color Track = Color.FromArgb(40, 255, 255, 255);
    private static readonly Color Ink = Color.FromArgb(244, 244, 246);
    private static readonly Color Mute = Color.FromArgb(156, 156, 157);
    private static readonly Color Danger = Color.FromArgb(255, 97, 97);

    private static readonly Dictionary<string, Color> MetricColors = new()
    {
        ["cpu"] = Color.FromArgb(87, 193, 255),
        ["gpu"] = Color.FromArgb(89, 212, 153),
        ["ram"] = Color.FromArgb(255, 197, 51),
        ["disk"] = Color.FromArgb(211, 211, 212),
        ["net"] = Color.FromArgb(184, 243, 90),
    };

    private static readonly Dictionary<string, int> Diameters = new()
    {
        ["small"] = 30,
        ["medium"] = 38,
        ["large"] = 48,
    };

    private readonly MonitorEngine _engine;
    private AppSettings.OverlaySettings? _config;
    private Gauge[] _gauges = [];
    private bool _subscribed;

    /// <summary>One ring: fill from 0 to 1, the text in its center and the caption below it.</summary>
    private readonly record struct Gauge(string Metric, double? Fill, string Value, string Unit, string Caption, bool Alert);

    public OverlayWindow(MonitorEngine engine)
    {
        _engine = engine;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Text = "Task Manager+ Overlay";
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WsExLayered | WsExTransparent | WsExToolWindow | WsExNoActivate | WsExTopmost;
            return cp;
        }
    }

    protected override bool ShowWithoutActivation => true;

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        // The bar sizes itself for the monitor it is on; WinForms must not rescale it.
        e.Cancel = true;
        BeginInvoke(Render);
    }

    /// <summary>Shows, updates or hides the bar. Called on the UI thread whenever the settings change.</summary>
    public void Apply(AppSettings.OverlaySettings config)
    {
        _config = config;
        var active = config.Enabled && config.Metrics.Count > 0;
        if (active && !_subscribed)
        {
            _engine.SnapshotReady += OnSnapshot;
            SystemEvents.DisplaySettingsChanged += OnDisplaysChanged;
            _subscribed = true;
        }
        else if (!active && _subscribed)
        {
            _engine.SnapshotReady -= OnSnapshot;
            SystemEvents.DisplaySettingsChanged -= OnDisplaysChanged;
            _subscribed = false;
        }

        if (!active)
        {
            Hide();
            return;
        }

        _gauges = _engine.Latest is { } latest ? Measure(latest, config) : Placeholder(config);
        if (!Visible)
        {
            Show();
        }

        Render();
    }

    private void OnDisplaysChanged(object? sender, EventArgs e)
    {
        if (IsHandleCreated)
        {
            BeginInvoke(Render);
        }
    }

    private void OnSnapshot(Snapshot snapshot)
    {
        if (_config is not { } config || !IsHandleCreated)
        {
            return;
        }

        var gauges = Measure(snapshot, config);
        try
        {
            BeginInvoke(() =>
            {
                if (!Visible)
                {
                    return;
                }

                if (!gauges.SequenceEqual(_gauges))
                {
                    _gauges = gauges;
                    Render();
                }
                else
                {
                    // Games can raise their own window above other topmost windows; take the spot back.
                    SetWindowPos(Handle, HwndTopmost, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpNoActivate | SwpNoOwnerZOrder);
                }
            });
        }
        catch (InvalidOperationException)
        {
            // The window is being closed.
        }
    }

    private static Gauge[] Placeholder(AppSettings.OverlaySettings config) =>
        config.Metrics.Select(m => new Gauge(m.Id, null, "–", string.Empty, Caption(m), false)).ToArray();

    private static string Caption(AppSettings.OverlayMetric metric) => (metric.Id, metric.Show) switch
    {
        ("net", "ping") => "PING",
        ("net", _) => "NET",
        _ => metric.Id.ToUpperInvariant(),
    };

    private static Gauge[] Measure(Snapshot s, AppSettings.OverlaySettings config) =>
        config.Metrics.Select(m => Measure(s, m)).ToArray();

    private static Gauge Measure(Snapshot s, AppSettings.OverlayMetric metric)
    {
        var caption = Caption(metric);
        switch (metric.Id, metric.Show)
        {
            case (_, "temperature"):
                var temp = metric.Id switch
                {
                    "cpu" => Max(s.Cpus.Select(c => c.Temperature)),
                    "gpu" => Max(s.Gpus.Where(g => !g.IsIntegrated).Select(g => g.Temperature)) ?? Max(s.Gpus.Select(g => g.Temperature)),
                    "disk" => Max(s.Disks.Select(d => d.Temperature)),
                    _ => null,
                };
                return temp is { } t
                    ? new Gauge(metric.Id, t / 100, Round(t), "°", caption, t >= 90)
                    : new Gauge(metric.Id, null, "–", string.Empty, caption, false);

            case ("net", "ping"):
                return s.Latency.InternetMs is { } ms
                    ? new Gauge(metric.Id, ms / 150, Round(ms), "ms", caption, ms >= 150)
                    : new Gauge(metric.Id, null, "–", string.Empty, caption, false);

            case ("net", _):
                var adapters = s.Adapters.Where(a => a.IsUp && a.Kind != "Virtual").ToList();
                var bytes = adapters.Sum(a => a.ReceiveBytesPerSec + a.SendBytesPerSec);
                var link = adapters.Count == 0 ? 0 : adapters.Max(a => a.LinkSpeedBitsPerSec);
                var (value, unit) = Rate(bytes);
                return new Gauge(metric.Id, link > 0 ? bytes * 8 / link : 0, value, unit, caption, false);

            default:
                var load = metric.Id switch
                {
                    "cpu" => s.Cpus.Count == 0 ? 0 : s.Cpus.Average(c => c.Utilization),
                    "gpu" => s.Gpus.Count == 0 ? 0 : s.Gpus.Max(g => g.Utilization),
                    "ram" => s.Memory.Total == 0 ? 0 : s.Memory.Used * 100d / s.Memory.Total,
                    "disk" => s.Disks.Count == 0 ? 0 : s.Disks.Max(d => d.ActivePercent),
                    _ => 0,
                };
                return new Gauge(metric.Id, load / 100, Round(load), "%", caption, load >= 95);
        }
    }

    private static double? Max(IEnumerable<double?> values) => values.Max();

    private static string Round(double value) => Math.Round(Math.Max(0, value)).ToString("0", CultureInfo.InvariantCulture);

    /// <summary>Bytes per second in at most three digits: 850K, 1.2M, 34M.</summary>
    private static (string Value, string Unit) Rate(double bytesPerSec)
    {
        string[] units = ["B", "K", "M", "G"];
        var value = Math.Max(0, bytesPerSec);
        var index = 0;
        while (value >= 1000 && index < units.Length - 1)
        {
            value /= 1024;
            index++;
        }

        var text = value < 10 && index > 0 ? value.ToString("0.0", CultureInfo.InvariantCulture) : Math.Round(value).ToString("0", CultureInfo.InvariantCulture);
        return (text, units[index]);
    }

    private Screen TargetScreen() =>
        Screen.AllScreens.FirstOrDefault(s => s.DeviceName == _config?.Display) ?? Screen.PrimaryScreen ?? Screen.AllScreens[0];

    /// <summary>Lays the bar out for the configured edge and pushes a freshly drawn bitmap to the window.</summary>
    private void Render()
    {
        if (_config is not { } config || _gauges.Length == 0 || !IsHandleCreated)
        {
            return;
        }

        var screen = TargetScreen();
        var scale = ScaleOf(screen);
        var diameter = Diameters[config.Size] * scale;
        var captionSize = Math.Max(8f, diameter * 0.24f);
        var captionGap = diameter * 0.08f;
        var gap = diameter * 0.3f;
        var pad = diameter * 0.24f;
        var itemHeight = diameter + captionGap + captionSize * 1.25f;
        var horizontal = config.Edge == "top";
        var count = _gauges.Length;

        var width = (int)Math.Ceiling(horizontal ? pad * 2 + count * diameter + (count - 1) * gap : pad * 2 + diameter);
        var height = (int)Math.Ceiling(horizontal ? pad * 2 + itemHeight : pad * 2 + count * itemHeight + (count - 1) * gap);
        var area = screen.Bounds;
        var location = config.Edge switch
        {
            "left" => new Point(area.Left, area.Top + (area.Height - height) / 2),
            "right" => new Point(area.Right - width, area.Top + (area.Height - height) / 2),
            _ => new Point(area.Left + (area.Width - width) / 2, area.Top),
        };

        using var bitmap = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);
            DrawBackground(g, width, height, diameter * 0.34f, config.Edge);

            using var valueFont = new Font(FontName, diameter * 0.3f, FontStyle.Bold, GraphicsUnit.Pixel);
            using var unitFont = new Font(FontName, diameter * 0.17f, FontStyle.Bold, GraphicsUnit.Pixel);
            using var captionFont = new Font(FontName, captionSize, FontStyle.Bold, GraphicsUnit.Pixel);
            for (var i = 0; i < count; i++)
            {
                var x = horizontal ? pad + i * (diameter + gap) : pad;
                var y = horizontal ? pad : pad + i * (itemHeight + gap);
                DrawGauge(g, _gauges[i], new RectangleF(x, y, diameter, diameter), captionGap, valueFont, unitFont, captionFont);
            }
        }

        Push(bitmap, location);
    }

    private static void DrawBackground(Graphics g, int width, int height, float radius, string edge)
    {
        // The side touching the screen edge is pushed outside the bitmap so only the inner corners are round.
        var rect = new RectangleF(0.5f, 0.5f, width - 1, height - 1);
        var overhang = radius + 2;
        rect = edge switch
        {
            "left" => new RectangleF(rect.X - overhang, rect.Y, rect.Width + overhang, rect.Height),
            "right" => new RectangleF(rect.X, rect.Y, rect.Width + overhang, rect.Height),
            _ => new RectangleF(rect.X, rect.Y - overhang, rect.Width, rect.Height + overhang),
        };

        using var path = RoundedRectangle(rect, radius);
        using var fill = new SolidBrush(Background);
        using var border = new Pen(Border, 1);
        g.FillPath(fill, path);
        g.DrawPath(border, path);
    }

    private static void DrawGauge(Graphics g, Gauge gauge, RectangleF ring, float captionGap, Font valueFont, Font unitFont, Font captionFont)
    {
        var stroke = Math.Max(2f, ring.Width * 0.09f);
        var inset = RectangleF.Inflate(ring, -stroke / 2, -stroke / 2);
        using (var track = new Pen(Track, stroke))
        {
            g.DrawEllipse(track, inset);
        }

        var color = gauge.Alert ? Danger : MetricColors.GetValueOrDefault(gauge.Metric, Ink);
        if (gauge.Fill is { } fill && fill > 0.005)
        {
            using var arc = new Pen(color, stroke) { StartCap = LineCap.Round, EndCap = LineCap.Round };
            g.DrawArc(arc, inset, -90, (float)(Math.Min(1, fill) * 359.9));
        }

        // Value and unit are measured together and centered as one line inside the ring.
        using var centered = new StringFormat(StringFormat.GenericTypographic) { FormatFlags = StringFormatFlags.NoWrap };
        var valueSize = g.MeasureString(gauge.Value, valueFont, PointF.Empty, centered);
        var unitSize = gauge.Unit.Length == 0 ? SizeF.Empty : g.MeasureString(gauge.Unit, unitFont, PointF.Empty, centered);
        var maxWidth = inset.Width - stroke * 1.2f;
        var shrink = Math.Min(1f, maxWidth / Math.Max(1f, valueSize.Width + unitSize.Width));
        var state = g.Save();
        var cx = ring.X + ring.Width / 2;
        var cy = ring.Y + ring.Height / 2;
        g.TranslateTransform(cx, cy);
        g.ScaleTransform(shrink, shrink);
        var total = valueSize.Width + unitSize.Width;
        using (var ink = new SolidBrush(gauge.Fill is null ? Mute : Ink))
        {
            g.DrawString(gauge.Value, valueFont, ink, -total / 2, -valueSize.Height / 2, centered);
        }

        if (unitSize.Width > 0)
        {
            using var mute = new SolidBrush(Mute);
            g.DrawString(gauge.Unit, unitFont, mute, -total / 2 + valueSize.Width, -valueSize.Height / 2 + (valueSize.Height - unitSize.Height) * 0.2f, centered);
        }

        g.Restore(state);

        using var captionBrush = new SolidBrush(Mute);
        using var captionFormat = new StringFormat(StringFormat.GenericTypographic) { Alignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap };
        g.DrawString(gauge.Caption, captionFont, captionBrush, new RectangleF(ring.X - ring.Width, ring.Bottom + captionGap, ring.Width * 3, captionFont.Size * 1.4f), captionFormat);
    }

    private static GraphicsPath RoundedRectangle(RectangleF r, float radius)
    {
        var d = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static readonly string FontName = FontFamily.Families.Any(f => f.Name == "Segoe UI Variable Display") ? "Segoe UI Variable Display" : "Segoe UI";

    private static float ScaleOf(Screen screen)
    {
        var center = new NativePoint(screen.Bounds.Left + screen.Bounds.Width / 2, screen.Bounds.Top + screen.Bounds.Height / 2);
        var monitor = MonitorFromPoint(center, 2);
        return monitor != 0 && GetDpiForMonitor(monitor, 0, out var dpiX, out _) == 0 ? dpiX / 96f : 1f;
    }

    /// <summary>Hands the bitmap with its per-pixel alpha to the layered window and places it topmost.</summary>
    private void Push(Bitmap bitmap, Point location)
    {
        var screenDc = GetDC(0);
        var memoryDc = CreateCompatibleDC(screenDc);
        var hBitmap = bitmap.GetHbitmap(Color.FromArgb(0));
        var previous = SelectObject(memoryDc, hBitmap);
        try
        {
            var size = new NativeSize(bitmap.Width, bitmap.Height);
            var source = new NativePoint(0, 0);
            var target = new NativePoint(location.X, location.Y);
            var blend = new BlendFunction { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
            UpdateLayeredWindow(Handle, screenDc, ref target, ref size, memoryDc, ref source, 0, ref blend, UlwAlpha);
            SetWindowPos(Handle, HwndTopmost, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpNoActivate | SwpNoOwnerZOrder);
        }
        finally
        {
            SelectObject(memoryDc, previous);
            DeleteObject(hBitmap);
            DeleteDC(memoryDc);
            _ = ReleaseDC(0, screenDc);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && _subscribed)
        {
            _engine.SnapshotReady -= OnSnapshot;
            SystemEvents.DisplaySettingsChanged -= OnDisplaysChanged;
            _subscribed = false;
        }

        base.Dispose(disposing);
    }

    [StructLayout(LayoutKind.Sequential)]
    private record struct NativePoint(int X, int Y);

    [StructLayout(LayoutKind.Sequential)]
    private record struct NativeSize(int Cx, int Cy);

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct BlendFunction
    {
        public byte BlendOp;
        public byte BlendFlags;
        public byte SourceConstantAlpha;
        public byte AlphaFormat;
    }

    [LibraryImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool UpdateLayeredWindow(nint hwnd, nint hdcDst, ref NativePoint pptDst, ref NativeSize psize, nint hdcSrc, ref NativePoint pptSrc, int crKey, ref BlendFunction pblend, int dwFlags);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool SetWindowPos(nint hwnd, nint insertAfter, int x, int y, int cx, int cy, uint flags);

    [LibraryImport("user32.dll")]
    private static partial nint GetDC(nint hwnd);

    [LibraryImport("user32.dll")]
    private static partial int ReleaseDC(nint hwnd, nint hdc);

    [LibraryImport("user32.dll")]
    private static partial nint MonitorFromPoint(NativePoint pt, uint flags);

    [LibraryImport("shcore.dll")]
    private static partial int GetDpiForMonitor(nint monitor, int dpiType, out uint dpiX, out uint dpiY);

    [LibraryImport("gdi32.dll")]
    private static partial nint CreateCompatibleDC(nint hdc);

    [LibraryImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool DeleteDC(nint hdc);

    [LibraryImport("gdi32.dll")]
    private static partial nint SelectObject(nint hdc, nint obj);

    [LibraryImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool DeleteObject(nint obj);
}
