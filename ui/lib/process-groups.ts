import type { ProcessCategory, ProcessSnapshot, ThreatLevel } from "./types";

export interface ProcessGroup {
  id: number;
  root: ProcessSnapshot;
  members: ProcessSnapshot[];
  displayName: string;
  category: ProcessCategory;
  cpu: number;
  workingSet: number;
  gpu: number;
  disk: number;
  network: number;
  threads: number;
  handles: number;
  threat: ThreatLevel;
  isCritical: boolean;
}

export type SortKey = "name" | "cpu" | "memory" | "gpu" | "disk" | "network" | "pid" | "threads" | "handles" | "publisher";

const threatRank: Record<ThreatLevel, number> = { none: 0, notice: 1, warning: 2 };

export function processGpu(process: ProcessSnapshot, adapterId?: string): number {
  if (adapterId) return process.gpu.find((g) => g.adapterId === adapterId)?.utilization ?? 0;
  return process.gpu.reduce((max, g) => Math.max(max, g.utilization), 0);
}

export function processDisk(process: ProcessSnapshot, diskIndex?: number): number {
  if (diskIndex === undefined) return process.diskReadBytesPerSec + process.diskWriteBytesPerSec;
  const usage = process.disks.find((d) => d.diskIndex === diskIndex);
  return usage ? usage.readBytesPerSec + usage.writeBytesPerSec : 0;
}

export function processNetwork(process: ProcessSnapshot): number {
  return process.netReceiveBytesPerSec + process.netSendBytesPerSec;
}

/** Human readable name: the file description when present ("Google Chrome"), otherwise the image name. */
export function displayName(process: ProcessSnapshot): string {
  if (process.description && process.description.length <= 60) return process.description;
  return process.name;
}

export function matchesSearch(process: ProcessSnapshot, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    process.name.toLowerCase().includes(q) ||
    (process.description?.toLowerCase().includes(q) ?? false) ||
    (process.windowTitle?.toLowerCase().includes(q) ?? false) ||
    (process.company?.toLowerCase().includes(q) ?? false) ||
    String(process.pid) === q
  );
}

export function groupProcesses(processes: ProcessSnapshot[], query: string): ProcessGroup[] {
  const byGroup = new Map<number, ProcessSnapshot[]>();
  for (const process of processes) {
    const list = byGroup.get(process.groupId);
    if (list) list.push(process);
    else byGroup.set(process.groupId, [process]);
  }

  const groups: ProcessGroup[] = [];
  for (const [id, members] of byGroup) {
    if (query && !members.some((m) => matchesSearch(m, query))) continue;
    const root = members.find((m) => m.pid === id) ?? members[0]!;
    // Root first, then by process id, so expanded groups keep a fixed order between updates.
    members.sort((a, b) => (a.pid === id ? -1 : b.pid === id ? 1 : a.pid - b.pid));

    // GPU load of a group is the load of its busiest adapter, summed over members.
    const perAdapter = new Map<string, number>();
    for (const m of members) for (const g of m.gpu) perAdapter.set(g.adapterId, (perAdapter.get(g.adapterId) ?? 0) + g.utilization);

    groups.push({
      id,
      root,
      members,
      displayName: displayName(root),
      category: members.some((m) => m.category === "app") && root.category !== "windows" ? "app" : root.category,
      cpu: members.reduce((s, m) => s + m.cpu, 0),
      workingSet: members.reduce((s, m) => s + m.workingSet, 0),
      gpu: Math.min(100, Math.max(0, ...perAdapter.values())),
      disk: members.reduce((s, m) => s + processDisk(m), 0),
      network: members.reduce((s, m) => s + processNetwork(m), 0),
      threads: members.reduce((s, m) => s + m.threads, 0),
      handles: members.reduce((s, m) => s + m.handles, 0),
      threat: members.reduce<ThreatLevel>((t, m) => (threatRank[m.threat] > threatRank[t] ? m.threat : t), "none"),
      isCritical: members.some((m) => m.isCritical),
    });
  }
  return groups;
}

function sortValue(g: ProcessGroup, key: SortKey): number | string {
  switch (key) {
    case "name":
      return g.displayName.toLowerCase();
    case "cpu":
      return g.cpu;
    case "memory":
      return g.workingSet;
    case "gpu":
      return g.gpu;
    case "disk":
      return g.disk;
    case "network":
      return g.network;
    case "pid":
      return g.root.pid;
    case "threads":
      return g.threads;
    case "handles":
      return g.handles;
    case "publisher":
      return (g.root.signer ?? g.root.company ?? "").toLowerCase();
  }
}

export function compareGroups(key: SortKey, descending: boolean): (a: ProcessGroup, b: ProcessGroup) => number {
  return (a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const result = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
    return descending ? -result : result;
  };
}

export function sortGroups(groups: ProcessGroup[], key: SortKey, descending: boolean): ProcessGroup[] {
  return [...groups].sort(compareGroups(key, descending));
}