using TaskManagerPlus.Core.Performance;

namespace TaskManagerPlus.Core.Tests.Performance;

public class SystemCountersTests
{
    [Fact]
    public void Disk_instances_are_keyed_by_leading_index()
    {
        var result = SystemCounters.ByDiskIndex([new("0 C: D:", 10), new("1", 20), new("_Total", 30)]);

        Assert.Equal(2, result.Count);
        Assert.Equal(10, result[0]);
        Assert.Equal(20, result[1]);
    }
}
