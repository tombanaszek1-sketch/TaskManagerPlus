using System.Runtime.InteropServices;

namespace TaskManagerPlus.Core.Interop;

internal static unsafe partial class Pdh
{
    public const uint FormatDouble = 0x00000200;
    public const uint FormatNoCap100 = 0x00008000;
    public const uint MoreData = 0x800007D2;
    public const uint CStatusValidData = 0;
    public const uint CStatusNewData = 1;

    [LibraryImport("pdh.dll", EntryPoint = "PdhOpenQueryW", StringMarshalling = StringMarshalling.Utf16)]
    public static partial uint PdhOpenQuery(string? dataSource, nint userData, out nint query);

    [LibraryImport("pdh.dll", EntryPoint = "PdhAddEnglishCounterW", StringMarshalling = StringMarshalling.Utf16)]
    public static partial uint PdhAddEnglishCounter(nint query, string path, nint userData, out nint counter);

    [LibraryImport("pdh.dll")]
    public static partial uint PdhCollectQueryData(nint query);

    [LibraryImport("pdh.dll")]
    public static partial uint PdhCloseQuery(nint query);

    [LibraryImport("pdh.dll", EntryPoint = "PdhGetFormattedCounterArrayW")]
    public static partial uint PdhGetFormattedCounterArray(nint counter, uint format, ref uint bufferSize, out uint itemCount, void* buffer);

    [StructLayout(LayoutKind.Sequential)]
    public struct FmtCounterValue
    {
        public uint CStatus;
        public double DoubleValue;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct FmtCounterValueItem
    {
        public char* Name;
        public FmtCounterValue Value;
    }
}
