using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using TaskManagerPlus.Core.Interop;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Network;

/// <summary>Samples every network adapter: addresses, link state and live throughput.</summary>
public sealed class AdapterSampler
{
    private readonly record struct Previous(long Received, long Sent, long Timestamp);

    private static readonly string[] VirtualMarkers =
    [
        "Hyper-V", "Virtual", "VPN", "TAP-", "WireGuard", "Wintun", "VMware", "VirtualBox", "Loopback", "Npcap", "WAN Miniport",
    ];

    private readonly Dictionary<string, Previous> _previous = [];

    public IReadOnlyList<NetworkAdapterSnapshot> Sample()
    {
        var now = Stopwatch.GetTimestamp();
        var result = new List<NetworkAdapterSnapshot>();

        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel || IsFilterBinding(nic.Name))
            {
                continue;
            }

            try
            {
                result.Add(Read(nic, now));
            }
            catch (NetworkInformationException)
            {
                // Adapter vanished between enumeration and query.
            }
        }

        return result
            .OrderByDescending(a => a.IsUp)
            .ThenBy(a => a.Kind == "Virtual")
            .ThenByDescending(a => a.ReceiveBytesPerSec + a.SendBytesPerSec)
            .ToList();
    }

    private NetworkAdapterSnapshot Read(NetworkInterface nic, long now)
    {
        var stats = nic.GetIPStatistics();
        var received = stats.BytesReceived;
        var sent = stats.BytesSent;

        double receiveRate = 0, sendRate = 0;
        if (_previous.TryGetValue(nic.Id, out var prev))
        {
            var seconds = Stopwatch.GetElapsedTime(prev.Timestamp, now).TotalSeconds;
            if (seconds > 0)
            {
                receiveRate = Math.Max(0, (received - prev.Received) / seconds);
                sendRate = Math.Max(0, (sent - prev.Sent) / seconds);
            }
        }

        _previous[nic.Id] = new Previous(received, sent, now);

        var properties = nic.GetIPProperties();
        var unicast = properties.UnicastAddresses;
        var isWireless = nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211;

        WifiInfo? wifi = null;
        if (isWireless && nic.OperationalStatus == OperationalStatus.Up && Guid.TryParse(nic.Id, out var guid) && WlanApi.Query(guid) is { } connection)
        {
            wifi = new WifiInfo(connection.Ssid, connection.SignalPercent, connection.Channel, Band(connection.Channel), connection.RxRateMbps, connection.TxRateMbps);
        }

        bool dhcp;
        try
        {
            dhcp = properties.GetIPv4Properties()?.IsDhcpEnabled ?? false;
        }
        catch (NetworkInformationException)
        {
            dhcp = false;
        }

        return new NetworkAdapterSnapshot(
            nic.Id,
            nic.Name,
            nic.Description,
            Kind(nic),
            nic.OperationalStatus == OperationalStatus.Up,
            nic.Speed > 0 ? nic.Speed : 0,
            FormatMac(nic.GetPhysicalAddress()),
            unicast.Where(u => u.Address.AddressFamily == AddressFamily.InterNetwork).Select(u => $"{u.Address}/{u.PrefixLength}").ToList(),
            unicast.Where(u => u.Address.AddressFamily == AddressFamily.InterNetworkV6).Select(u => u.Address.ToString()).ToList(),
            properties.GatewayAddresses.Select(g => g.Address.ToString()).Where(g => g != "0.0.0.0" && g != "::").ToList(),
            properties.DnsAddresses.Select(d => d.ToString()).Distinct().ToList(),
            dhcp,
            Math.Round(receiveRate),
            Math.Round(sendRate),
            received,
            sent,
            wifi);
    }

    private static string Kind(NetworkInterface nic)
    {
        if (Array.Exists(VirtualMarkers, m => nic.Description.Contains(m, StringComparison.OrdinalIgnoreCase)))
        {
            return "Virtual";
        }

        return nic.NetworkInterfaceType switch
        {
            NetworkInterfaceType.Wireless80211 => "Wi-Fi",
            NetworkInterfaceType.Ethernet or NetworkInterfaceType.GigabitEthernet or NetworkInterfaceType.FastEthernetT or NetworkInterfaceType.FastEthernetFx => "Ethernet",
            NetworkInterfaceType.Ppp => "Dial-up",
            NetworkInterfaceType.Wwanpp or NetworkInterfaceType.Wwanpp2 => "Mobile",
            _ => "Other",
        };
    }

    /// <summary>
    /// Lightweight filter drivers (QoS, WFP, Wi-Fi filters) show up as extra interfaces named
    /// "&lt;adapter&gt;-&lt;filter name&gt;-0000". They mirror the real adapter and are not shown.
    /// </summary>
    internal static bool IsFilterBinding(string name) =>
        name.Length > 5 && name[^5] == '-' && name.AsSpan(name.Length - 4).IndexOfAnyExceptInRange('0', '9') < 0;

    internal static string? Band(int? channel) => channel switch
    {
        null => null,
        <= 14 => "2.4 GHz",
        >= 32 and <= 177 => "5 GHz",
        _ => "6 GHz",
    };

    private static string FormatMac(PhysicalAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes.Length == 0 ? string.Empty : string.Join(':', bytes.Select(b => b.ToString("X2")));
    }
}
