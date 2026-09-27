using System.Management;
using System.ServiceProcess;
using TaskManagerPlus.Core.Interop;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Security;
using TaskManagerPlus.Core.Startup;

namespace TaskManagerPlus.Core.Services;

public enum ServiceAction
{
    Start,
    Stop,
    Restart,
}

public enum ServiceStartMode
{
    Automatic,
    AutomaticDelayed,
    Manual,
    Disabled,
}

/// <summary>Lists Windows services with their binaries and signers, and changes their state or start mode.</summary>
public sealed class ServiceRepository(SignatureCache signatures)
{
    private static readonly TimeSpan ActionTimeout = TimeSpan.FromSeconds(20);

    public IReadOnlyList<ServiceEntry> List()
    {
        var entries = new List<ServiceEntry>();
        using var searcher = new ManagementObjectSearcher(
            "SELECT Name, DisplayName, Description, State, StartMode, DelayedAutoStart, PathName, ProcessId, StartName, AcceptStop FROM Win32_Service");
        using var results = searcher.Get();

        foreach (var item in results)
        {
            using (item)
            {
                var image = CommandLine.ExtractImagePath(item["PathName"]?.ToString());
                var signature = signatures.GetNow(image);
                var pid = Convert.ToInt32(item["ProcessId"] ?? 0);

                entries.Add(new ServiceEntry(
                    $"{item["Name"]}",
                    $"{item["DisplayName"]}",
                    item["Description"]?.ToString(),
                    $"{item["State"]}",
                    $"{item["StartMode"]}",
                    item["DelayedAutoStart"] is true,
                    image,
                    pid > 0 ? pid : null,
                    $"{item["StartName"]}",
                    signature.IsMicrosoft,
                    item["AcceptStop"] is true,
                    signature.State,
                    signature.Signer));
            }
        }

        return entries
            .OrderBy(e => e.IsMicrosoft)
            .ThenBy(e => e.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public void Execute(string name, ServiceAction action)
    {
        using var controller = new ServiceController(name);
        switch (action)
        {
            case ServiceAction.Start:
                controller.Start();
                controller.WaitForStatus(ServiceControllerStatus.Running, ActionTimeout);
                break;
            case ServiceAction.Stop:
                controller.Stop(stopDependentServices: true);
                controller.WaitForStatus(ServiceControllerStatus.Stopped, ActionTimeout);
                break;
            case ServiceAction.Restart:
                if (controller.Status != ServiceControllerStatus.Stopped)
                {
                    controller.Stop(stopDependentServices: true);
                    controller.WaitForStatus(ServiceControllerStatus.Stopped, ActionTimeout);
                }

                controller.Start();
                controller.WaitForStatus(ServiceControllerStatus.Running, ActionTimeout);
                break;
        }
    }

    public void SetStartMode(string name, ServiceStartMode mode)
    {
        var (startType, delayed) = mode switch
        {
            ServiceStartMode.Automatic => (2u, false),
            ServiceStartMode.AutomaticDelayed => (2u, true),
            ServiceStartMode.Manual => (3u, false),
            ServiceStartMode.Disabled => (4u, false),
            _ => throw new ArgumentOutOfRangeException(nameof(mode)),
        };
        AdvApi32.SetStartType(name, startType, delayed);
    }
}
