"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { request } from "@/lib/bridge";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useSnapshot } from "@/lib/store";
import type { DisplayInfo, OverlayMetricId, OverlaySettings, OverlayShow, Snapshot } from "@/lib/types";
import { Panel, Segmented, SettingRow as Row, Toggle, cx } from "../ui/primitives";

/** Mirrors AppSettings.OverlaySettings.MetricModes in the host; the first mode is the default. */
const METRICS: { id: OverlayMetricId; modes: OverlayShow[] }[] = [
  { id: "cpu", modes: ["load", "temperature"] },
  { id: "gpu", modes: ["load", "temperature"] },
  { id: "ram", modes: ["load"] },
  { id: "disk", modes: ["load", "temperature"] },
  { id: "net", modes: ["traffic", "ping"] },
];

const DIAMETERS: Record<OverlaySettings["size"], number> = { small: 30, medium: 38, large: 48 };

// The overlay is drawn natively with fixed dark colors, independent of the app theme; the preview matches them.
const OVERLAY_COLORS: Record<OverlayMetricId, string> = {
  cpu: "#57c1ff",
  gpu: "#59d499",
  ram: "#ffc533",
  disk: "#d3d3d4",
  net: "#b8f35a",
};
const OVERLAY_DANGER = "#ff6161";

interface Gauge {
  id: OverlayMetricId;
  fill?: number;
  value: string;
  unit: string;
  caption: string;
  alert: boolean;
}

function max(values: (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  return present.length ? Math.max(...present) : undefined;
}

function rate(bytesPerSec: number): [string, string] {
  const units = ["B", "K", "M", "G"];
  let value = Math.max(0, bytesPerSec);
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return [value < 10 && index > 0 ? value.toFixed(1) : String(Math.round(value)), units[index]!];
}

/** Same values as OverlayWindow.Measure in the host. */
function measure(s: Snapshot, id: OverlayMetricId, show: OverlayShow): Gauge {
  const caption = id === "net" ? (show === "ping" ? "PING" : "NET") : id.toUpperCase();
  const empty: Gauge = { id, value: "–", unit: "", caption, alert: false };
  if (show === "temperature") {
    const temp =
      id === "cpu"
        ? max(s.cpus.map((c) => c.temperature))
        : id === "gpu"
          ? (max(s.gpus.filter((g) => !g.isIntegrated).map((g) => g.temperature)) ?? max(s.gpus.map((g) => g.temperature)))
          : max(s.disks.map((d) => d.temperature));
    return temp === undefined ? empty : { id, fill: temp / 100, value: String(Math.round(temp)), unit: "°", caption, alert: temp >= 90 };
  }
  if (show === "ping") {
    const ms = s.latency.internetMs;
    return ms === undefined ? empty : { id, fill: ms / 150, value: String(Math.round(ms)), unit: "ms", caption, alert: ms >= 150 };
  }
  if (show === "traffic") {
    const adapters = s.adapters.filter((a) => a.isUp && a.kind !== "Virtual");
    const bytes = adapters.reduce((sum, a) => sum + a.receiveBytesPerSec + a.sendBytesPerSec, 0);
    const link = Math.max(0, ...adapters.map((a) => a.linkSpeedBitsPerSec));
    const [value, unit] = rate(bytes);
    return { id, fill: link > 0 ? (bytes * 8) / link : 0, value, unit, caption, alert: false };
  }
  const load =
    id === "cpu"
      ? s.cpus.reduce((sum, c) => sum + c.utilization, 0) / Math.max(1, s.cpus.length)
      : id === "gpu"
        ? Math.max(0, ...s.gpus.map((g) => g.utilization))
        : id === "ram"
          ? (s.memory.used / Math.max(1, s.memory.total)) * 100
          : Math.max(0, ...s.disks.map((d) => d.activePercent));
  return { id, fill: load / 100, value: String(Math.round(load)), unit: "%", caption, alert: load >= 95 };
}

function Ring({ gauge, diameter }: { gauge: Gauge; diameter: number }) {
  const stroke = Math.max(2, diameter * 0.09);
  const r = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fill = Math.min(1, Math.max(0, gauge.fill ?? 0));
  const color = gauge.alert ? OVERLAY_DANGER : OVERLAY_COLORS[gauge.id];
  return (
    <div className="flex flex-col items-center" style={{ gap: diameter * 0.08 }}>
      <div className="relative" style={{ width: diameter, height: diameter }}>
        <svg width={diameter} height={diameter} aria-hidden className="block -rotate-90">
          <circle cx={diameter / 2} cy={diameter / 2} r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} />
          {fill > 0.005 && (
            <circle
              cx={diameter / 2}
              cy={diameter / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${fill * circumference} ${circumference}`}
            />
          )}
        </svg>
        <span
          className="tnum absolute inset-0 flex items-center justify-center font-semibold whitespace-nowrap"
          style={{ fontSize: diameter * 0.3, color: gauge.fill === undefined ? "#9c9c9d" : "#f4f4f6" }}
        >
          {gauge.value}
          {gauge.unit && (
            <span className="self-start" style={{ fontSize: diameter * 0.17, color: "#9c9c9d", marginTop: diameter * 0.3 }}>
              {gauge.unit}
            </span>
          )}
        </span>
      </div>
      <span className="font-semibold leading-none tracking-[0.4px]" style={{ fontSize: Math.max(8, diameter * 0.24), color: "#9c9c9d" }}>
        {gauge.caption}
      </span>
    </div>
  );
}

function Preview({ overlay, label }: { overlay: OverlaySettings; label: string }) {
  const snapshot = useSnapshot();
  const diameter = DIAMETERS[overlay.size];
  const pad = diameter * 0.24;
  const radius = diameter * 0.34;
  const horizontal = overlay.edge === "top";
  const gauges = snapshot ? overlay.metrics.map((m) => measure(snapshot, m.id, m.show)) : [];
  const corners =
    overlay.edge === "left"
      ? `0 ${radius}px ${radius}px 0`
      : overlay.edge === "right"
        ? `${radius}px 0 0 ${radius}px`
        : `0 0 ${radius}px ${radius}px`;

  return (
    <div
      role="img"
      aria-label={label}
      className={cx(
        "flex min-h-40 rounded-md border border-hairline bg-canvas",
        overlay.edge === "top" && "items-start justify-center",
        overlay.edge === "left" && "items-center justify-start",
        overlay.edge === "right" && "items-center justify-end",
      )}
    >
      {gauges.length > 0 && (
        <div
          className={cx("flex border border-white/10", horizontal ? "flex-row border-t-0" : "flex-col", overlay.edge === "left" && "border-l-0", overlay.edge === "right" && "border-r-0")}
          style={{ padding: pad, gap: diameter * 0.3, borderRadius: corners, background: "rgba(13, 14, 16, 0.84)" }}
        >
          {gauges.map((gauge) => (
            <Ring key={gauge.id} gauge={gauge} diameter={diameter} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OverlaySettingsPanel({ onError }: { onError: (message: string | undefined) => void }) {
  const { t } = useI18n();
  const { settings, updateSettings } = useAppState();
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);

  useEffect(() => {
    request<DisplayInfo[]>("overlay.displays").then(setDisplays, () => setDisplays([]));
  }, []);

  if (!settings) return null;
  const overlay = settings.overlay;
  const set = (patch: Partial<OverlaySettings>) => {
    onError(undefined);
    updateSettings({ overlay: { ...overlay, ...patch } }).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  };

  const enabledMetric = (id: OverlayMetricId) => overlay.metrics.find((m) => m.id === id);
  const setMetric = (id: OverlayMetricId, show: OverlayShow | undefined) => {
    const others = overlay.metrics.filter((m) => m.id !== id);
    const next = show ? [...others, { id, show }] : others;
    set({ metrics: METRICS.flatMap((m) => next.filter((n) => n.id === m.id)) });
  };

  const primary = displays.find((d) => d.primary)?.id;
  const display = overlay.display && displays.some((d) => d.id === overlay.display) ? overlay.display : primary;

  return (
    <Panel className="mt-4" title={t("ovl.title")} subtitle={t("ovl.subtitle")}>
      <Row label={t("ovl.enabled")} hint={t("ovl.enabledHint")}>
        <Toggle checked={overlay.enabled} onChange={(enabled) => set({ enabled })} label={t("ovl.enabled")} />
      </Row>
      <Row label={t("ovl.edge")}>
        <Segmented
          label={t("ovl.edge")}
          value={overlay.edge}
          onChange={(edge) => set({ edge })}
          options={(["top", "left", "right"] as const).map((value) => ({ value, label: t(`ovl.edge.${value}`) }))}
        />
      </Row>
      <Row label={t("ovl.size")}>
        <Segmented
          label={t("ovl.size")}
          value={overlay.size}
          onChange={(size) => set({ size })}
          options={(["small", "medium", "large"] as const).map((value) => ({ value, label: t(`ovl.size.${value}`) }))}
        />
      </Row>
      {displays.length > 1 && display && (
        <Row label={t("ovl.display")}>
          <Segmented
            label={t("ovl.display")}
            value={display}
            onChange={(id) => set({ display: id === primary ? undefined : id })}
            options={displays.map((d) => ({ value: d.id, label: t("ovl.displayN", { n: d.index }) }))}
          />
        </Row>
      )}

      <div className="mt-2 border-b border-hairline-soft pb-2 text-caption-sm tracking-[0.4px] text-mute">{t("ovl.metrics")}</div>
      {METRICS.map(({ id, modes }) => {
        const current = enabledMetric(id);
        return (
          <Row key={id} label={t(`ovl.metric.${id}` as MessageKey)}>
            <div className="flex items-center gap-3">
              {modes.length > 1 && (
                <Segmented
                  label={t(`ovl.metric.${id}` as MessageKey)}
                  value={current?.show ?? modes[0]!}
                  onChange={(show) => setMetric(id, show)}
                  options={modes.map((value) => ({ value, label: t(`ovl.show.${value}` as MessageKey) }))}
                />
              )}
              <Toggle checked={Boolean(current)} onChange={(on) => setMetric(id, on ? (current?.show ?? modes[0]) : undefined)} label={t(`ovl.metric.${id}` as MessageKey)} />
            </div>
          </Row>
        );
      })}

      <div className="mt-3">
        <div className="mb-2 text-caption-sm tracking-[0.4px] text-mute">{t("ovl.preview")}</div>
        {overlay.metrics.length > 0 ? (
          <Preview overlay={overlay} label={t("ovl.preview")} />
        ) : (
          <p className="rounded-md border border-hairline bg-canvas px-3 py-6 text-center text-body-sm text-mute">{t("ovl.empty")}</p>
        )}
      </div>
    </Panel>
  );
}
