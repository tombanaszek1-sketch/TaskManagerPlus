"use client";

import { useAppState } from "@/lib/app-state";
import { bytes, celsius, duration, mhz, number, percent, watts } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { liveStore, useSnapshot } from "@/lib/store";
import { LiveChart } from "../charts/LiveChart";
import { Panel, Pill, Stat } from "../ui/primitives";
import { SensorDriverCallout } from "./SensorDriverCallout";
import { DeviceHeader, DeviceUsers, SensorTable, StatGrid } from "./shared";

const color = "var(--res-cpu)";

export function CpuView({ id }: { id: string }) {
  const snapshot = useSnapshot();
  const { detail } = useAppState();
  const { t } = useI18n();
  const cpu = snapshot?.cpus.find((c) => c.id === id);
  if (!snapshot || !cpu) return null;

  return (
    <div>
      <DeviceHeader
        label={t("device.cpu")}
        name={cpu.name}
        value={percent(cpu.utilization, 0)}
        color={color}
        meta={
          <>
            <Pill>
              {cpu.cores} {t("stat.cores")}
            </Pill>
            <Pill>
              {cpu.logicalProcessors} {t("stat.logical")}
            </Pill>
            {cpu.temperature !== undefined && <Pill tone={cpu.temperature > 85 ? "danger" : "neutral"}>{celsius(cpu.temperature)}</Pill>}
          </>
        }
      />

      <SensorDriverCallout className="mb-4" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title={t("stat.utilization")}>
          <LiveChart label={t("stat.utilization")} series={[{ values: liveStore.getSeries(`cpu:${cpu.id}`), color, fill: true }]} max={100} height={220} />
        </Panel>
        <Panel title={t("device.cpu")}>
          <StatGrid>
            <Stat label={t("stat.utilization")} value={percent(cpu.utilization, 0)} accent={color} />
            <Stat label={t("stat.speed")} value={mhz(cpu.clockMhz)} />
            <Stat label={t("stat.baseSpeed")} value={mhz(cpu.baseClockMhz)} />
            <Stat label={t("stat.temperature")} value={cpu.temperature !== undefined ? celsius(cpu.temperature) : "–"} hint={cpu.temperature === undefined ? t("stat.fallbackNote") : undefined} />
            <Stat label={t("stat.power")} value={watts(cpu.packagePower)} />
            <Stat label={t("stat.processes")} value={number(snapshot.summary.processCount)} />
            <Stat label={t("stat.threads")} value={number(snapshot.summary.threadCount)} />
            <Stat label={t("stat.handles")} value={number(snapshot.summary.handleCount)} />
            <Stat label={t("stat.uptime")} value={duration(snapshot.summary.uptimeSeconds)} />
            {cpu.l2CacheBytes ? <Stat label={t("stat.l2")} value={bytes(cpu.l2CacheBytes)} /> : null}
            {cpu.l3CacheBytes ? <Stat label={t("stat.l3")} value={bytes(cpu.l3CacheBytes)} /> : null}
          </StatGrid>
        </Panel>
      </div>

      <Panel className="mt-4" title={t("cores.title")} subtitle={`${cpu.logicalLoads.length}`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {cpu.logicalLoads.map((load, index) => (
            <div key={index} className="rounded-md border border-hairline-soft bg-surface p-2">
              <div className="mb-1 flex justify-between text-caption-sm">
                <span className="text-ash">#{index}</span>
                <span className="tnum text-mute">{percent(load, 0)}</span>
              </div>
              <LiveChart label={`#${index}`} series={[{ values: liveStore.getSeries(`cpu:${cpu.id}:${index}`), color, fill: true }]} max={100} height={40} grid={false} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4">
        <DeviceUsers processes={snapshot.processes.filter((p) => p.pid !== 0)} measure={(p) => p.cpu} format={(v) => percent(v, 1)} total={100} color={color} />
      </div>

      {detail && (
        <div className="mt-4">
          <SensorTable sensors={cpu.sensors} />
        </div>
      )}
    </div>
  );
}
