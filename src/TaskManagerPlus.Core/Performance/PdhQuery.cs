using TaskManagerPlus.Core.Interop;

namespace TaskManagerPlus.Core.Performance;

/// <summary>
/// Thin wrapper around a PDH query. Counters are added by their English path so the
/// code works on any Windows display language. Wildcard instances are expanded on read.
/// </summary>
public sealed unsafe class PdhQuery : IDisposable
{
    private readonly nint _query;
    private readonly Dictionary<string, nint> _counters = new(StringComparer.OrdinalIgnoreCase);
    private byte[] _buffer = new byte[64 * 1024];

    public PdhQuery()
    {
        if (Pdh.PdhOpenQuery(null, 0, out _query) != 0)
        {
            throw new InvalidOperationException("Unable to open a performance counter query.");
        }
    }

    /// <summary>Adds a counter; returns false when the counter does not exist on this system.</summary>
    public bool Add(string path)
    {
        if (_counters.ContainsKey(path))
        {
            return true;
        }

        if (Pdh.PdhAddEnglishCounter(_query, path, 0, out var counter) != 0)
        {
            return false;
        }

        _counters[path] = counter;
        return true;
    }

    public bool Has(string path) => _counters.ContainsKey(path);

    public void Collect() => Pdh.PdhCollectQueryData(_query);

    /// <summary>Reads every instance of a (wildcard) counter. Instances without valid data are skipped.</summary>
    public IReadOnlyList<KeyValuePair<string, double>> ReadArray(string path)
    {
        if (!_counters.TryGetValue(path, out var counter))
        {
            return [];
        }

        while (true)
        {
            var size = (uint)_buffer.Length;
            uint count;
            uint status;
            fixed (byte* p = _buffer)
            {
                status = Pdh.PdhGetFormattedCounterArray(counter, Pdh.FormatDouble | Pdh.FormatNoCap100, ref size, out count, p);
                if (status == 0)
                {
                    var items = (Pdh.FmtCounterValueItem*)p;
                    var result = new List<KeyValuePair<string, double>>((int)count);
                    for (var i = 0; i < count; i++)
                    {
                        var item = items[i];
                        if (item.Value.CStatus is Pdh.CStatusValidData or Pdh.CStatusNewData)
                        {
                            result.Add(new(new string(item.Name), item.Value.DoubleValue));
                        }
                    }

                    return result;
                }
            }

            if (status != Pdh.MoreData)
            {
                return [];
            }

            _buffer = new byte[Math.Max(size, (uint)_buffer.Length * 2)];
        }
    }

    /// <summary>Reads a single-instance counter.</summary>
    public double? Read(string path)
    {
        var values = ReadArray(path);
        return values.Count > 0 ? values[0].Value : null;
    }

    public void Dispose() => Pdh.PdhCloseQuery(_query);
}
