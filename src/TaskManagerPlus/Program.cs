using TaskManagerPlus.Core.Monitoring;

namespace TaskManagerPlus;

internal static class Program
{
    private const string InstanceMutexName = @"Local\TaskManagerPlus.Instance";
    private const string ShowEventName = @"Local\TaskManagerPlus.Show";

    /// <summary>
    /// Command line:
    ///   --tray               start hidden in the notification area
    ///   --dev-server &lt;url&gt;   load the UI from a development server instead of the bundled files
    /// </summary>
    [STAThread]
    private static void Main(string[] args)
    {
        using var mutex = new Mutex(initiallyOwned: true, InstanceMutexName, out var isFirstInstance);
        using var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
        if (!isFirstInstance)
        {
            // Bring the running instance to the front instead of starting a second monitor.
            showEvent.Set();
            return;
        }

        ApplicationConfiguration.Initialize();

        var settings = AppSettings.Load();
        var startHidden = args.Contains("--tray", StringComparer.OrdinalIgnoreCase) || settings.StartMinimized;
        var devServerIndex = Array.FindIndex(args, a => a.Equals("--dev-server", StringComparison.OrdinalIgnoreCase));
        var devServerUrl = devServerIndex >= 0 && devServerIndex + 1 < args.Length ? args[devServerIndex + 1] : null;

        using var engine = new MonitorEngine(new MonitorOptions
        {
            HistoryDatabasePath = Path.Combine(AppSettings.DataDirectory, "history.db"),
            RetentionDays = () => settings.RetentionDays,
        });
        engine.Interval = MainForm.TickInterval(settings, liveWindow: !startHidden);
        engine.SensorInterval = MainForm.SensorInterval(settings, liveWindow: !startHidden);
        engine.Start();

        if (settings.StartWithWindows)
        {
            _ = Task.Run(() =>
            {
                try
                {
                    StartupRegistration.RefreshPath();
                }
                catch (InvalidOperationException)
                {
                    // The existing task keeps working; it is refreshed again on the next start.
                }
            });
        }

        using var context = new TrayApplicationContext(engine, settings, devServerUrl, startHidden, showEvent);
        Application.Run(context);
    }

    private sealed class TrayApplicationContext : ApplicationContext
    {
        private readonly MainForm _form;
        private readonly TrayController _tray;
        private readonly RegisteredWaitHandle _showRegistration;

        public TrayApplicationContext(MonitorEngine engine, AppSettings settings, string? devServerUrl, bool startHidden, EventWaitHandle showEvent)
        {
            _form = new MainForm(engine, settings, devServerUrl);
            _form.ExitRequested += ExitThread;
            _ = _form.Handle;

            _tray = new TrayController(_form, engine, Open, _form.ExitApplication);
            _showRegistration = ThreadPool.RegisterWaitForSingleObject(
                showEvent,
                (_, _) => _form.BeginInvoke(Open),
                null,
                Timeout.Infinite,
                executeOnlyOnce: false);

            if (!startHidden)
            {
                Open();
            }
        }

        private async void Open()
        {
            try
            {
                await _form.ShowFromTrayAsync();
            }
            catch (Exception e) when (e is InvalidOperationException or System.Runtime.InteropServices.COMException)
            {
                MessageBox.Show(e.Message, "Task Manager+", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _showRegistration.Unregister(null);
                _tray.Dispose();
                _form.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
