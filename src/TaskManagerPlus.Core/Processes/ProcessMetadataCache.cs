using System.Collections.Concurrent;
using System.Diagnostics;
using TaskManagerPlus.Core.Interop;

namespace TaskManagerPlus.Core.Processes;

public sealed record ProcessMetadata(string? Path, string? Description, string? Company);

/// <summary>Caches image path and version resources per process instance and per file.</summary>
public sealed class ProcessMetadataCache
{
    private readonly Dictionary<(int Pid, long Created), ProcessMetadata> _byProcess = [];
    private readonly ConcurrentDictionary<string, (string? Description, string? Company)> _byFile = new(StringComparer.OrdinalIgnoreCase);

    public ProcessMetadata Get(int pid, long createTime)
    {
        if (_byProcess.TryGetValue((pid, createTime), out var cached))
        {
            return cached;
        }

        var path = Kernel32.TryGetImagePath(pid);
        var (description, company) = path is null ? (null, null) : GetVersionInfo(path);
        var metadata = new ProcessMetadata(path, description, company);
        _byProcess[(pid, createTime)] = metadata;
        return metadata;
    }

    public (string? Description, string? Company) GetVersionInfo(string path) =>
        _byFile.GetOrAdd(path, static p =>
        {
            try
            {
                var info = FileVersionInfo.GetVersionInfo(p);
                return (Clean(info.FileDescription), Clean(info.CompanyName));
            }
            catch (Exception e) when (e is FileNotFoundException or UnauthorizedAccessException or IOException)
            {
                return (null, null);
            }
        });

    /// <summary>Drops entries for processes that no longer exist.</summary>
    public void Retain(IEnumerable<(int Pid, long Created)> alive)
    {
        var keep = alive.ToHashSet();
        foreach (var key in _byProcess.Keys.Where(k => !keep.Contains(k)).ToList())
        {
            _byProcess.Remove(key);
        }
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
