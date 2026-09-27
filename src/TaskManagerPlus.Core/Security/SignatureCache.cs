using System.Collections.Concurrent;
using System.Threading.Channels;
using TaskManagerPlus.Core.Interop;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Security;

public readonly record struct SignatureInfo(SignatureState State, string? Signer)
{
    public static readonly SignatureInfo Pending = new(SignatureState.Unknown, null);

    public bool IsMicrosoft => State == SignatureState.Valid && Signer is not null &&
                               Signer.StartsWith("Microsoft", StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// Verifies file signatures on a background worker and caches the result per file version.
/// Lookups never block: unknown files report <see cref="SignatureInfo.Pending"/> until verified.
/// </summary>
public sealed class SignatureCache : IDisposable
{
    private readonly ConcurrentDictionary<string, (DateTime Modified, SignatureInfo Info)> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _queued = new(StringComparer.OrdinalIgnoreCase);
    private readonly Channel<string> _work = Channel.CreateUnbounded<string>(new UnboundedChannelOptions { SingleReader = true });
    private readonly CancellationTokenSource _cts = new();

    public SignatureCache()
    {
        _ = Task.Run(WorkAsync);
    }

    public SignatureInfo Get(string? path)
    {
        if (string.IsNullOrEmpty(path))
        {
            return SignatureInfo.Pending;
        }

        if (_cache.TryGetValue(path, out var entry))
        {
            return entry.Info;
        }

        if (_queued.TryAdd(path, 0))
        {
            _work.Writer.TryWrite(path);
        }

        return SignatureInfo.Pending;
    }

    /// <summary>Verifies synchronously, used for on-demand lists such as autostart and services.</summary>
    public SignatureInfo GetNow(string? path)
    {
        if (string.IsNullOrEmpty(path))
        {
            return SignatureInfo.Pending;
        }

        if (_cache.TryGetValue(path, out var entry))
        {
            return entry.Info;
        }

        return Verify(path);
    }

    private async Task WorkAsync()
    {
        try
        {
            await foreach (var path in _work.Reader.ReadAllAsync(_cts.Token).ConfigureAwait(false))
            {
                Verify(path);
                _queued.TryRemove(path, out _);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private SignatureInfo Verify(string path)
    {
        SignatureInfo info;
        DateTime modified;
        try
        {
            modified = File.GetLastWriteTimeUtc(path);
            var result = WinTrust.Verify(path);
            info = new SignatureInfo(result.State, result.Signer);
            if (result.State != SignatureState.Valid && PackageSignature.ReadPublisher(path) is { } publisher)
            {
                info = new SignatureInfo(SignatureState.Valid, publisher);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            modified = DateTime.MinValue;
            info = SignatureInfo.Pending;
        }

        _cache[path] = (modified, info);
        return info;
    }

    public void Dispose()
    {
        _cts.Cancel();
        _cts.Dispose();
    }
}
