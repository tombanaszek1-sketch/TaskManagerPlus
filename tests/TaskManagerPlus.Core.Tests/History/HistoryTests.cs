using TaskManagerPlus.Core.History;

namespace TaskManagerPlus.Core.Tests.History;

public sealed class HistoryTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"tmp-history-{Guid.NewGuid():N}.db");
    private readonly HistoryStore _store;

    public HistoryTests() => _store = new HistoryStore(_path);

    private static IReadOnlyDictionary<string, IReadOnlyDictionary<string, double>> Usage(string resource, params (string Name, double Value)[] values) =>
        new Dictionary<string, IReadOnlyDictionary<string, double>> { [resource] = values.ToDictionary(v => v.Name, v => v.Value) };

    [Fact]
    public void Aggregator_emits_average_when_minute_changes()
    {
        var aggregator = new MinuteAggregator(topCount: 2);
        var start = DateTimeOffset.FromUnixTimeSeconds(600);

        Assert.Null(aggregator.Add(start, new Dictionary<string, double> { ["cpu"] = 10 }, Usage("cpu", ("a", 10), ("b", 2))));
        Assert.Null(aggregator.Add(start.AddSeconds(1), new Dictionary<string, double> { ["cpu"] = 30 }, Usage("cpu", ("a", 30), ("c", 8))));
        var record = aggregator.Add(start.AddSeconds(60), new Dictionary<string, double> { ["cpu"] = 99 }, Usage("cpu"));

        Assert.NotNull(record);
        Assert.Equal(600, record.Timestamp);
        Assert.Equal(20, record.Metrics["cpu"], 3);
        Assert.Equal(["a", "c"], record.TopProcesses["cpu"].Select(p => p.Name));
        Assert.Equal(20, record.TopProcesses["cpu"][0].Value, 3);
    }

    [Fact]
    public void Store_buckets_and_prunes()
    {
        for (var minute = 0; minute < 10; minute++)
        {
            _store.Write(new MinuteRecord(
                minute * 60,
                new Dictionary<string, double> { ["cpu"] = minute },
                new Dictionary<string, IReadOnlyList<TopProcessEntry>> { ["cpu"] = [new("app.exe", minute)] }));
        }

        var series = _store.Query(["cpu"], 0, 600, 300)["cpu"];
        Assert.Equal(2, series.Count);
        Assert.Equal(2, series[0].Value, 3);
        Assert.Equal(7, series[1].Value, 3);
        Assert.Equal(["cpu"], _store.Metrics(0, 600));
        Assert.Equal("app.exe", _store.TopProcesses("cpu", 0, 600, 3).Single().Name);

        _store.Prune(300);
        Assert.Equal(5, _store.Query(["cpu"], 0, 600, 60)["cpu"].Count);
    }

    public void Dispose()
    {
        _store.Dispose();
        foreach (var file in new[] { _path, _path + "-wal", _path + "-shm" })
        {
            File.Delete(file);
        }
    }
}
