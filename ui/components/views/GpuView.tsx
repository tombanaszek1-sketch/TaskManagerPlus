"use client";

import { useAppState } from "@/lib/app-state";
import { bytes, celsius, mhz, percent, watts } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { processGpu } from "@/lib/process-groups";
import { liveStore, useSnapshot } from "@/lib/store";
import { LiveChart } from "../charts/LiveChart";
import { Meter, Panel, Pill, Stat } from "../ui/primitives";
import { DeviceHeader, DeviceUsers, SensorTable, StatGrid } from "./shared";

const color = "var(--res-gpu)";

const engineOrder = ["3D", "Copy", "Video Decode", "Video Encode", "Compute"];
const seenEngines = new Map<string, Set<string>>();

/**
 * Engines in a fixed order instead of by current load, so tiles never swap places. Engines that
 * were active once stay visible (at 0 %) instead of disappearing between samples.
 */
function stableEngines(gpuId: string, current: Record<string, number>): [string, number][] {
  let seen = seenEngines.get(gpuId);
  if (!seen) {
    seen = new Set();
    seenEngines.set(gpuId, seen);
  }
  for (const name of Object.keys(current)) seen.add(name);

  const rank = (name: string) => {
    const index = engineOrder.indexOf(name);
    return index < 0 ? engineOrder.length : index;
  };
  return [...seen]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((name) => [name, current[name] ?? 0]);
}

export function GpuView({ id }: { id: string }) {
  const snapshot = useSnapshot();
  const { detail } = useAppState();
  const { t } = useI18n();
  const index = snapshot?.gpus.findIndex((g) => g.id === id) ?? -1;
  const gpu = snapshot?.gpus[index];
  if (!snapshot || !gpu) return null;

  const engines = stableEngines(gpu.id, gpu.engines);
  const users = snapshot.processes.filter((p) => p.gpu.some((g) => g.adapterId === gpu.id));

  return (
    <div>
      <DeviceHeader
        label={t("device.gpu", { n: index })}
        name={gpu.name}
        value={percent(gpu.utilization, 0)}
        color={color}
        meta={
          <>
            <Pill>{gpu.vendor}</Pill>
            <Pill>{gpu.isIntegrated ? t("device.integrated") : t("device.dedicated")}</Pill>
            {gpu.temperature !== undefined && <Pill tone={gpu.temperature > 85 ? "danger" : "neutral"}>{celsius(gpu.temperature)}</Pill>}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title={t("stat.utilization")} subtitle={t("engines.title")}>
          <LiveChart
            label={t("stat.utilization")}
            series={[
              { values: liveStore.getSeries(`gpu:${gpu.id}`), color, fill: true },
              { values: liveStore.getSeries(`gpu:${gpu.id}:vram`), color: "var(--accent-neutral)", dashed: true },
            ]}
            max={100}
            height={220}
          />
          <div className="mt-3 flex flex-wrap gap-4 text-caption-sm text-mute">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
              {t("stat.utilization")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full border-t border-dashed" style={{ borderColor: "var(--accent-neutral)" }} />
              {t("stat.dedicatedMemory")}
            </span>
          </div>
        </Panel>

        <Panel title={t("device.gpu", { n: index })}>
          <StatGrid>
            <Stat label={t("stat.utilization")} value={percent(gpu.utilization, 0)} accent={color} />
            <Stat label={t("stat.temperature")} value={celsius(gpu.temperature)} />
            <Stat label={t("stat.power")} value={watts(gpu.power)} />
            <Stat label={t("stat.coreClock")} value={mhz(gpu.coreClockMhz)} />
            <Stat label={t("stat.memoryClock")} value={mhz(gpu.memoryClockMhz)} />
            <Stat label={t("stat.fan")} value={gpu.fanRpm !== undefined ? `${Math.round(gpu.fanRpm)} RPM` : "–"} />
          </StatGrid>
          <div className="mt-5 space-y-3">
            <MemoryBar label={t("stat.dedicatedMemory")} used={gpu.dedicatedUsed} total={gpu.dedicatedTotal} color={color} />
            <MemoryBar label={t("stat.sharedMemory")} used={gpu.sharedUsed} total={gpu.sharedTotal} color="var(--accent-neutral)" />
          </div>
        </Panel>
      </div>

      <Panel className="mt-4" title={t("engines.title")}>
        {engines.length === 0 ? (
          <p className="text-body-sm text-mute">{t("users.empty")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {engines.map(([engine, value]) => (
              <div key={engine} className="rounded-md border border-hairline-soft bg-surface p-3">
                <div className="mb-1 flex justify-between text-caption-md">
                  <span className="text-body">{engine}</span>
                  <span className="tnum text-ink">{percent(value, 1)}</span>
                </div>
                <LiveChart label={engine} series={[{ values: liveStore.getSeries(`gpu:${gpu.id}:${engine}`), color, fill: true }]} max={100} height={48} grid={false} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-4">
        <DeviceUsers
          processes={users}
          measure={(p) => processGpu(p, gpu.id)}
          format={(v) => percent(v, 1)}
          total={100}
          color={color}
          extraColumns={[{ label: "col.vram", value: (p) => bytes(p.gpu.find((g) => g.adapterId === gpu.id)?.dedicatedBytes ?? 0) }]}
        />
      </div>

      {detail && (
        <div className="mt-4">
          <SensorTable sensors={gpu.sensors} />
        </div>
      )}
    </div>
  );
}

export function MemoryBar({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const share = total > 0 ? (used / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-caption-md">
        <span className="text-mute">{label}</span>
        <span className="tnum text-ink">
          {bytes(used)} / {bytes(total)}
        </span>
      </div>
      <Meter value={share} color={color} label={label} />
    </div>
  );
}
