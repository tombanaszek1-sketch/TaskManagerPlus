"use client";

import { useAppState } from "@/lib/app-state";
import { bytes, percent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { liveStore, useSnapshot } from "@/lib/store";
import { LiveChart } from "../charts/LiveChart";
import { Panel, Pill, Stat } from "../ui/primitives";
import { DeviceHeader, DeviceUsers, SensorTable, StatGrid } from "./shared";

const color = "var(--res-memory)";

export function MemoryView() {
  const snapshot = useSnapshot();
  const { detail } = useAppState();
  const { t } = useI18n();
  if (!snapshot) return null;
  const memory = snapshot.memory;
  const load = memory.total ? (memory.used / memory.total) * 100 : 0;
  const installed = Math.max(memory.installed, memory.total);
  const reserved = installed - memory.total;

  // Standby cache is part of "available"; split it out so the bar reads like Windows' own.
  const cached = Math.min(memory.cached, memory.available);
  const free = Math.max(0, memory.available - cached);
  const segments = [
    { label: t("stat.inUse"), value: memory.used, color },
    { label: t("stat.cached"), value: cached, color: "color-mix(in srgb, var(--res-memory) 35%, transparent)" },
    { label: t("stat.available"), value: free, color: "var(--surface-elevated)" },
    ...(reserved > 0 ? [{ label: t("stat.reserved"), value: reserved, color: "var(--stone)" }] : []),
  ];

  return (
    <div>
      <DeviceHeader
        label={t("device.memory")}
        name={`${bytes(installed, 0)} ${t("stat.installed").toLowerCase()}`}
        value={percent(load, 0)}
        color={color}
        meta={
          <>
            {memory.speedMts && <Pill>{memory.speedMts} MT/s</Pill>}
            {memory.modules.length > 0 && (
              <Pill>
                {memory.modules.length} × {bytes(memory.modules[0]?.capacity ?? 0, 0)}
              </Pill>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title={t("stat.utilization")}>
          <LiveChart label={t("stat.utilization")} series={[{ values: liveStore.getSeries("ram"), color, fill: true }]} max={100} height={220} />
        </Panel>
        <Panel title={t("device.memory")}>
          <StatGrid>
            <Stat label={t("stat.inUse")} value={bytes(memory.used)} accent={color} />
            <Stat label={t("stat.available")} value={bytes(memory.available)} />
            <Stat label={t("stat.installed")} value={bytes(installed)} />
            <Stat label={t("stat.usable")} value={bytes(memory.total)} />
            {reserved > 0 && <Stat label={t("stat.reserved")} value={bytes(reserved)} />}
            <Stat label={t("stat.cached")} value={bytes(memory.cached)} />
            <Stat label={t("stat.committed")} value={`${bytes(memory.committed)} / ${bytes(memory.commitLimit)}`} />
            <Stat label={t("stat.pagedPool")} value={bytes(memory.pagedPool)} />
            <Stat label={t("stat.nonPagedPool")} value={bytes(memory.nonPagedPool)} />
            <Stat label={t("stat.memorySpeed")} value={memory.speedMts ? `${memory.speedMts} MT/s` : "–"} />
            <Stat label={t("stat.slots")} value={memory.modules.length || "–"} />
          </StatGrid>
        </Panel>
      </div>

      <Panel className="mt-4" title={t("composition.title")}>
        <div className="flex h-8 w-full overflow-hidden rounded-md border border-hairline">
          {segments.map((segment) => (
            <div
              key={segment.label}
              title={`${segment.label}: ${bytes(segment.value)}`}
              className="h-full border-r border-hairline last:border-0"
              style={{ width: `${(segment.value / installed) * 100}%`, background: segment.color }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-caption-md">
          {segments.map((segment) => (
            <span key={segment.label} className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-xs border border-hairline" style={{ background: segment.color }} />
              <span className="text-mute">{segment.label}</span>
              <span className="tnum text-ink">{bytes(segment.value)}</span>
            </span>
          ))}
        </div>
        {reserved > 0 && (
          <p className="mt-3 text-caption-md text-mute">
            {t("stat.reserved")}: {t("stat.reservedHint")}
          </p>
        )}
      </Panel>

      {memory.modules.length > 0 && (
        <Panel className="mt-4" title={t("modules.title")} bodyClassName="p-0 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-body-sm">
            <thead>
              <tr className="border-b border-hairline-soft text-left text-caption-sm text-mute">
                <th className="px-4 py-2 font-medium">Slot</th>
                <th className="px-4 py-2 font-medium">{t("col.publisher")}</th>
                <th className="px-4 py-2 font-medium">Part</th>
                <th className="px-4 py-2 text-right font-medium">{t("stat.capacity")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("stat.memorySpeed")}</th>
              </tr>
            </thead>
            <tbody>
              {memory.modules.map((module) => (
                <tr key={module.slot} className="border-b border-hairline-soft last:border-0">
                  <td className="px-4 py-2 text-ink">{module.slot}</td>
                  <td className="px-4 py-2 text-body">{module.manufacturer || "–"}</td>
                  <td className="px-4 py-2 font-mono text-caption-md text-body">{module.partNumber || "–"}</td>
                  <td className="tnum px-4 py-2 text-right text-ink">{bytes(module.capacity, 0)}</td>
                  <td className="tnum px-4 py-2 text-right text-ink">{module.speedMts ? `${module.speedMts} MT/s` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="mt-4">
        <DeviceUsers processes={snapshot.processes} measure={(p) => p.workingSet} format={(v) => bytes(v)} total={memory.total} color={color} />
      </div>

      {detail && (
        <div className="mt-4">
          <SensorTable sensors={memory.sensors} />
        </div>
      )}
    </div>
  );
}
