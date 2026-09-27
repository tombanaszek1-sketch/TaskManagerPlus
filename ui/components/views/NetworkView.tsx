"use client";

import { ArrowRight, Filter, RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { request } from "@/lib/bridge";
import { bitrate, ms, percent, rate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { processNetwork } from "@/lib/process-groups";
import { liveStore, useSnapshot } from "@/lib/store";
import type { ConnectionEntry } from "@/lib/types";
import { LiveChart } from "../charts/LiveChart";
import { Button, IconButton, PageHeader, Panel, Pill, Stat, Toggle, cx } from "../ui/primitives";
import { AdapterDetails, ThroughputChart } from "./AdapterView";
import { DeviceUsers, StatGrid } from "./shared";

function latencyTone(value: number | undefined): string {
  if (value === undefined) return "var(--danger)";
  if (value < 30) return "var(--ok)";
  if (value < 80) return "var(--warning)";
  return "var(--danger)";
}

export function NetworkView() {
  const snapshot = useSnapshot();
  const { t } = useI18n();
  const { navigate, isHost } = useAppState();
  if (!snapshot) return null;

  const active = snapshot.adapters.filter((a) => a.isUp && a.kind !== "Virtual");
  const inactive = snapshot.adapters.filter((a) => !a.isUp || a.kind === "Virtual");
  const latency = snapshot.latency;

  return (
    <div>
      <PageHeader
        title={t("net.title")}
        subtitle={t("net.subtitle")}
        actions={
          isHost && (
            <Button icon={Settings2} onClick={() => request("system.openSettings", { page: "network" })}>
              {t("action.openNetworkSettings")}
            </Button>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {active.map((adapter) => (
            <Panel
              key={adapter.id}
              title={`${adapter.name} · ${adapter.description}`}
              actions={
                <button type="button" onClick={() => navigate({ kind: "adapter", id: adapter.id })} className="inline-flex items-center gap-1 text-caption-md text-mute hover:text-ink">
                  {t("action.details")}
                  <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
                </button>
              }
            >
              <ThroughputChart adapter={adapter} height={160} />
            </Panel>
          ))}
        </div>

        <Panel title={t("net.latency")} subtitle={t("net.latencyHint")}>
          <StatGrid>
            <Stat label={t("stat.pingInternet")} value={ms(latency.internetMs)} accent={latencyTone(latency.internetMs)} hint={latency.internetTarget} />
            <Stat label={t("stat.pingGateway")} value={ms(latency.gatewayMs)} accent={latencyTone(latency.gatewayMs)} hint={latency.gatewayAddress} />
            <Stat label={t("stat.loss")} value={percent(latency.packetLossPercent, 0)} accent={latency.packetLossPercent > 0 ? "var(--danger)" : undefined} />
          </StatGrid>
          <div className="mt-4">
            <LiveChart
              label={t("net.latency")}
              series={[
                { values: liveStore.getSeries("ping:internet"), color: "var(--accent-yellow)", fill: true },
                { values: liveStore.getSeries("ping:gateway"), color: "var(--accent-blue)", dashed: true },
              ]}
              height={140}
              window={60}
              formatScale={(v) => ms(v)}
            />
            <div className="mt-3 flex flex-wrap gap-4 text-caption-sm text-mute">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-[var(--accent-yellow)]" />
                {t("stat.pingInternet")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t border-dashed border-[var(--accent-blue)]" />
                {t("stat.pingGateway")}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {active[0] && <AdapterDetails adapter={active[0]} />}
        <div>
          {!snapshot.summary.tracingActive && <p className="mb-2 text-caption-md text-warning">{t("net.noTracing")}</p>}
          <DeviceUsers processes={snapshot.processes} measure={processNetwork} format={(v) => rate(v)} color="var(--res-network)" limit={12} />
        </div>
      </div>

      <Connections />

      {inactive.length > 0 && (
        <Panel className="mt-4" title={t("net.inactive")} bodyClassName="p-0">
          <ul>
            {inactive.map((adapter) => (
              <li key={adapter.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline-soft px-4 py-2 text-body-sm last:border-0">
                <span className="text-ink">{adapter.name}</span>
                <span className="min-w-0 flex-1 truncate text-mute">{adapter.description}</span>
                <Pill tone={adapter.isUp ? "neutral" : "neutral"}>{adapter.kind}</Pill>
                {adapter.isUp && <span className="tnum text-caption-sm text-mute">{bitrate(adapter.receiveBytesPerSec)}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Connections() {
  const { t } = useI18n();
  const { openProcess, detail } = useAppState();
  const [connections, setConnections] = useState<ConnectionEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [establishedOnly, setEstablishedOnly] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConnections(await request<ConnectionEntry[]>("network.connections"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return connections.filter(
      (c) =>
        (!establishedOnly || c.state === "Established") &&
        (!q || c.processName.toLowerCase().includes(q) || c.remoteAddress.includes(q) || c.localAddress.includes(q) || String(c.remotePort) === q),
    );
  }, [connections, filter, establishedOnly]);

  return (
    <Panel
      className="mt-4"
      title={t("net.connections")}
      subtitle={`${visible.length} / ${connections.length}`}
      bodyClassName="p-0"
      actions={
        <>
          <label className="relative flex h-8 items-center">
            <Filter className="pointer-events-none absolute left-2.5 size-3.5 text-ash" strokeWidth={1.75} aria-hidden />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("net.filter")}
              aria-label={t("net.filter")}
              spellCheck={false}
              className="h-full w-56 rounded-md border border-hairline bg-surface pr-2 pl-8 text-caption-md text-ink outline-none placeholder:text-ash focus-visible:border-[var(--accent-blue)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-caption-md text-mute">
            <Toggle checked={establishedOnly} onChange={setEstablishedOnly} label={t("net.established")} />
            {t("net.established")}
          </label>
          <IconButton icon={RefreshCw} label={t("action.refresh")} onClick={load} className={cx(loading && "animate-spin")} />
        </>
      }
    >
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[44rem] text-body-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-hairline-soft text-left text-caption-sm text-mute">
              <th className="px-4 py-2 font-medium">{t("col.process")}</th>
              <th className="px-4 py-2 font-medium">{t("col.protocol")}</th>
              <th className="px-4 py-2 font-medium">{t("col.remote")}</th>
              {detail && <th className="px-4 py-2 font-medium">{t("col.local")}</th>}
              <th className="px-4 py-2 font-medium">{t("col.state")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 400).map((c, i) => (
              <tr key={`${c.protocol}-${c.localAddress}-${c.localPort}-${c.remoteAddress}-${c.remotePort}-${i}`} className="border-b border-hairline-soft last:border-0 hover:bg-hover">
                <td className="px-4 py-1.5">
                  <button type="button" className="text-ink hover:underline" onClick={() => c.pid > 0 && openProcess(c.pid)}>
                    {c.processName}
                  </button>
                  {detail && <span className="tnum ml-2 text-caption-sm text-ash">{c.pid}</span>}
                </td>
                <td className="px-4 py-1.5 text-mute">{c.protocol}</td>
                <td className="selectable tnum px-4 py-1.5 font-mono text-caption-md text-body">{c.remoteAddress ? `${c.remoteAddress}:${c.remotePort}` : "–"}</td>
                {detail && <td className="selectable tnum px-4 py-1.5 font-mono text-caption-md text-mute">{`${c.localAddress}:${c.localPort}`}</td>}
                <td className="px-4 py-1.5">
                  <Pill tone={c.state === "Established" ? "ok" : c.state === "Listen" ? "info" : "neutral"}>{c.state}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
