using System.Globalization;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Monitoring;

namespace TaskManagerPlus;

/// <summary>Notification area icon with a live usage tooltip and a small menu.</summary>
internal sealed class TrayController : IDisposable
{
    private readonly NotifyIcon _icon;
    private readonly MonitorEngine _engine;
    private readonly Control _owner;
    private DateTime _lastTooltip = DateTime.MinValue;

    public TrayController(Control owner, MonitorEngine engine, Action open, Action exit)
    {
        _owner = owner;
        _engine = engine;

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Task Manager+", null, (_, _) => open());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => exit());

        _icon = new NotifyIcon
        {
            Icon = LoadIcon(),
            Text = "Task Manager+",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _icon.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                open();
            }
        };

        _engine.SnapshotReady += OnSnapshot;
    }

    public static Icon LoadIcon()
    {
        using var stream = typeof(TrayController).Assembly.GetManifestResourceStream("TaskManagerPlus.app.ico");
        return stream is null ? SystemIcons.Application : new Icon(stream);
    }

    private void OnSnapshot(Snapshot snapshot)
    {
        if (DateTime.UtcNow - _lastTooltip < TimeSpan.FromSeconds(2) || !_owner.IsHandleCreated)
        {
            return;
        }

        _lastTooltip = DateTime.UtcNow;
        var text = Tooltip(snapshot);
        _owner.BeginInvoke(() => _icon.Text = text);
    }

    internal static string Tooltip(Snapshot snapshot)
    {
        var culture = CultureInfo.CurrentCulture;
        var cpu = snapshot.Cpus.Count == 0 ? 0 : snapshot.Cpus.Average(c => c.Utilization);
        var ram = snapshot.Memory.Total == 0 ? 0 : snapshot.Memory.Used * 100d / snapshot.Memory.Total;
        var gpu = snapshot.Gpus.Count == 0 ? 0 : snapshot.Gpus.Max(g => g.Utilization);
        var text = string.Format(culture, "Task Manager+\nCPU {0:0}%  RAM {1:0}%  GPU {2:0}%", cpu, ram, gpu);

        // NotifyIcon text is limited to 127 characters.
        return text.Length > 127 ? text[..127] : text;
    }

    public void Dispose()
    {
        _engine.SnapshotReady -= OnSnapshot;
        _icon.Visible = false;
        _icon.Dispose();
    }
}
