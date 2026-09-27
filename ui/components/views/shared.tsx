"use client";

import { Activity, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { percent, sensorValue } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { displayName } from "@/lib/process-groups";
import { useSmoothed } from "@/lib/smoothing";
import { useStableOrder } from "@/lib/stable-order";
import type { ProcessSnapshot, SensorKind, SensorReading } from "@/lib/types";
import { ProcessIcon } from "../process/ProcessIcon";
import { Empty, Meter, Panel, Segmented, cx } from "../ui/primitives";

export interface UsageColumn {
  label: MessageKey;
  value: (p: ProcessSnapshot) => string;
}

interface Aggregated {
  key: string;
  name: string;
  representative: ProcessSnapshot;
  members: ProcessSnapshot[];
  value: number;
}

/** "9 × chrome.exe" when all helpers run the same image, otherwise "spotify.exe + 3 helpers". */
function memberSummary(name: string, members: ProcessSnapshot[]): string {
  if (members.length <= 1) return name;
  return members.every((m) => m.name === name) ? `${members.length} × ${name}` : `${name} + ${members.length - 1} helper${members.length > 2 ? "s" : ""}`;
}

/** Rows below this share of the device are folded into one expandable line. */
const MINOR_SHARE = 1;

/** Ranks change at most this often; the numbers keep updating every second. */
const RANK_INTERVAL_MS = 5000;

/** Always show at least this many rows before folding the rest. */
const MIN_ROWS = 5;

/**
 * "What is using it": processes ranked by their share of one device. Helpers of the same program are
 * folded together so Chrome with 20 processes shows up as one line. Values are smoothed over a few
 * seconds and ranks only change with a clear lead, so the list stays readable while it updates.
 */
export function DeviceUsers({
  processes,
  measure,
  format,
  total,
  color,
  extraColumns = [],
  limit = 25,
}: {
  processes: ProcessSnapshot[];
  measure: (p: ProcessSnapshot) => number;
  format: (value: number) => string;
  /** Device total used to compute the share; when omitted the share is relative to the sum. */
  total?: number;
  color: string;
  extraColumns?: UsageColumn[];
  limit?: number;
}) {
  const { t } = useI18n();
  const { openProcess, detail } = useAppState();
  const [grouping, setGrouping] = useState<"apps" | "processes">("apps");
  const [showMinor, setShowMinor] = useState(false);

  const aggregated = useMemo(() => {
    const map = new Map<string, Aggregated>();
    for (const p of processes) {
      const value = measure(p);
      if (value <= 0) continue;
      const key = grouping === "apps" ? `g${p.groupId}` : `p${p.pid}`;
      const existing = map.get(key);
      if (existing) {
        existing.value += value;
        existing.members.push(p);
        if (p.pid === p.groupId) existing.representative = p;
      } else {
        map.set(key, { key, name: "", representative: p, members: [p], value });
      }
    }
    return [...map.values()].map((row) => ({
      ...row,
      name: grouping === "apps" ? displayName(row.representative) : row.representative.windowTitle ?? row.representative.name,
    }));
    // measure is recreated by callers on every render; the snapshot identity drives recomputation.
  }, [processes, grouping]);

  const smoothed = useSmoothed(aggregated, (r) => r.key, (r) => r.value, processes, grouping);
  const rows = smoothed.map(({ item, value }) => ({ ...item, value }));
  const leader = rows.reduce((max, r) => Math.max(max, r.value), 0);
  const reference = total ?? rows.reduce((s, r) => s + r.value, 0);
  const ranked = useStableOrder(rows, (r) => r.key, (r) => r.value, (a, b) => b.value - a.value, grouping, 0.25, leader * 0.02, RANK_INTERVAL_MS);

  const shareOf = (value: number) => (reference > 0 ? (value / reference) * 100 : 0);
  const majorCount = Math.max(MIN_ROWS, ranked.filter((r) => shareOf(r.value) >= MINOR_SHARE).length);
  const major = ranked.slice(0, Math.min(majorCount, limit));
  // The small tail is sorted by name: its values are too close for a ranking to mean anything.
  const minor = ranked.slice(major.length).sort((a, b) => a.name.localeCompare(b.name));

  const renderRow = (row: (typeof ranked)[number]) => {
    const share = shareOf(row.value);
    return (
      <li key={row.key}>
        <button
          type="button"
          onClick={() => openProcess(row.representative.pid)}
          className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-b border-hairline-soft px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-hover sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <ProcessIcon name={row.representative.name} path={row.representative.path} />
            <span className="min-w-0">
              <span className="block truncate text-body-sm text-ink">{row.name}</span>
              <span className="block truncate text-caption-sm text-ash">
                {memberSummary(row.representative.name, row.members)}
                {detail && ` · PID ${row.representative.pid}`}
                {extraColumns.map((c) => ` · ${t(c.label)} ${c.value(row.representative)}`).join("")}
              </span>
            </span>
          </span>
          <span className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
            <Meter value={share} color={color} label={t("users.share")} />
            {total !== 100 && (
              <span className="tnum w-14 shrink-0 text-right text-caption-sm text-mute">{share >= 0.1 ? percent(share) : `< ${percent(0.1)}`}</span>
            )}
          </span>
          <span className="tnum text-right text-body-sm font-medium text-ink">{format(row.value)}</span>
        </button>
      </li>
    );
  };

  return (
    <Panel
      title={t("users.title")}
      subtitle={t("users.subtitle")}
      bodyClassName="p-0"
      actions={
        <Segmented
          label={t("users.title")}
          value={grouping}
          onChange={setGrouping}
          options={[
            { value: "apps", label: t("folder.app") },
            { value: "processes", label: t("stat.processes") },
          ]}
        />
      }
    >
      {ranked.length === 0 ? (
        <Empty icon={Activity}>{t("users.empty")}</Empty>
      ) : (
        <ul>
          {major.map(renderRow)}
          {minor.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowMinor((v) => !v)}
                aria-expanded={showMinor}
                className="flex w-full items-center gap-2 border-b border-hairline-soft px-4 py-2.5 text-left text-caption-md text-mute transition-colors last:border-0 hover:bg-hover hover:text-ink"
              >
                {showMinor ? <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden /> : <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden />}
                {t("users.minor", { n: minor.length, share: percent(MINOR_SHARE, 0) })}
              </button>
            </li>
          )}
          {showMinor && minor.map(renderRow)}
        </ul>
      )}
    </Panel>
  );
}
const kindOrder: SensorKind[] = ["temperature", "load", "clock", "power", "voltage", "current", "fan", "control", "data", "smallData", "throughput", "level", "factor", "energy", "frequency", "other"];

/**
 * Every raw sensor of a device, grouped by kind, with min and max since the app started. Groups
 * flow into as many columns as the width allows, so short and long groups never leave gaps.
 */
export function SensorTable({ sensors, note }: { sensors: SensorReading[]; note?: string }) {
  const { t } = useI18n();
  const groups = kindOrder
    .map((kind) => ({ kind, items: sensors.filter((s) => s.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <Panel title={t("sensors.title")} subtitle={`${sensors.length}`}>
      {note && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-hairline bg-surface px-3 py-2.5 text-caption-md leading-relaxed text-body">
          <Info className="mt-0.5 size-3.5 shrink-0 text-cpu" strokeWidth={2} aria-hidden />
          {note}
        </div>
      )}
      {groups.length === 0 ? (
        <Empty>{t("sensors.empty")}</Empty>
      ) : (
        <div className="@container">
          <div className="gap-4 @4xl:columns-2">
            {groups.map((group) => (
              <section key={group.kind} className="mb-4 break-inside-avoid overflow-hidden rounded-md border border-hairline-soft">
                <h3 className="border-b border-hairline-soft bg-surface px-3 py-1.5 text-caption-sm font-medium tracking-[0.4px] text-mute uppercase">
                  {t(`kind.${group.kind}`)}
                </h3>
                <table className="w-full table-fixed text-body-sm">
                  <tbody>
                    {group.items.map((sensor, index) => (
                      <tr key={`${sensor.name}-${index}`} className="border-b border-hairline-soft last:border-0">
                        <td className="px-3 py-1.5 break-words text-body">{sensor.name}</td>
                        <td className={cx("tnum w-24 px-3 py-1.5 text-right whitespace-nowrap", sensor.value === undefined ? "text-ash" : "text-ink")}>
                          {sensorValue(sensor.kind, sensor.value)}
                        </td>
                        <td className="tnum hidden w-40 px-3 py-1.5 text-right text-caption-sm whitespace-nowrap text-ash @md:@max-4xl:table-cell @7xl:table-cell">
                          {sensorValue(sensor.kind, sensor.min)} – {sensorValue(sensor.kind, sensor.max)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
/** Large headline block used at the top of every device page. */
export function DeviceHeader({ label, name, value, color, meta }: { label: string; name: string; value: string; color: string; meta?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-caption-sm font-medium tracking-[0.4px] uppercase" style={{ color }}>
          {label}
        </div>
        <h1 className="mt-1 truncate text-heading-lg font-medium text-ink">{name}</h1>
        {meta && <div className="mt-2 flex flex-wrap gap-1.5">{meta}</div>}
      </div>
      <div className="tnum text-[40px] leading-none font-medium text-ink">{value}</div>
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 @md:grid-cols-3 @3xl:grid-cols-4">{children}</div>
    </div>
  );
}
