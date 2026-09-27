import type { View } from "./app-state";
import type { Translate } from "./i18n";
import type { Snapshot } from "./types";
import { bitrate, bytes, celsius, mhz, percent } from "./format";

export type DeviceKind = "cpu" | "gpu" | "memory" | "disk" | "adapter";

export interface DeviceSummary {
  kind: DeviceKind;
  view: View;
  key: string;
  label: string;
  name: string;
  /** Headline value shown on tiles and in the sidebar. */
  value: string;
  /** 0..100 load used for meters. */
  load: number;
  color: string;
  /** Live series key(s) for sparklines. */
  seriesKeys: string[];
  seriesMax?: number;
  detail: string;
  /** Integrated graphics share memory with the CPU and get a smaller tile. */
  integrated?: boolean;
}

export const resourceColor = {
  cpu: "var(--res-cpu)",
  gpu: "var(--res-gpu)",
  memory: "var(--res-memory)",
  disk: "var(--res-disk)",
  adapter: "var(--res-network)",
} as const;

/** Every device in the snapshot, in the order they appear in the sidebar and on the overview. */
export function listDevices(snapshot: Snapshot, t: Translate): DeviceSummary[] {
  const devices: DeviceSummary[] = [];

  snapshot.cpus.forEach((cpu, i) => {
    devices.push({
      kind: "cpu",
      view: { kind: "cpu", id: cpu.id },
      key: `cpu:${cpu.id}`,
      label: snapshot.cpus.length > 1 ? `${t("device.cpu")} ${i}` : t("device.cpu"),
      name: cpu.name,
      value: percent(cpu.utilization, 0),
      load: cpu.utilization,
      color: resourceColor.cpu,
      seriesKeys: [`cpu:${cpu.id}`],
      seriesMax: 100,
      detail: [cpu.clockMhz ? mhz(cpu.clockMhz) : undefined, cpu.temperature ? celsius(cpu.temperature) : undefined]
        .filter(Boolean)
        .join(" · "),
    });
  });

  snapshot.gpus.forEach((gpu, i) => {
    devices.push({
      kind: "gpu",
      view: { kind: "gpu", id: gpu.id },
      key: `gpu:${gpu.id}`,
      label: t("device.gpu", { n: i }),
      name: gpu.name,
      value: percent(gpu.utilization, 0),
      load: gpu.utilization,
      color: resourceColor.gpu,
      seriesKeys: [`gpu:${gpu.id}`],
      integrated: gpu.isIntegrated,
      seriesMax: 100,
      detail: [`${bytes(gpu.dedicatedUsed)} / ${bytes(gpu.dedicatedTotal)}`, gpu.temperature ? celsius(gpu.temperature) : undefined]
        .filter(Boolean)
        .join(" · "),
    });
  });

  const memoryLoad = snapshot.memory.total ? (snapshot.memory.used / snapshot.memory.total) * 100 : 0;
  devices.push({
    kind: "memory",
    view: { kind: "memory" },
    key: "memory",
    label: t("device.memory"),
    name: `${bytes(snapshot.memory.installed || snapshot.memory.total, 0)}${snapshot.memory.speedMts ? ` · ${snapshot.memory.speedMts} MT/s` : ""}`,
    value: percent(memoryLoad, 0),
    load: memoryLoad,
    color: resourceColor.memory,
    seriesKeys: ["ram"],
    seriesMax: 100,
    detail: `${bytes(snapshot.memory.used)} / ${bytes(snapshot.memory.total)}`,
  });

  snapshot.disks.forEach((disk) => {
    devices.push({
      kind: "disk",
      view: { kind: "disk", id: disk.id },
      key: `disk:${disk.id}`,
      label: `${t("device.disk", { n: disk.index })}${disk.volumes.length ? ` (${disk.volumes.map((v) => v.letter).join(" ")})` : ""}`,
      name: disk.name,
      value: percent(disk.activePercent, 0),
      load: disk.activePercent,
      color: resourceColor.disk,
      seriesKeys: [`disk:${disk.id}`],
      seriesMax: 100,
      detail: `${disk.mediaType}${disk.busType !== "Other" ? ` · ${disk.busType}` : ""}`,
    });
  });

  snapshot.adapters
    .filter((a) => a.isUp && a.kind !== "Virtual")
    .forEach((adapter) => {
      const throughput = adapter.receiveBytesPerSec + adapter.sendBytesPerSec;
      const link = adapter.linkSpeedBitsPerSec / 8;
      devices.push({
        kind: "adapter",
        view: { kind: "adapter", id: adapter.id },
        key: `net:${adapter.id}`,
        label: adapter.kind === "Wi-Fi" ? "Wi-Fi" : adapter.name,
        name: adapter.description,
        value: bitrate(adapter.receiveBytesPerSec),
        load: link > 0 ? (throughput / link) * 100 : 0,
        color: resourceColor.adapter,
        seriesKeys: [`net:${adapter.id}:down`, `net:${adapter.id}:up`],
        detail: `↓ ${bitrate(adapter.receiveBytesPerSec)} · ↑ ${bitrate(adapter.sendBytesPerSec)}`,
      });
    });

  return devices;
}
