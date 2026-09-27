using LibreHardwareMonitor.Hardware;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Hardware;

public enum HardwareKind
{
    Cpu,
    Gpu,
    Memory,
    Storage,
    Motherboard,
    Other,
}

/// <summary>All sensors of one hardware component, including its sub-components (e.g. Super I/O chips).</summary>
public sealed record HardwareSensors(string Identifier, HardwareKind Kind, string Name, IReadOnlyList<SensorReading> Sensors);

/// <summary>
/// Wraps LibreHardwareMonitor. Temperatures of some CPUs and mainboard sensors need the optional
/// PawnIO driver; everything else (GPU, storage, memory load) works without it.
/// </summary>
public sealed class SensorHub : IDisposable
{
    private readonly Computer _computer;
    private readonly object _gate = new();
    private readonly CancellationTokenSource _cts = new();
    private readonly AutoResetEvent _wake = new(false);
    private volatile IReadOnlyList<HardwareSensors> _latest = [];
    private Thread? _thread;
    private TimeSpan _interval = TimeSpan.FromSeconds(2);

    public SensorHub()
    {
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsStorageEnabled = true,
            IsMotherboardEnabled = true,
        };

        try
        {
            _computer.Open();
        }
        catch (Exception)
        {
            // A single failing sensor provider must not stop the monitor.
        }
    }

    public static bool DriverAvailable
    {
        get
        {
            try
            {
                return LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }

    /// <summary>
    /// Re-detects all hardware. Needed after the sensor driver was installed while the app runs,
    /// because drivers are only probed when the hardware monitor opens.
    /// </summary>
    public void Reopen()
    {
        lock (_gate)
        {
            try
            {
                _computer.Close();
                _computer.Open();
            }
            catch (Exception)
            {
                // Keep running with whatever hardware could be opened.
            }
        }

        _wake.Set();
    }

    /// <summary>The readings of the most recent background update.</summary>
    public IReadOnlyList<HardwareSensors> Latest => _latest;

    /// <summary>
    /// Time between sensor updates. Some drivers are slow (an NVIDIA query can take ~80 ms), so
    /// sensors refresh on their own thread and slower than the main tick.
    /// </summary>
    public TimeSpan Interval
    {
        get => _interval;
        set
        {
            var faster = value < _interval;
            _interval = value;
            if (faster)
            {
                _wake.Set();
            }
        }
    }

    public void Start()
    {
        _thread = new Thread(Run) { IsBackground = true, Name = "Sensors", Priority = ThreadPriority.BelowNormal };
        _thread.Start();
    }

    private void Run()
    {
        var token = _cts.Token;
        while (!token.IsCancellationRequested)
        {
            _latest = Update();
            WaitHandle.WaitAny([token.WaitHandle, _wake], _interval);
        }
    }

    public IReadOnlyList<HardwareSensors> Update()
    {
        lock (_gate)
        {
            var result = new List<HardwareSensors>();
            foreach (var hardware in _computer.Hardware)
            {
                try
                {
                    hardware.Update();
                    var sensors = new List<SensorReading>();
                    Collect(hardware, sensors, prefix: null);
                    result.Add(new HardwareSensors(hardware.Identifier.ToString(), Kind(hardware.HardwareType), hardware.Name, sensors));
                }
                catch (Exception)
                {
                    // Skip hardware whose driver misbehaves during this tick.
                }
            }

            return result;
        }
    }

    private static void Collect(IHardware hardware, List<SensorReading> sensors, string? prefix)
    {
        foreach (var sensor in hardware.Sensors)
        {
            var name = prefix is null ? sensor.Name : $"{prefix} / {sensor.Name}";
            var kind = Kind(sensor.SensorType);
            var value = Clean(sensor.Value);

            // Without the optional driver some temperature sensors exist but report 0; treat them as unavailable.
            if (kind == SensorKind.Temperature && value is <= 0)
            {
                value = null;
            }

            sensors.Add(new SensorReading(name, kind, value, Clean(sensor.Min), Clean(sensor.Max)));
        }

        foreach (var sub in hardware.SubHardware)
        {
            sub.Update();
            Collect(sub, sensors, sub.Name);
        }
    }

    private static double? Clean(float? value) =>
        value is null || float.IsNaN(value.Value) || float.IsInfinity(value.Value) ? null : Math.Round(value.Value, 2);

    private static HardwareKind Kind(HardwareType type) => type switch
    {
        HardwareType.Cpu => HardwareKind.Cpu,
        HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel => HardwareKind.Gpu,
        HardwareType.Memory => HardwareKind.Memory,
        HardwareType.Storage => HardwareKind.Storage,
        HardwareType.Motherboard => HardwareKind.Motherboard,
        _ => HardwareKind.Other,
    };

    private static SensorKind Kind(SensorType type) => type.ToString() switch
    {
        "Load" => SensorKind.Load,
        "Temperature" => SensorKind.Temperature,
        "Clock" => SensorKind.Clock,
        "Power" => SensorKind.Power,
        "Voltage" => SensorKind.Voltage,
        "Current" => SensorKind.Current,
        "Fan" => SensorKind.Fan,
        "Control" => SensorKind.Control,
        "Data" => SensorKind.Data,
        "SmallData" => SensorKind.SmallData,
        "Throughput" => SensorKind.Throughput,
        "Level" => SensorKind.Level,
        "Factor" => SensorKind.Factor,
        "Energy" => SensorKind.Energy,
        "Frequency" => SensorKind.Frequency,
        _ => SensorKind.Other,
    };

    public void Dispose()
    {
        _cts.Cancel();
        _thread?.Join(TimeSpan.FromSeconds(2));
        _cts.Dispose();
        _wake.Dispose();
        lock (_gate)
        {
            _computer.Close();
        }
    }
}
