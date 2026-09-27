namespace TaskManagerPlus.Core.Startup;

/// <summary>
/// Encodes the "StartupApproved" registry values Windows uses to enable or disable autostart entries
/// without deleting them. This is the same mechanism the Windows Task Manager uses, so both stay in sync.
/// </summary>
public static class StartupApproval
{
    public const string BasePath = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\";

    /// <summary>An entry without an approval value is enabled; otherwise the low bit of the first byte marks "disabled".</summary>
    public static bool IsEnabled(byte[]? value) => value is not { Length: > 0 } || (value[0] & 0x01) == 0;

    public static byte[] Encode(bool enabled, DateTime utcNow)
    {
        var value = new byte[12];
        value[0] = enabled ? (byte)0x02 : (byte)0x03;
        if (!enabled)
        {
            BitConverter.TryWriteBytes(value.AsSpan(4), utcNow.ToFileTimeUtc());
        }

        return value;
    }
}
