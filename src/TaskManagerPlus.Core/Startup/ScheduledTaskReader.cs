namespace TaskManagerPlus.Core.Startup;

public sealed record LogonTask(string Name, string Path, string Command, bool Enabled);

/// <summary>Reads non-Microsoft scheduled tasks that run at logon or boot, through the Task Scheduler COM API.</summary>
public static class ScheduledTaskReader
{
    private const int TriggerBoot = 8;
    private const int TriggerLogon = 9;
    private const int ActionExec = 0;
    private const int EnumHidden = 1;

    public static IReadOnlyList<LogonTask> ReadLogonTasks()
    {
        var result = new List<LogonTask>();
        try
        {
            dynamic service = Connect();
            Walk(service.GetFolder(@"\"), result);
        }
        catch (Exception e) when (e is System.Runtime.InteropServices.COMException or UnauthorizedAccessException or InvalidCastException)
        {
            // Task Scheduler unavailable; autostart list continues without tasks.
        }

        return result;
    }

    public static void SetEnabled(string taskPath, bool enabled)
    {
        dynamic service = Connect();
        dynamic task = service.GetFolder(@"\").GetTask(taskPath);
        task.Enabled = enabled;
    }

    private static dynamic Connect()
    {
        var type = Type.GetTypeFromProgID("Schedule.Service") ?? throw new InvalidOperationException("Task Scheduler is not available.");
        dynamic service = Activator.CreateInstance(type)!;
        service.Connect();
        return service;
    }

    private static void Walk(dynamic folder, List<LogonTask> result)
    {
        string folderPath = folder.Path;
        if (folderPath.StartsWith(@"\Microsoft", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        foreach (dynamic task in folder.GetTasks(EnumHidden))
        {
            try
            {
                dynamic definition = task.Definition;
                var atLogon = false;
                foreach (dynamic trigger in definition.Triggers)
                {
                    int type = trigger.Type;
                    atLogon |= type is TriggerLogon or TriggerBoot;
                }

                if (!atLogon)
                {
                    continue;
                }

                string? command = null;
                foreach (dynamic action in definition.Actions)
                {
                    if ((int)action.Type == ActionExec)
                    {
                        string path = action.Path ?? string.Empty;
                        string arguments = action.Arguments ?? string.Empty;
                        command = $"\"{path.Trim('"')}\" {arguments}".Trim();
                        break;
                    }
                }

                if (command is not null)
                {
                    result.Add(new LogonTask((string)task.Name, (string)task.Path, command, (bool)task.Enabled));
                }
            }
            catch (System.Runtime.InteropServices.COMException)
            {
                // Tasks we are not allowed to read are skipped.
            }
        }

        foreach (dynamic sub in folder.GetFolders(0))
        {
            Walk(sub, result);
        }
    }
}
