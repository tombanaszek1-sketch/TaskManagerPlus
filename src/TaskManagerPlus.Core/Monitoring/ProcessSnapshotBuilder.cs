using TaskManagerPlus.Core.Interop;
using TaskManagerPlus.Core.Model;
using TaskManagerPlus.Core.Performance;
using TaskManagerPlus.Core.Processes;
using TaskManagerPlus.Core.Security;
using TaskManagerPlus.Core.Tracing;

namespace TaskManagerPlus.Core.Monitoring;

/// <summary>Combines raw process samples, metadata, GPU usage and traced I/O into <see cref="ProcessSnapshot"/>s.</summary>
internal sealed class ProcessSnapshotBuilder(ProcessMetadataCache metadata, SignatureCache signatures)
{
    private static readonly IReadOnlyList<GpuProcessUsage> NoGpu = [];
    private static readonly IReadOnlyList<DiskProcessUsage> NoDisks = [];
    private static readonly IReadOnlyList<string> NoReasons = [];

    public IReadOnlyList<ProcessSnapshot> Build(
        IReadOnlyList<RawProcess> raw,
        GpuUsage gpu,
        IReadOnlyDictionary<int, ProcessIoRates>? tracedIo)
    {
        var windows = User32.GetVisibleWindows();
        var ownPid = Environment.ProcessId;

        var facts = new List<(RawProcess Raw, ProcessMetadata Meta, SignatureInfo Signature, bool Critical, string? Window)>(raw.Count);
        foreach (var process in raw)
        {
            var meta = metadata.Get(process.Pid, process.CreateTime);
            var signature = signatures.Get(meta.Path);
            var critical = ProcessClassifier.IsCritical(process.Pid, process.Name, meta.Path);
            windows.TryGetValue(process.Pid, out var window);
            facts.Add((process, meta, signature, critical, window));
        }

        metadata.Retain(raw.Select(r => (r.Pid, r.CreateTime)));

        var baseCategory = facts.ToDictionary(
            f => f.Raw.Pid,
            f => ProcessClassifier.Classify(new ProcessFacts(f.Raw.Pid, f.Raw.Name, f.Meta.Path, false, f.Signature.IsMicrosoft)));

        var groups = ProcessGrouper.BuildGroups(facts
            .Select(f => new GroupNode(f.Raw.Pid, f.Raw.ParentPid, f.Raw.CreateTime, f.Raw.Name, f.Meta.Path, baseCategory[f.Raw.Pid] == ProcessCategory.Windows))
            .ToList());

        // A group is an app as soon as any member owns a visible window (e.g. Discord's main window lives in one of six processes).
        var groupsWithWindow = facts
            .Where(f => f.Window is not null && !f.Critical)
            .Select(f => groups[f.Raw.Pid])
            .ToHashSet();

        var result = new List<ProcessSnapshot>(facts.Count);
        foreach (var (process, meta, signature, critical, window) in facts)
        {
            var groupId = groups[process.Pid];
            var category = baseCategory[process.Pid];

            // Helpers take the folder of the program that owns them (a WebView2 of the search host is Windows).
            if (baseCategory.TryGetValue(groupId, out var rootCategory) && rootCategory == ProcessCategory.Windows)
            {
                category = ProcessCategory.Windows;
            }
            else if (category != ProcessCategory.Windows && groupsWithWindow.Contains(groupId))
            {
                category = ProcessCategory.App;
            }

            if (process.Pid == ownPid)
            {
                category = ProcessCategory.App;
            }

            double diskRead = process.IoReadBytesPerSec, diskWrite = process.IoWriteBytesPerSec, netIn = 0, netOut = 0;
            var disks = NoDisks;
            if (tracedIo is not null)
            {
                diskRead = diskWrite = 0;
                if (tracedIo.TryGetValue(process.Pid, out var io))
                {
                    diskRead = io.DiskRead;
                    diskWrite = io.DiskWrite;
                    netIn = io.NetReceive;
                    netOut = io.NetSend;
                    if (io.Disks.Count > 0)
                    {
                        disks = io.Disks.Select(d => new DiskProcessUsage(d.Key, Math.Round(d.Value.Read), Math.Round(d.Value.Write))).ToList();
                    }
                }
            }

            var gpuUsage = NoGpu;
            if (gpu.Processes.TryGetValue(process.Pid, out var byAdapter))
            {
                gpuUsage = byAdapter
                    .Select(a => new GpuProcessUsage(a.Key, Math.Round(a.Value.Utilization, 2), a.Value.Engines, a.Value.DedicatedBytes, a.Value.SharedBytes))
                    .ToList();
            }

            var isSelf = SelfIdentity.IsSelf(process.Pid, meta.Path);
            var (threat, reasons) = isSelf
                ? (ThreatLevel.None, NoReasons)
                : ThreatAssessor.Assess(new ThreatFacts(
                    process.Name,
                    meta.Path,
                    meta.Path is not null,
                    critical,
                    signature.State,
                    netIn + netOut));

            result.Add(new ProcessSnapshot(
                process.Pid,
                process.ParentPid,
                groupId,
                process.Name,
                meta.Path,
                meta.Description,
                meta.Company,
                category,
                critical,
                isSelf,
                window,
                process.SessionId,
                process.CreateTime > 0 ? DateTimeOffset.FromFileTime(process.CreateTime) : null,
                Math.Round(process.CpuPercent, 2),
                process.WorkingSet,
                process.PrivateBytes,
                process.Threads,
                process.Handles,
                Math.Round(diskRead),
                Math.Round(diskWrite),
                disks,
                Math.Round(netIn),
                Math.Round(netOut),
                gpuUsage,
                signature.State,
                signature.Signer,
                threat,
                reasons));
        }

        return result;
    }
}
