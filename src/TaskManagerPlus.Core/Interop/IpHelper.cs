using System.Net;
using System.Runtime.InteropServices;

namespace TaskManagerPlus.Core.Interop;

internal static unsafe partial class IpHelper
{
    private const int AfInet = 2;
    private const int AfInet6 = 23;
    private const int TcpTableOwnerPidAll = 5;
    private const int UdpTableOwnerPid = 1;
    private const uint ErrorInsufficientBuffer = 122;

    [LibraryImport("iphlpapi.dll")]
    private static partial uint GetExtendedTcpTable(void* table, ref uint size, [MarshalAs(UnmanagedType.Bool)] bool order, int af, int tableClass, uint reserved);

    [LibraryImport("iphlpapi.dll")]
    private static partial uint GetExtendedUdpTable(void* table, ref uint size, [MarshalAs(UnmanagedType.Bool)] bool order, int af, int tableClass, uint reserved);

    [StructLayout(LayoutKind.Sequential)]
    private struct TcpRow
    {
        public uint State;
        public uint LocalAddr;
        public uint LocalPort;
        public uint RemoteAddr;
        public uint RemotePort;
        public uint OwningPid;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Tcp6Row
    {
        public fixed byte LocalAddr[16];
        public uint LocalScopeId;
        public uint LocalPort;
        public fixed byte RemoteAddr[16];
        public uint RemoteScopeId;
        public uint RemotePort;
        public uint State;
        public uint OwningPid;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct UdpRow
    {
        public uint LocalAddr;
        public uint LocalPort;
        public uint OwningPid;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Udp6Row
    {
        public fixed byte LocalAddr[16];
        public uint LocalScopeId;
        public uint LocalPort;
        public uint OwningPid;
    }

    public readonly record struct Socket(string Protocol, IPAddress Local, int LocalPort, IPAddress Remote, int RemotePort, string State, int Pid);

    public static List<Socket> GetSockets()
    {
        var result = new List<Socket>(512);

        Read(true, AfInet, TcpTableOwnerPidAll, p =>
        {
            var row = (TcpRow*)p;
            result.Add(new Socket("TCP", new IPAddress(row->LocalAddr), Port(row->LocalPort), new IPAddress(row->RemoteAddr), Port(row->RemotePort), TcpState(row->State), (int)row->OwningPid));
            return sizeof(TcpRow);
        });

        Read(true, AfInet6, TcpTableOwnerPidAll, p =>
        {
            var row = (Tcp6Row*)p;
            result.Add(new Socket("TCP", V6(row->LocalAddr), Port(row->LocalPort), V6(row->RemoteAddr), Port(row->RemotePort), TcpState(row->State), (int)row->OwningPid));
            return sizeof(Tcp6Row);
        });

        Read(false, AfInet, UdpTableOwnerPid, p =>
        {
            var row = (UdpRow*)p;
            result.Add(new Socket("UDP", new IPAddress(row->LocalAddr), Port(row->LocalPort), IPAddress.Any, 0, "Listen", (int)row->OwningPid));
            return sizeof(UdpRow);
        });

        Read(false, AfInet6, UdpTableOwnerPid, p =>
        {
            var row = (Udp6Row*)p;
            result.Add(new Socket("UDP", V6(row->LocalAddr), Port(row->LocalPort), IPAddress.IPv6Any, 0, "Listen", (int)row->OwningPid));
            return sizeof(Udp6Row);
        });

        return result;
    }

    private delegate int RowReader(byte* row);

    private static void Read(bool tcp, int family, int tableClass, RowReader reader)
    {
        uint size = 0;
        var status = tcp
            ? GetExtendedTcpTable(null, ref size, false, family, tableClass, 0)
            : GetExtendedUdpTable(null, ref size, false, family, tableClass, 0);

        for (var attempt = 0; attempt < 4 && status == ErrorInsufficientBuffer; attempt++)
        {
            var buffer = new byte[size + 4096];
            fixed (byte* p = buffer)
            {
                size = (uint)buffer.Length;
                status = tcp
                    ? GetExtendedTcpTable(p, ref size, false, family, tableClass, 0)
                    : GetExtendedUdpTable(p, ref size, false, family, tableClass, 0);
                if (status != 0)
                {
                    continue;
                }

                var count = *(uint*)p;
                // Row arrays start after the 4 byte count; 64-bit rows are 4 byte aligned.
                var row = p + 4;
                for (var i = 0; i < count; i++)
                {
                    row += reader(row);
                }
            }
        }
    }

    private static int Port(uint networkOrder) => (int)(((networkOrder & 0xFF) << 8) | ((networkOrder >> 8) & 0xFF));

    private static IPAddress V6(byte* address) => new(new ReadOnlySpan<byte>(address, 16));

    private static string TcpState(uint state) => state switch
    {
        1 => "Closed",
        2 => "Listen",
        3 => "SynSent",
        4 => "SynReceived",
        5 => "Established",
        6 => "FinWait1",
        7 => "FinWait2",
        8 => "CloseWait",
        9 => "Closing",
        10 => "LastAck",
        11 => "TimeWait",
        12 => "DeleteTcb",
        _ => "Unknown",
    };
}
