using System.Runtime.InteropServices;

namespace TaskManagerPlus.Core.Interop;

internal static unsafe partial class User32
{
    private const int GwlExStyle = -20;
    private const long WsExToolWindow = 0x00000080;
    private const uint GwOwner = 4;
    private const int DwmwaCloaked = 14;

    [LibraryImport("dwmapi.dll")]
    private static partial int DwmGetWindowAttribute(nint hwnd, int attribute, void* value, int size);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool EnumWindows(delegate* unmanaged<nint, nint, int> callback, nint param);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool IsWindowVisible(nint hwnd);

    [LibraryImport("user32.dll")]
    private static partial nint GetWindow(nint hwnd, uint cmd);

    [LibraryImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static partial nint GetWindowLongPtr(nint hwnd, int index);

    [LibraryImport("user32.dll", EntryPoint = "GetWindowTextW")]
    private static partial int GetWindowText(nint hwnd, char* buffer, int max);

    [LibraryImport("user32.dll")]
    private static partial uint GetWindowThreadProcessId(nint hwnd, out int processId);

    [ThreadStatic]
    private static Dictionary<int, string>? t_windows;

    /// <summary>Maps process id to the title of its first visible, titled, unowned top-level window.</summary>
    public static Dictionary<int, string> GetVisibleWindows()
    {
        var result = new Dictionary<int, string>();
        t_windows = result;
        try
        {
            EnumWindows(&OnWindow, 0);
        }
        finally
        {
            t_windows = null;
        }

        return result;
    }

    [UnmanagedCallersOnly]
    private static int OnWindow(nint hwnd, nint param)
    {
        if (!IsWindowVisible(hwnd) || GetWindow(hwnd, GwOwner) != 0)
        {
            return 1;
        }

        if ((GetWindowLongPtr(hwnd, GwlExStyle) & WsExToolWindow) != 0)
        {
            return 1;
        }

        // Cloaked windows (suspended store apps, the touch keyboard host) are technically visible but not on screen.
        int cloaked;
        if (DwmGetWindowAttribute(hwnd, DwmwaCloaked, &cloaked, sizeof(int)) == 0 && cloaked != 0)
        {
            return 1;
        }

        var buffer = stackalloc char[256];
        var length = GetWindowText(hwnd, buffer, 256);
        if (length == 0)
        {
            return 1;
        }

        GetWindowThreadProcessId(hwnd, out var pid);
        t_windows?.TryAdd(pid, new string(buffer, 0, length));
        return 1;
    }
}
