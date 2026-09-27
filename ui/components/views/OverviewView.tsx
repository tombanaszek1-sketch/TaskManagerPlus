"use client";

import { ArrowRight, Cpu, HardDrive, MemoryStick, Monitor, Network, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAppState } from "@/lib/app-state";
import { bytes, duration, number, percent, rate } from "@/lib/format";
import { listDevices, type DeviceKind, type DeviceSummary } from "@/lib/devices";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { groupProcesses, type ProcessGroup } from "@/lib/process-groups";
import { useSmoothed } from "@/lib/smoothing";
import { useStableOrder } from "@/lib/stable-order";
import { liveStore, useSnapshot } from "@/lib/store";
import { LiveChart } from "../charts/LiveChart";
import { SensorDriverCallout } from "./SensorDriverCallout";
import { ProcessIcon } from "../process/ProcessIcon";
import { Meter, PageHeader, cx } from "../ui/primitives";

const icons: Record<DeviceKind, typeof Cpu> = { cpu: Cpu, gpu: Monitor, memory: MemoryStick, disk: HardDrive, adapter: Network };

function DeviceTile({ device, span }: { device: DeviceSummary; span: "one" | "two" | "full" }) {
  const { navigate } = useAppState();
  const Icon = icons[device.kind];
  return (
    <button
      type="button"
      onClick={() => navigate(device.view)}
      className={cx(
        "group flex min-w-0 flex-col rounded-lg border border-hairline bg-card p-4 text-left transition-colors duration-150 hover:border-hairline-strong",
        span === "two" && "sm:col-span-2",
        span === "full" && "sm:col-span-2 xl:col-span-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-caption-sm font-medium tracking-[0.4px] uppercase" style={{ color: device.color }}>
            <Icon className="size-3.5" strokeWidth={2} aria-hidden />
            {device.label}
          </div>
          <div className="mt-1 truncate text-body-sm text-ink" title={device.name}>
            {device.name}
          </div>
        </div>
        <div className="tnum shrink-0 text-heading-lg font-medium text-ink">{device.value}</div>
      </div>
      <div className="mt-3">
        <LiveChart
          label={device.label}
          series={device.seriesKeys.map((key, i) => ({ values: liveStore.getSeries(key), color: i === 0 ? device.color : "var(--accent-blue)", fill: i === 0, dashed: i > 0 }))}
          max={device.seriesMax}
          height={span === "one" ? 64 : 84}
          grid={false}
          window={span === "full" ? 120 : 60}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-caption-md">
        <span className="tnum truncate text-mute">{device.detail}</span>
        <ArrowRight className="size-3.5 shrink-0 text-ash transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.75} aria-hidden />
      </div>
    </button>
  );
}

/** Ranks in the top lists change at most this often; the numbers stay live. */
const RANK_INTERVAL_MS = 5000;

function TopList({
  title,
  groups,
  value,
  format,
  color,
  version,
}: {
  title: MessageKey;
  groups: ProcessGroup[];
  value: (g: ProcessGroup) => number;
  format: (v: number) => string;
  color: string;
  /** Changes once per sample; drives the smoothing. */
  version: unknown;
}) {
  const { t } = useI18n();
  const { openProcess } = useAppState();
  // Smoothed over a few seconds with a short hold, then ranked with a clear-lead rule: small, bursty
  // values otherwise make the five rows swap every second.
  const smoothed = useSmoothed(groups, (g) => g.id, value, version, title);
  const leader = smoothed.reduce((m, s) => Math.max(m, s.value), 0);
  const ranked = useStableOrder(smoothed, (s) => s.item.id, (s) => s.value, (a, b) => b.value - a.value, title, 0.25, leader * 0.05, RANK_INTERVAL_MS);
  const top = ranked.slice(0, 5);
  const max = top.reduce((m, s) => Math.max(m, s.value), 0);

  return (
    <div className="rounded-lg border border-hairline bg-card">
      <div className="border-b border-hairline-soft px-4 py-2.5 text-caption-sm font-medium tracking-[0.4px] text-mute">{t(title)}</div>
      <ul className="p-1.5">
        {top.length === 0 && <li className="px-2.5 py-2 text-caption-md text-ash">{t("users.empty")}</li>}
        {top.map(({ item: group, value: current }) => (
          <li key={group.id}>
            <button type="button" onClick={() => openProcess(group.root.pid)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-hover">
              <ProcessIcon name={group.root.name} path={group.root.path} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm text-ink">{group.displayName}</span>
                <Meter value={max ? (current / max) * 100 : 0} color={color} className="mt-1 h-1" />
              </span>
              <span className="tnum shrink-0 text-caption-md text-body">{format(current)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function tileSpan(device: DeviceSummary, index: number): "one" | "two" | "full" {
  if (device.kind === "adapter") return "full";
  if (index === 0) return "two";
  if (device.kind === "gpu" && !device.integrated) return "two";
  return "one";
}

export function OverviewView() {
  const snapshot = useSnapshot();
  const { t } = useI18n();
  const { navigate } = useAppState();
  if (!snapshot) return null;

  const devices = listDevices(snapshot, t);
  const groups = groupProcesses(snapshot.processes, "");
  const warnings = snapshot.processes.filter((p) => p.threat === "warning");
  const notices = snapshot.processes.filter((p) => p.threat === "notice");

  return (
    <div>
      <PageHeader title={t("overview.title")} subtitle={t("overview.subtitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-hairline bg-card px-4 py-3 text-caption-md">
        <span className="tnum text-mute">
          {t("stat.processes")} <span className="text-ink">{number(snapshot.summary.processCount)}</span>
        </span>
        <span className="tnum text-mute">
          {t("stat.threads")} <span className="text-ink">{number(snapshot.summary.threadCount)}</span>
        </span>
        <span className="tnum text-mute">
          {t("stat.uptime")} <span className="text-ink">{duration(snapshot.summary.uptimeSeconds)}</span>
        </span>
        <span className="tnum text-mute">
          {t("stat.pingInternet")} <span className="text-ink">{snapshot.latency.internetMs !== undefined ? `${snapshot.latency.internetMs} ms` : "–"}</span>
        </span>
        <button
          type="button"
          onClick={() => navigate({ kind: "security" })}
          className={cx("ml-auto inline-flex items-center gap-1.5 rounded-sm font-medium hover:underline", warnings.length ? "text-danger" : notices.length ? "text-warning" : "text-ok")}
        >
          {warnings.length ? <ShieldAlert className="size-3.5" strokeWidth={2} aria-hidden /> : <ShieldCheck className="size-3.5" strokeWidth={2} aria-hidden />}
          {warnings.length + notices.length ? t("overview.findings", { n: warnings.length + notices.length }) : t("overview.noFindings")}
        </button>
      </div>

      {!snapshot.summary.tracingActive && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-body-sm text-body">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.75} aria-hidden />
          {t("overview.tracingOff")}
        </div>
      )}

      <SensorDriverCallout dismissible className="mb-4" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {devices.map((device, index) => (
          <DeviceTile key={device.key} device={device} span={tileSpan(device, index)} />
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TopList title="overview.topCpu" version={snapshot} groups={groups} value={(g) => g.cpu} format={(v) => percent(v, 1)} color="var(--res-cpu)" />
        <TopList title="overview.topMemory" version={snapshot} groups={groups} value={(g) => g.workingSet} format={(v) => bytes(v)} color="var(--res-memory)" />
        <TopList title="overview.topGpu" version={snapshot} groups={groups} value={(g) => g.gpu} format={(v) => percent(v, 1)} color="var(--res-gpu)" />
        <TopList title="overview.topNetwork" version={snapshot} groups={groups} value={(g) => g.network} format={(v) => rate(v)} color="var(--res-network)" />
      </div>
    </div>
  );
}
