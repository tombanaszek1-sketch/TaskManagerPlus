using TaskManagerPlus.Core.Network;

namespace TaskManagerPlus.Core.Tests.Network;

public class AdapterSamplerTests
{
    [Theory]
    [InlineData("Ethernet-WFP Native MAC Layer LightWeight Filter-0000", true)]
    [InlineData("WLAN-QoS Packet Scheduler-0000", true)]
    [InlineData("Ethernet", false)]
    [InlineData("Ethernet 2", false)]
    [InlineData("LAN-Verbindung* 10", false)]
    public void Detects_filter_bindings(string name, bool expected) =>
        Assert.Equal(expected, AdapterSampler.IsFilterBinding(name));

    [Theory]
    [InlineData(6, "2.4 GHz")]
    [InlineData(36, "5 GHz")]
    [InlineData(null, null)]
    public void Maps_channel_to_band(int? channel, string? expected) =>
        Assert.Equal(expected, AdapterSampler.Band(channel));
}
