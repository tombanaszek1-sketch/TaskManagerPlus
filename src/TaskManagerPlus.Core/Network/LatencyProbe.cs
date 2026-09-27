using System.Net.NetworkInformation;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Network;

/// <summary>
/// Pings the default gateway and a public resolver in the background. The gateway round trip shows the
/// quality of the local network, the public one the quality of the internet line.
/// </summary>
public sealed class LatencyProbe : IDisposable
{
    public const string InternetTarget = "1.1.1.1";
    private const int WindowSize = 30;
    private const int TimeoutMs = 1500;

    private readonly Queue<bool> _recent = new();
    private readonly object _gate = new();
    private readonly CancellationTokenSource _cts = new();
    private LatencySnapshot _latest = new(null, null, InternetTarget, null, 0);
    private Func<string?> _gatewayProvider = () => null;

    public void Start(Func<string?> gatewayProvider, TimeSpan interval)
    {
        _gatewayProvider = gatewayProvider;
        _ = Task.Run(() => RunAsync(interval, _cts.Token));
    }

    public LatencySnapshot Latest
    {
        get
        {
            lock (_gate)
            {
                return _latest;
            }
        }
    }

    private async Task RunAsync(TimeSpan interval, CancellationToken token)
    {
        using var timer = new PeriodicTimer(interval);
        do
        {
            var gateway = _gatewayProvider();
            var gatewayTask = gateway is null ? Task.FromResult<double?>(null) : PingAsync(gateway);
            var internetTask = PingAsync(InternetTarget);
            await Task.WhenAll(gatewayTask, internetTask).ConfigureAwait(false);

            lock (_gate)
            {
                _recent.Enqueue(internetTask.Result is not null);
                while (_recent.Count > WindowSize)
                {
                    _recent.Dequeue();
                }

                var loss = _recent.Count == 0 ? 0 : _recent.Count(ok => !ok) * 100d / _recent.Count;
                _latest = new LatencySnapshot(gateway, gatewayTask.Result, InternetTarget, internetTask.Result, loss);
            }
        }
        while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false));
    }

    private static async Task<double?> PingAsync(string host)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(host, TimeoutMs).ConfigureAwait(false);
            return reply.Status == IPStatus.Success ? reply.RoundtripTime : null;
        }
        catch (PingException)
        {
            return null;
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _cts.Dispose();
    }
}
