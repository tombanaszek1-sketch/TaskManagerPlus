using Microsoft.Data.Sqlite;

namespace TaskManagerPlus.Core.History;

public sealed record HistoryPoint(long Timestamp, double Value);

public sealed record TopProcessEntry(string Name, double Value);

public sealed record MinuteRecord(
    long Timestamp,
    IReadOnlyDictionary<string, double> Metrics,
    IReadOnlyDictionary<string, IReadOnlyList<TopProcessEntry>> TopProcesses);

/// <summary>
/// Minute resolution history in a local SQLite database. Metrics are free-form keys such as
/// <c>cpu</c>, <c>gpu:&lt;id&gt;</c> or <c>net:down</c>; timestamps are Unix seconds.
/// </summary>
public sealed class HistoryStore : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly object _gate = new();

    public HistoryStore(string databasePath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
        _connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databasePath, Pooling = false }.ToString());
        _connection.Open();
        Execute("""
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            CREATE TABLE IF NOT EXISTS samples (
                metric TEXT NOT NULL,
                ts INTEGER NOT NULL,
                value REAL NOT NULL,
                PRIMARY KEY (metric, ts)
            ) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS top_processes (
                resource TEXT NOT NULL,
                ts INTEGER NOT NULL,
                rank INTEGER NOT NULL,
                name TEXT NOT NULL,
                value REAL NOT NULL,
                PRIMARY KEY (resource, ts, rank)
            ) WITHOUT ROWID;
            """);
    }

    public void Write(MinuteRecord record)
    {
        lock (_gate)
        {
            using var transaction = _connection.BeginTransaction();

            using (var insert = _connection.CreateCommand())
            {
                insert.Transaction = transaction;
                insert.CommandText = "INSERT OR REPLACE INTO samples (metric, ts, value) VALUES ($m, $t, $v)";
                var metric = insert.Parameters.Add("$m", SqliteType.Text);
                var ts = insert.Parameters.Add("$t", SqliteType.Integer);
                var value = insert.Parameters.Add("$v", SqliteType.Real);
                foreach (var (key, v) in record.Metrics)
                {
                    metric.Value = key;
                    ts.Value = record.Timestamp;
                    value.Value = v;
                    insert.ExecuteNonQuery();
                }
            }

            using (var insert = _connection.CreateCommand())
            {
                insert.Transaction = transaction;
                insert.CommandText = "INSERT OR REPLACE INTO top_processes (resource, ts, rank, name, value) VALUES ($r, $t, $k, $n, $v)";
                var resource = insert.Parameters.Add("$r", SqliteType.Text);
                var ts = insert.Parameters.Add("$t", SqliteType.Integer);
                var rank = insert.Parameters.Add("$k", SqliteType.Integer);
                var name = insert.Parameters.Add("$n", SqliteType.Text);
                var value = insert.Parameters.Add("$v", SqliteType.Real);
                foreach (var (key, entries) in record.TopProcesses)
                {
                    for (var i = 0; i < entries.Count; i++)
                    {
                        resource.Value = key;
                        ts.Value = record.Timestamp;
                        rank.Value = i;
                        name.Value = entries[i].Name;
                        value.Value = entries[i].Value;
                        insert.ExecuteNonQuery();
                    }
                }
            }

            transaction.Commit();
        }
    }

    /// <summary>Returns the average of each metric per bucket between <paramref name="from"/> and <paramref name="to"/>.</summary>
    public IReadOnlyDictionary<string, IReadOnlyList<HistoryPoint>> Query(IEnumerable<string> metrics, long from, long to, int bucketSeconds)
    {
        var result = new Dictionary<string, IReadOnlyList<HistoryPoint>>();
        lock (_gate)
        {
            using var command = _connection.CreateCommand();
            command.CommandText = """
                SELECT (ts / $b) * $b AS bucket, AVG(value)
                FROM samples
                WHERE metric = $m AND ts BETWEEN $f AND $t
                GROUP BY bucket
                ORDER BY bucket
                """;
            var metric = command.Parameters.Add("$m", SqliteType.Text);
            command.Parameters.AddWithValue("$b", Math.Max(60, bucketSeconds));
            command.Parameters.AddWithValue("$f", from);
            command.Parameters.AddWithValue("$t", to);

            foreach (var key in metrics.Distinct())
            {
                metric.Value = key;
                var points = new List<HistoryPoint>();
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    points.Add(new HistoryPoint(reader.GetInt64(0), reader.GetDouble(1)));
                }

                result[key] = points;
            }
        }

        return result;
    }

    /// <summary>All metric keys recorded in the given range, used to discover devices that existed back then.</summary>
    public IReadOnlyList<string> Metrics(long from, long to)
    {
        lock (_gate)
        {
            using var command = _connection.CreateCommand();
            command.CommandText = "SELECT DISTINCT metric FROM samples WHERE ts BETWEEN $f AND $t ORDER BY metric";
            command.Parameters.AddWithValue("$f", from);
            command.Parameters.AddWithValue("$t", to);
            using var reader = command.ExecuteReader();
            var result = new List<string>();
            while (reader.Read())
            {
                result.Add(reader.GetString(0));
            }

            return result;
        }
    }

    /// <summary>Processes that used a resource the most within a time range, averaged over the minutes they appeared in.</summary>
    public IReadOnlyList<TopProcessEntry> TopProcesses(string resource, long from, long to, int limit)
    {
        lock (_gate)
        {
            using var command = _connection.CreateCommand();
            command.CommandText = """
                SELECT name, SUM(value) / MAX(1, ($t - $f) / 60 + 1) AS average
                FROM top_processes
                WHERE resource = $r AND ts BETWEEN $f AND $t
                GROUP BY name
                ORDER BY average DESC
                LIMIT $l
                """;
            command.Parameters.AddWithValue("$r", resource);
            command.Parameters.AddWithValue("$f", from);
            command.Parameters.AddWithValue("$t", to);
            command.Parameters.AddWithValue("$l", limit);
            using var reader = command.ExecuteReader();
            var result = new List<TopProcessEntry>();
            while (reader.Read())
            {
                result.Add(new TopProcessEntry(reader.GetString(0), reader.GetDouble(1)));
            }

            return result;
        }
    }

    public void Prune(long olderThan)
    {
        lock (_gate)
        {
            using var command = _connection.CreateCommand();
            command.CommandText = "DELETE FROM samples WHERE ts < $c; DELETE FROM top_processes WHERE ts < $c;";
            command.Parameters.AddWithValue("$c", olderThan);
            command.ExecuteNonQuery();
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            Execute("DELETE FROM samples; DELETE FROM top_processes; VACUUM;");
        }
    }

    private void Execute(string sql)
    {
        using var command = _connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _connection.Dispose();
        }
    }
}
