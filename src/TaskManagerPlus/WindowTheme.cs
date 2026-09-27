using System.Runtime.InteropServices;

namespace TaskManagerPlus;

internal static partial class WindowTheme
{
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaCaptionColor = 35;

    [LibraryImport("dwmapi.dll")]
    private static partial int DwmSetWindowAttribute(nint hwnd, int attribute, ref int value, int size);

    /// <summary>Matches the native title bar to the page theme so the window looks like one surface.</summary>
    public static void ApplyTheme(nint hwnd, bool dark, Color caption)
    {
        var enabled = dark ? 1 : 0;
        DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref enabled, sizeof(int));

        // COLORREF is 0x00BBGGRR.
        var colorRef = caption.R | (caption.G << 8) | (caption.B << 16);
        DwmSetWindowAttribute(hwnd, DwmwaCaptionColor, ref colorRef, sizeof(int));
    }
}
