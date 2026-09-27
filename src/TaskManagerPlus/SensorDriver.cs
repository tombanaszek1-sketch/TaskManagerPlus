using System.Diagnostics;
using TaskManagerPlus.Core.Hardware;

namespace TaskManagerPlus;

/// <summary>
/// CPU temperatures and mainboard sensors need the signed PawnIO driver (GPL-2.0,
/// https://github.com/namazso/PawnIO). Its official, unmodified installer ships inside this
/// executable so users never have to download anything separately.
/// </summary>
internal static class SensorDriver
{
    private const string ResourceName = "thirdparty/PawnIO_setup.exe";

    public static bool IsBundled =>
        typeof(SensorDriver).Assembly.GetManifestResourceInfo(ResourceName) is not null;

    /// <summary>Runs the bundled installer silently. Returns true when the driver is installed afterwards.</summary>
    public static bool Install()
    {
        if (SensorHub.DriverAvailable)
        {
            return true;
        }

        using var resource = typeof(SensorDriver).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException("This build does not include the sensor driver.");

        var directory = Path.Combine(Path.GetTempPath(), "TaskManagerPlus-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var setup = Path.Combine(directory, "PawnIO_setup.exe");
        try
        {
            using (var file = File.Create(setup))
            {
                resource.CopyTo(file);
            }

            using var process = Process.Start(new ProcessStartInfo(setup, "-install -silent")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
            }) ?? throw new InvalidOperationException("The sensor driver installer could not be started.");

            if (!process.WaitForExit(TimeSpan.FromMinutes(2)))
            {
                process.Kill();
                throw new InvalidOperationException("The sensor driver installer did not finish in time.");
            }
        }
        finally
        {
            try
            {
                Directory.Delete(directory, recursive: true);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // Temporary folder; Windows cleans it up eventually.
            }
        }

        return SensorHub.DriverAvailable;
    }
}
