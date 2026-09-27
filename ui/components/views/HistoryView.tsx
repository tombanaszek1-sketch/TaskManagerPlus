"use client";

import { Clock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { request } from "@/lib/bridge";
import { bitrate, bytes, celsius, ms, percent, rate, time } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useSnapshot } from "@/lib/store";
import type { HistoryPoint, HistoryResponse, TopProcessEntry } from "@/lib/types";
import { HistoryChart, type HistorySeries } from "../charts/HistoryChart";
import { Empty, IconButton, PageHeader, Panel, Segmented } from "../ui/primitives";

type Range = "1h" | "6h" | "24h" | "7d" | "30d";

interface ChartSpec {
  key: string;
  title: string;
  resource?: string;
  series: HistorySeries[];
  max?: number;
  format: (v: number) => string;
}

const topFormat: Record<string, (v: number) => string> = {
  cpu: (v) => percent(v, 1),
  gpu: (v) => percent(v, 1),
  ram: (v) => bytes(v),
  disk: (v) => rate(v),
  net: (v) => rate(v),
};

export function HistoryView() {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const [range, setRange] = useState<Range>("1h");
  const [data, setData] = useState<HistoryResponse>();
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<{ timestamp: number; resource: string; title: string }>();
  const [top, setTop] = useState<TopProcessEntry[]>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await request<HistoryResponse>("history.query", { range }));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
    setSelection(undefined);
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!selection || !data) return;
    setTop(undefined);
    request<TopProcessEntry[]>("history.top", { resource: selection.resource, from: selection.timestamp, to: selection.timestamp + data.bucket - 1 }).then(setTop);
  }, [selection, data]);

  const s = (key: string): HistoryPoint[] => data?.series[key] ?? [];
  const has = (key: string) => (data?.series[key]?.length ?? 0) > 0;

  const charts: ChartSpec[] = [];
  if (data) {
    const cpuKeys = Object.keys(data.series).filter((k) => /^cpu(:\d+)?$/.test(k));
    charts.push({
      key: "cpu",
      title: t("hist.cpu"),
      resource: "cpu",
      series: cpuKeys.map((k, i) => ({ label: cpuKeys.length > 1 ? `CPU ${i}` : "CPU", points: s(k), color: "var(--res-cpu)" })),
      max: 100,
      format: (v) => percent(v, 1),
    });

    const gpuKeys = Object.keys(data.series).filter((k) => k.startsWith("gpu:"));
    if (gpuKeys.length) {
      charts.push({
        key: "gpu",
        title: t("hist.gpu"),
        resource: "gpu",
        series: gpuKeys.map((k, i) => ({
          label: snapshot?.gpus.find((g) => `gpu:${g.id}` === k)?.name ?? `GPU ${i}`,
          points: s(k),
          color: i === 0 ? "var(--res-gpu)" : "var(--accent-neutral)",
          dashed: i > 0,
        })),
        max: 100,
        format: (v) => percent(v, 1),
      });
    }

    charts.push({ key: "ram", title: t("hist.memory"), resource: "ram", series: [{ label: t("device.memory"), points: s("ram"), color: "var(--res-memory)" }], max: 100, format: (v) => percent(v, 1) });

    charts.push({
      key: "net",
      title: t("hist.network"),
      resource: "net",
      series: [
        { label: t("stat.download"), points: s("net:down"), color: "var(--res-network)" },
        { label: t("stat.upload"), points: s("net:up"), color: "var(--accent-blue)", dashed: true },
      ],
      format: (v) => bitrate(v),
    });

    const diskIndexes = [...new Set(Object.keys(data.series).map((k) => /^disk:(\d+):read$/.exec(k)?.[1]).filter((x): x is string => x !== undefined))];
    for (const index of diskIndexes) {
      charts.push({
        key: `disk${index}`,
        title: t("hist.disk", { n: index }),
        resource: "disk",
        series: [
          { label: t("stat.write"), points: s(`disk:${index}:write`), color: "var(--res-disk)" },
          { label: t("stat.read"), points: s(`disk:${index}:read`), color: "var(--accent-blue)", dashed: true },
        ],
        format: (v) => rate(v),
      });
    }

    if (has("ping:internet")) {
      charts.push({
        key: "ping",
        title: t("hist.latency"),
        series: [
          { label: t("stat.pingInternet"), points: s("ping:internet"), color: "var(--accent-yellow)" },
          { label: t("stat.pingGateway"), points: s("ping:gateway"), color: "var(--accent-blue)", dashed: true },
        ],
        format: (v) => ms(v),
      });
    }

    const tempKeys = Object.keys(data.series).filter((k) => k.startsWith("temp:"));
    if (tempKeys.length) {
      const palette = ["var(--res-cpu)", "var(--res-gpu)", "var(--res-disk)", "var(--accent-yellow)", "var(--accent-red)"];
      charts.push({
        key: "temp",
        title: t("hist.temperature"),
        series: tempKeys.map((k, i) => ({
          label: k === "temp:cpu" ? "CPU" : k.startsWith("temp:gpu:") ? snapshot?.gpus.find((g) => k.endsWith(g.id))?.name ?? "GPU" : k.replace("temp:disk:", `${t("device.disk", { n: "" }).trim()} `),
          points: s(k),
          color: palette[i % palette.length]!,
          dashed: i > 1,
        })),
        format: (v) => celsius(v),
      });
    }
  }

  const empty = data && Object.values(data.series).every((points) => points.length === 0);

  return (
    <div>
      <PageHeader
        title={t("hist.title")}
        subtitle={t("hist.subtitle")}
        actions={
          <>
            <Segmented
              label={t("hist.title")}
              value={range}
              onChange={setRange}
              options={(["1h", "6h", "24h", "7d", "30d"] as Range[]).map((value) => ({ value, label: value }))}
            />
            <IconButton icon={RefreshCw} label={t("action.refresh")} onClick={load} className={loading ? "animate-spin" : undefined} />
          </>
        }
      />

      {empty ? (
        <Panel>
          <Empty icon={Clock}>{t("hist.empty")}</Empty>
        </Panel>
      ) : (
        <>
          <p className="mb-4 text-body-sm text-mute">{t("hist.pick")}</p>
          <div className="grid gap-4 xl:grid-cols-2">
            {data &&
              charts.map((chart) => (
                <Panel key={chart.key} title={chart.title}>
                  <HistoryChart
                    label={chart.title}
                    series={chart.series}
                    from={data.from}
                    to={data.to}
                    bucket={data.bucket}
                    max={chart.max}
                    format={chart.format}
                    selected={selection?.resource === chart.resource ? selection?.timestamp : undefined}
                    onSelect={chart.resource ? (timestamp) => setSelection({ timestamp, resource: chart.resource!, title: chart.title }) : undefined}
                  />
                  {selection && selection.resource === chart.resource && (
                    <div className="mt-4 rounded-md border border-hairline-soft bg-surface p-3">
                      <div className="mb-2 text-caption-sm font-medium tracking-[0.4px] text-mute">
                        {t("hist.topAt", {
                          from: time(selection.timestamp, data.to - data.from > 86_400),
                          to: time(selection.timestamp + data.bucket, data.to - data.from > 86_400),
                        })}
                      </div>
                      {top === undefined ? (
                        <p className="text-caption-md text-ash">{t("common.loading")}</p>
                      ) : top.length === 0 ? (
                        <p className="text-caption-md text-ash">{t("common.none")}</p>
                      ) : (
                        <ol className="space-y-1">
                          {top.map((entry, i) => (
                            <li key={entry.name} className="flex items-center gap-2 text-body-sm">
                              <span className="tnum w-4 text-caption-sm text-ash">{i + 1}</span>
                              <span className="min-w-0 flex-1 truncate text-ink">{entry.name}</span>
                              <span className="tnum text-mute">{(topFormat[chart.resource ?? ""] ?? chart.format)(entry.value)}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </Panel>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
