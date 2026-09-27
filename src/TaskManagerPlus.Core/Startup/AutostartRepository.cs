using Microsoft.Win32;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Processes;
using TaskManagerPlus.Core.Security;

namespace TaskManagerPlus.Core.Startup;

/// <summary>Lists and toggles programs that start with Windows (Run keys, Startup folders, logon tasks).</summary>
public sealed class AutostartRepository(SignatureCache signatures, ProcessMetadataCache metadata)
{
    private const string RunPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Run32Path = @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";

    private static readonly string UserStartupFolder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
    private static readonly string CommonStartupFolder = Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup);

    public IReadOnlyList<AutostartEntry> List()
    {
        var entries = new List<AutostartEntry>();
        ReadRunKey(entries, Registry.CurrentUser, RunPath, AutostartSource.RegistryUser, "Run");
        ReadRunKey(entries, Registry.LocalMachine, RunPath, AutostartSource.RegistryMachine, "Run");
        ReadRunKey(entries, Registry.LocalMachine, Run32Path, AutostartSource.RegistryMachine32, "Run32");
        ReadFolder(entries, UserStartupFolder, Registry.CurrentUser, AutostartSource.StartupFolderUser);
        ReadFolder(entries, CommonStartupFolder, Registry.LocalMachine, AutostartSource.StartupFolderCommon);
        entries.AddRange(ScheduledTaskReader.ReadLogonTasks().Select(t => Create(
            $"task|{t.Path}",
            t.Name,
            t.Command,
            AutostartSource.ScheduledTask,
            t.Path,
            t.Enabled,
            canToggle: true,
            isOwnTask: SelfIdentity.IsStartupTask(t.Path))));

        return entries
            .OrderByDescending(e => e.Enabled)
            .ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public void SetEnabled(string id, bool enabled)
    {
        var parts = id.Split('|', 3);
        switch (parts[0])
        {
            case "task":
                ScheduledTaskReader.SetEnabled(parts[1], enabled);
                return;
            case "reg" or "folder":
                var (hive, approvalKey, valueName) = ParseApproval(parts);
                using (var key = hive.CreateSubKey(StartupApproval.BasePath + approvalKey, writable: true))
                {
                    key.SetValue(valueName, StartupApproval.Encode(enabled, DateTime.UtcNow), RegistryValueKind.Binary);
                }

                return;
            default:
                throw new ArgumentException($"Unknown autostart entry '{id}'.", nameof(id));
        }
    }

    private static (RegistryKey Hive, string ApprovalKey, string ValueName) ParseApproval(string[] parts)
    {
        // reg|<source>|<value name>  or  folder|<source>|<file name>
        var source = Enum.Parse<AutostartSource>(parts[1]);
        return source switch
        {
            AutostartSource.RegistryUser => (Registry.CurrentUser, "Run", parts[2]),
            AutostartSource.RegistryMachine => (Registry.LocalMachine, "Run", parts[2]),
            AutostartSource.RegistryMachine32 => (Registry.LocalMachine, "Run32", parts[2]),
            AutostartSource.StartupFolderUser => (Registry.CurrentUser, "StartupFolder", parts[2]),
            AutostartSource.StartupFolderCommon => (Registry.LocalMachine, "StartupFolder", parts[2]),
            _ => throw new ArgumentException("Scheduled tasks are not approval based."),
        };
    }

    private void ReadRunKey(List<AutostartEntry> entries, RegistryKey hive, string path, AutostartSource source, string approvalKey)
    {
        using var key = hive.OpenSubKey(path);
        if (key is null)
        {
            return;
        }

        using var approval = hive.OpenSubKey(StartupApproval.BasePath + approvalKey);
        foreach (var name in key.GetValueNames().Where(n => n.Length > 0))
        {
            var command = key.GetValue(name)?.ToString() ?? string.Empty;
            var enabled = StartupApproval.IsEnabled(approval?.GetValue(name) as byte[]);
            entries.Add(Create($"reg|{source}|{name}", name, command, source, $@"{hive.Name}\{path}", enabled, canToggle: true));
        }
    }

    private void ReadFolder(List<AutostartEntry> entries, string folder, RegistryKey hive, AutostartSource source)
    {
        if (!Directory.Exists(folder))
        {
            return;
        }

        using var approval = hive.OpenSubKey(StartupApproval.BasePath + "StartupFolder");
        foreach (var file in Directory.EnumerateFiles(folder).Where(f => !f.EndsWith("desktop.ini", StringComparison.OrdinalIgnoreCase)))
        {
            var fileName = Path.GetFileName(file);
            var target = file.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) ? ShortcutReader.ResolveTarget(file) ?? file : file;
            var enabled = StartupApproval.IsEnabled(approval?.GetValue(fileName) as byte[]);
            entries.Add(Create($"folder|{source}|{fileName}", Path.GetFileNameWithoutExtension(file), $"\"{target}\"", source, folder, enabled, canToggle: true));
        }
    }

    private AutostartEntry Create(string id, string name, string command, AutostartSource source, string location, bool enabled, bool canToggle, bool isOwnTask = false)
    {
        var image = CommandLine.ExtractImagePath(command);
        var signature = signatures.GetNow(image);
        var publisher = signature.Signer ?? (image is null ? null : metadata.GetVersionInfo(image).Company);
        return new AutostartEntry(id, name, command, image, publisher, source, location, enabled, canToggle, signature.State, isOwnTask || SelfIdentity.IsSelfPath(image));
    }
}
