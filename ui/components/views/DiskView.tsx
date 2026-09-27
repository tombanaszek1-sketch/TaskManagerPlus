"use client";

import { useAppState } from "@/lib/app-state";
import { bytes, celsius, ms, percent, rate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { processDisk } from "@/lib/process-groups";
import { liveStore, useSnapshot } from "@/lib/store";
import { LiveChart } from "../charts/LiveChart";
import { Meter, Panel, Pill, Stat } from "../ui/primitives";
import { DeviceHeader, DeviceUsers, SensorTable, StatGrid } from "./shared";

const color = "var(--res-disk)";
const readColor = "var(--accent-blue)";

export function DiskView({ id }: { id: string }) {
  const snapshot = useSnapshot();
  const { detail } = useAppState();
  const { t } = useI18n();
  const disk = snapshot?.disks.find((d) => d.id === id);
  if (!snapshot || !disk) return null;

  // With kernel tracing the host attributes I/O to the physical disk; without it only totals exist.
  const perDisk = snapshot.summary.tracingActive;
  const users = perDisk ? snapshot.processes.filter((p) => p.disks.some((d) => d.diskIndex === disk.index)) : snapshot.processes;

  return (
    <div>
      <DeviceHeader
        label={`${t("device.disk", { n: disk.index })}${disk.volumes.length ? ` · ${disk.volumes.map((v) => v.letter).join(" ")}` : ""}`}
        name={disk.name}
        value={percent(disk.activePercent, 0)}
        color={color}
        meta={
          <>
            <Pill>{disk.mediaType}</Pill>
            {disk.busType !== "Other" && <Pill>{disk.busType}</Pill>}
            <Pill>{bytes(disk.size, 0)}</Pill>
            {disk.lifeRemainingPercent !== undefined && (
              <Pill tone={disk.lifeRemainingPercent < 20 ? "danger" : "ok"}>
                {t("stat.health")} {percent(disk.lifeRemainingPercent, 0)}
              </Pill>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("stat.active")}>
          <LiveChart label={t("stat.active")} series={[{ values: liveStore.getSeries(`disk:${disk.id}`), color, fill: true }]} max={100} height={180} />
        </Panel>
        <Panel title={`${t("stat.read")} / ${t("stat.write")}`}>
          <LiveChart
            label={`${t("stat.read")} / ${t("stat.write")}`}
            series={[
              { values: liveStore.getSeries(`disk:${disk.id}:write`), color, fill: true },
              { values: liveStore.getSeries(`disk:${disk.id}:read`), color: readColor, dashed: true },
            ]}
            height={180}
            formatScale={(v) => rate(v)}
            binaryScale
          />
          <div className="mt-3 flex flex-wrap gap-4 text-caption-sm text-mute">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
              {t("stat.write")} {rate(disk.writeBytesPerSec)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: readColor }} />
              {t("stat.read")} {rate(disk.readBytesPerSec)}
            </span>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title={t("device.disk", { n: disk.index })}>
          <StatGrid>
            <Stat label={t("stat.active")} value={percent(disk.activePercent, 0)} accent={color} />
            <Stat label={t("stat.response")} value={ms(disk.averageResponseMs)} />
            <Stat label={t("stat.read")} value={rate(disk.readBytesPerSec)} />
            <Stat label={t("stat.write")} value={rate(disk.writeBytesPerSec)} />
            <Stat label={t("stat.temperature")} value={celsius(disk.temperature)} />
            <Stat label={t("stat.health")} value={disk.lifeRemainingPercent !== undefined ? percent(disk.lifeRemainingPercent, 0) : "–"} />
          </StatGrid>
        </Panel>
        <Panel title={t("volumes.title")}>
          {disk.volumes.length === 0 ? (
            <p className="text-body-sm text-mute">{t("common.none")}</p>
          ) : (
            <div className="space-y-4">
              {disk.volumes.map((volume) => {
                const used = volume.total - volume.free;
                const share = volume.total ? (used / volume.total) * 100 : 0;
                return (
                  <div key={volume.letter}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-body-sm text-ink">
                        {volume.letter} {volume.label && <span className="text-mute">{volume.label}</span>}
                        <span className="ml-2 text-caption-sm text-ash">{volume.fileSystem}</span>
                      </span>
                      <span className="tnum text-caption-md text-mute">{t("volumes.free", { free: bytes(volume.free), total: bytes(volume.total) })}</span>
                    </div>
                    <Meter value={share} color={share > 90 ? "var(--danger)" : color} label={volume.letter} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <DeviceUsers
          processes={users}
          measure={(p) => (perDisk ? processDisk(p, disk.index) : processDisk(p))}
          format={(v) => rate(v)}
          color={color}
        />
      </div>

      {detail && (
        <div className="mt-4">
          <SensorTable sensors={disk.sensors} />
        </div>
      )}
    </div>
  );
}
