using System.Net;
using TaskManagerPlus.Core.Interop;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Network;

public static class ConnectionTable
{
    /// <summary>Lists TCP connections and UDP endpoints with their owning process.</summary>
    public static IReadOnlyList<ConnectionEntry> Read(IReadOnlyDictionary<int, string> processNames) =>
        IpHelper.GetSockets()
            .Select(s => new ConnectionEntry(
                s.Protocol,
                s.Local.ToString(),
                s.LocalPort,
                IsUnspecified(s.Remote) ? string.Empty : s.Remote.ToString(),
                s.RemotePort,
                s.State,
                s.Pid,
                processNames.TryGetValue(s.Pid, out var name) ? name : s.Pid == 4 ? "System" : $"pid {s.Pid}"))
            .OrderBy(c => c.State == "Established" ? 0 : c.State == "Listen" ? 2 : 1)
            .ThenBy(c => c.ProcessName, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static bool IsUnspecified(IPAddress address) =>
        address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any);
}
