using System.Runtime.InteropServices;

namespace TaskManagerPlus.Core.Interop;

internal static unsafe partial class WlanApi
{
    private const int OpcodeCurrentConnection = 7;
    private const int OpcodeChannelNumber = 8;
    private const int StateConnected = 1;

    [LibraryImport("wlanapi.dll")]
    private static partial uint WlanOpenHandle(uint clientVersion, nint reserved, out uint negotiatedVersion, out nint handle);

    [LibraryImport("wlanapi.dll")]
    private static partial uint WlanCloseHandle(nint handle, nint reserved);

    [LibraryImport("wlanapi.dll")]
    private static partial uint WlanQueryInterface(nint handle, in Guid interfaceGuid, int opcode, nint reserved, out uint dataSize, out void* data, nint opcodeValueType);

    [LibraryImport("wlanapi.dll")]
    private static partial void WlanFreeMemory(void* memory);

    [StructLayout(LayoutKind.Sequential)]
    private struct ConnectionAttributes
    {
        public int State;
        public int Mode;
        public fixed char ProfileName[256];
        public uint SsidLength;
        public fixed byte Ssid[32];
        public int BssType;
        public fixed byte Bssid[6];
        public int PhyType;
        public uint PhyIndex;
        public uint SignalQuality;
        public uint RxRateKbps;
        public uint TxRateKbps;
    }

    public readonly record struct Connection(string Ssid, int SignalPercent, int? Channel, double RxRateMbps, double TxRateMbps);

    /// <summary>Returns the current Wi-Fi connection of an interface, or null when it is not a connected WLAN adapter.</summary>
    public static Connection? Query(Guid interfaceId)
    {
        nint handle;
        try
        {
            if (WlanOpenHandle(2, 0, out _, out handle) != 0)
            {
                return null;
            }
        }
        catch (DllNotFoundException)
        {
            return null;
        }

        try
        {
            if (WlanQueryInterface(handle, interfaceId, OpcodeCurrentConnection, 0, out _, out var data, 0) != 0)
            {
                return null;
            }

            Connection? result = null;
            try
            {
                var attributes = (ConnectionAttributes*)data;
                if (attributes->State == StateConnected)
                {
                    var ssid = System.Text.Encoding.UTF8.GetString(attributes->Ssid, (int)Math.Min(attributes->SsidLength, 32));
                    int? channel = null;
                    if (WlanQueryInterface(handle, interfaceId, OpcodeChannelNumber, 0, out _, out var channelData, 0) == 0)
                    {
                        channel = (int)*(uint*)channelData;
                        WlanFreeMemory(channelData);
                    }

                    result = new Connection(ssid, (int)attributes->SignalQuality, channel, attributes->RxRateKbps / 1000d, attributes->TxRateKbps / 1000d);
                }
            }
            finally
            {
                WlanFreeMemory(data);
            }

            return result;
        }
        finally
        {
            WlanCloseHandle(handle, 0);
        }
    }
}
