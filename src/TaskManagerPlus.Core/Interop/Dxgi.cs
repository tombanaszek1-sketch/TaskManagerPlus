using System.Runtime.InteropServices;

namespace TaskManagerPlus.Core.Interop;

/// <summary>Enumerates hardware graphics adapters through DXGI using raw vtable calls.</summary>
internal static unsafe partial class Dxgi
{
    private const uint AdapterFlagSoftware = 2;
    private const int NotFound = unchecked((int)0x887A0002);

    private static readonly Guid IidFactory1 = new("770aae78-f26f-4dba-a829-253c83d1b387");

    [LibraryImport("dxgi.dll")]
    private static partial int CreateDXGIFactory1(in Guid riid, out nint factory);

    [StructLayout(LayoutKind.Sequential)]
    private struct AdapterDesc1
    {
        public fixed char Description[128];
        public uint VendorId;
        public uint DeviceId;
        public uint SubSysId;
        public uint Revision;
        public nuint DedicatedVideoMemory;
        public nuint DedicatedSystemMemory;
        public nuint SharedSystemMemory;
        public uint LuidLow;
        public int LuidHigh;
        public uint Flags;
    }

    public readonly record struct AdapterInfo(
        string Luid,
        string Description,
        uint VendorId,
        uint DeviceId,
        ulong DedicatedVideoMemory,
        ulong SharedSystemMemory);

    /// <summary>Formats a LUID the same way performance counter instance names do (normalized to lower case).</summary>
    public static string FormatLuid(int high, uint low) => $"0x{high:x8}_0x{low:x8}";

    public static IReadOnlyList<AdapterInfo> EnumerateAdapters()
    {
        var result = new List<AdapterInfo>();
        if (CreateDXGIFactory1(IidFactory1, out var factory) < 0)
        {
            return result;
        }

        try
        {
            var factoryVtbl = *(nint**)factory;
            var enumAdapters1 = (delegate* unmanaged[Stdcall]<nint, uint, nint*, int>)factoryVtbl[12];
            for (uint i = 0; ; i++)
            {
                nint adapter;
                if (enumAdapters1(factory, i, &adapter) == NotFound)
                {
                    break;
                }

                try
                {
                    var adapterVtbl = *(nint**)adapter;
                    var getDesc1 = (delegate* unmanaged[Stdcall]<nint, AdapterDesc1*, int>)adapterVtbl[10];
                    AdapterDesc1 desc;
                    if (getDesc1(adapter, &desc) < 0 || (desc.Flags & AdapterFlagSoftware) != 0)
                    {
                        continue;
                    }

                    var luid = FormatLuid(desc.LuidHigh, desc.LuidLow);
                    if (result.Exists(a => a.Luid == luid))
                    {
                        continue;
                    }

                    result.Add(new AdapterInfo(
                        luid,
                        new string(desc.Description).TrimEnd('\0').Trim(),
                        desc.VendorId,
                        desc.DeviceId,
                        desc.DedicatedVideoMemory,
                        desc.SharedSystemMemory));
                }
                finally
                {
                    Release(adapter);
                }
            }
        }
        finally
        {
            Release(factory);
        }

        return result;
    }

    private static void Release(nint unknown)
    {
        var vtbl = *(nint**)unknown;
        ((delegate* unmanaged[Stdcall]<nint, uint>)vtbl[2])(unknown);
    }
}
