using System.ComponentModel;
using System.Runtime.InteropServices;

namespace TaskManagerPlus.Core.Interop;

internal static unsafe partial class AdvApi32
{
    private const uint ScManagerConnect = 0x0001;
    private const uint ServiceChangeConfig = 0x0002;
    private const uint ServiceQueryConfig = 0x0001;
    private const uint ServiceNoChange = 0xFFFFFFFF;
    private const uint ConfigDelayedAutoStart = 3;

    [LibraryImport("advapi32.dll", EntryPoint = "OpenSCManagerW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial nint OpenSCManager(string? machine, string? database, uint access);

    [LibraryImport("advapi32.dll", EntryPoint = "OpenServiceW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial nint OpenService(nint manager, string name, uint access);

    [LibraryImport("advapi32.dll", EntryPoint = "ChangeServiceConfigW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool ChangeServiceConfig(
        nint service, uint serviceType, uint startType, uint errorControl,
        char* binaryPath, char* loadOrderGroup, nint tagId, char* dependencies,
        char* startName, char* password, char* displayName);

    [LibraryImport("advapi32.dll", EntryPoint = "ChangeServiceConfig2W", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool ChangeServiceConfig2(nint service, uint infoLevel, void* info);

    [LibraryImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CloseServiceHandle(nint handle);

    /// <summary>Win32 start types: 2 = automatic, 3 = manual, 4 = disabled.</summary>
    public static void SetStartType(string serviceName, uint startType, bool delayed)
    {
        var manager = OpenSCManager(null, null, ScManagerConnect);
        if (manager == 0)
        {
            throw new Win32Exception(Marshal.GetLastPInvokeError());
        }

        try
        {
            var service = OpenService(manager, serviceName, ServiceChangeConfig | ServiceQueryConfig);
            if (service == 0)
            {
                throw new Win32Exception(Marshal.GetLastPInvokeError());
            }

            try
            {
                if (!ChangeServiceConfig(service, ServiceNoChange, startType, ServiceNoChange, null, null, 0, null, null, null, null))
                {
                    throw new Win32Exception(Marshal.GetLastPInvokeError());
                }

                if (startType == 2)
                {
                    var flag = delayed ? 1 : 0;
                    if (!ChangeServiceConfig2(service, ConfigDelayedAutoStart, &flag))
                    {
                        throw new Win32Exception(Marshal.GetLastPInvokeError());
                    }
                }
            }
            finally
            {
                CloseServiceHandle(service);
            }
        }
        finally
        {
            CloseServiceHandle(manager);
        }
    }
}
