using TaskManagerPlus.Core.Performance;

namespace TaskManagerPlus.Core.Tests.Performance;

public class GpuUsageAggregatorTests
{
    private const string Luid = "0x00000000_0x0000ec5d";

    private static KeyValuePair<string, double> Engine(int pid, int engine, string type, double value) =>
        new($"pid_{pid}_luid_{Luid}_phys_0_eng_{engine}_engtype_{type}", value);

    [Fact]
    public void Adapter_load_is_its_busiest_engine()
    {
        var usage = GpuUsageAggregator.Aggregate(
            [Engine(10, 0, "3D", 20), Engine(11, 0, "3D", 15), Engine(12, 5, "VideoDecode", 30)],
            [], [], [], []);

        var adapter = usage.Adapters[Luid];
        Assert.Equal(35, adapter.Engines["3D"], 3);
        Assert.Equal(30, adapter.Engines["Video Decode"], 3);
        Assert.Equal(35, adapter.Utilization, 3);
    }

    [Fact]
    public void Process_load_is_split_by_adapter_and_engine()
    {
        var usage = GpuUsageAggregator.Aggregate(
            [Engine(10, 0, "3D", 4), Engine(10, 1, "3D", 3), Engine(10, 5, "VideoDecode", 2)],
            [new($"pid_10_luid_{Luid}_phys_0", 1024)],
            [],
            [],
            []);

        var process = usage.Processes[10][Luid];
        Assert.Equal(7, process.Engines["3D"], 3);
        Assert.Equal(7, process.Utilization, 3);
        Assert.Equal(1024, process.DedicatedBytes);
    }

    [Fact]
    public void Engine_values_are_capped_at_100_percent()
    {
        var usage = GpuUsageAggregator.Aggregate([Engine(10, 0, "3D", 80), Engine(11, 0, "3D", 70)], [], [], [], []);

        Assert.Equal(100, usage.Adapters[Luid].Utilization, 3);
    }

    [Fact]
    public void Idle_processes_without_memory_are_omitted()
    {
        var usage = GpuUsageAggregator.Aggregate([Engine(10, 0, "3D", 0)], [], [], [], []);

        Assert.False(usage.Processes.ContainsKey(10));
    }

    [Fact]
    public void Adapter_memory_is_summed_per_luid()
    {
        var usage = GpuUsageAggregator.Aggregate(
            [],
            [],
            [],
            [new($"luid_{Luid}_phys_0", 2048), new($"luid_{Luid}_phys_1", 1024)],
            [new($"luid_{Luid}_phys_0", 512)]);

        Assert.Equal(3072, usage.Adapters[Luid].DedicatedUsed);
        Assert.Equal(512, usage.Adapters[Luid].SharedUsed);
    }
}
