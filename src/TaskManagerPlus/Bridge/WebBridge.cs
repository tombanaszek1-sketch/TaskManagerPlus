using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Monitoring;

namespace TaskManagerPlus.Bridge;

/// <summary>
/// Connects a WebView2 instance with the monitor: pushes snapshots to the page and answers its requests.
/// Messages are JSON objects with a <c>type</c> field.
/// </summary>
internal sealed class WebBridge : IDisposable
{
    private readonly CoreWebView2 _webView;
    private readonly MonitorEngine _engine;
    private readonly RequestRouter _router;
    private readonly Control _owner;
    private volatile bool _ready;
    private volatile bool _paused;
    private int _sending;

    public WebBridge(Control owner, CoreWebView2 webView, MonitorEngine engine, RequestRouter router)
    {
        _owner = owner;
        _webView = webView;
        _engine = engine;
        _router = router;
        _webView.WebMessageReceived += OnMessage;
        _engine.SnapshotReady += OnSnapshot;
    }

    /// <summary>While paused (window minimized) snapshots are not sent; resuming sends the latest at once.</summary>
    public bool Paused
    {
        get => _paused;
        set
        {
            var resumed = _paused && !value;
            _paused = value;
            if (resumed && _engine.Latest is { } latest)
            {
                OnSnapshot(latest);
            }
        }
    }

    private void OnSnapshot(Snapshot snapshot)
    {
        // Drop frames while the page is still busy with the previous one instead of queueing them.
        if (!_ready || _paused || Interlocked.Exchange(ref _sending, 1) == 1)
        {
            return;
        }

        var json = BridgeJson.Serialize(new { type = "snapshot", data = snapshot });
        Post(json, () => Interlocked.Exchange(ref _sending, 0));
    }

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        JsonElement message;
        try
        {
            message = JsonDocument.Parse(e.WebMessageAsJson).RootElement;
        }
        catch (JsonException)
        {
            return;
        }

        var type = message.TryGetProperty("type", out var t) ? t.GetString() : null;
        switch (type)
        {
            case "ready":
                _ready = true;
                if (_engine.Latest is { } latest)
                {
                    OnSnapshot(latest);
                }

                break;
            case "request":
                var id = message.GetProperty("id").GetString();
                var action = message.GetProperty("action").GetString() ?? string.Empty;
                var args = message.TryGetProperty("args", out var a) ? a.Clone() : default;
                _ = Task.Run(() => Execute(id, action, args));
                break;
        }
    }

    private void Execute(string? id, string action, JsonElement args)
    {
        string json;
        try
        {
            var data = _router.Handle(action, args);
            json = BridgeJson.Serialize(new { type = "result", id, ok = true, data });
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            var error = ex is System.Reflection.TargetInvocationException { InnerException: { } inner } ? inner.Message : ex.Message;
            json = BridgeJson.Serialize(new { type = "result", id, ok = false, error });
        }

        Post(json, null);
    }

    private void Post(string json, Action? completed)
    {
        if (_owner.IsDisposed || !_owner.IsHandleCreated)
        {
            completed?.Invoke();
            return;
        }

        try
        {
            _owner.BeginInvoke(() =>
            {
                try
                {
                    _webView.PostWebMessageAsJson(json);
                }
                catch (Exception e) when (e is InvalidOperationException or System.Runtime.InteropServices.COMException)
                {
                    // The WebView was closed while the message was in flight.
                }
                finally
                {
                    completed?.Invoke();
                }
            });
        }
        catch (InvalidOperationException)
        {
            completed?.Invoke();
        }
    }

    public void Dispose()
    {
        _ready = false;
        _engine.SnapshotReady -= OnSnapshot;
        _webView.WebMessageReceived -= OnMessage;
    }
}
