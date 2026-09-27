"use client";

import { Settings2 } from "lucide-react";
import { useAppState } from "@/lib/app-state";
import { request } from "@/lib/bridge";
import { bitrate, bytes, linkSpeed, rate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { processNetwork } from "@/lib/process-groups";
import { liveStore, useSnapshot } from "@/lib/store";
import type { NetworkAdapterSnapshot } from "@/lib/types";
import { LiveChart } from "../charts/LiveChart";
import { Button, Panel, Pill, Stat } from "../ui/primitives";
import { DeviceHeader, DeviceUsers, StatGrid } from "./shared";

const down = "var(--res-network)";
const up = "var(--accent-blue)";

export function AdapterView({ id }: { id: string }) {
  const snapshot = useSnapshot();
  const { t } = useI18n();
  const { isHost } = useAppState();
  const adapter = snapshot?.adapters.find((a) => a.id === id);
  if (!snapshot || !adapter) return null;

  return (
    <div>
      <DeviceHeader
        label={adapter.kind === "Wi-Fi" ? "Wi-Fi" : adapter.name}
        name={adapter.description}
        value={bitrate(adapter.receiveBytesPerSec)}
        color={down}
        meta={
          <>
            <Pill tone={adapter.isUp ? "ok" : "neutral"}>{adapter.kind}</Pill>
            <Pill>{linkSpeed(adapter.linkSpeedBitsPerSec)}</Pill>
            {adapter.wifi && <Pill>{adapter.wifi.ssid}</Pill>}
          </>
        }
      />

      <Panel title={`${t("stat.download")} / ${t("stat.upload")}`}>
        <ThroughputChart adapter={adapter} height={220} />
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <AdapterDetails adapter={adapter} />
        <DeviceUsers
          processes={snapshot.processes}
          measure={processNetwork}
          format={(v) => rate(v)}
          color={down}
          limit={12}
        />
      </div>

      {isHost && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={Settings2} onClick={() => request("system.openSettings", { page: "network" })}>
            {t("action.openNetworkSettings")}
          </Button>
          <Button variant="ghost" onClick={() => request("system.openSettings", { page: "adapters" })}>
            {t("action.openAdapters")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ThroughputChart({ adapter, height }: { adapter: NetworkAdapterSnapshot; height: number }) {
  const { t } = useI18n();
  return (
    <>
      <LiveChart
        label={`${t("stat.download")} / ${t("stat.upload")}`}
        series={[
          { values: liveStore.getSeries(`net:${adapter.id}:down`), color: down, fill: true },
          { values: liveStore.getSeries(`net:${adapter.id}:up`), color: up, dashed: true },
        ]}
        height={height}
        formatScale={(v) => bitrate(v)}
      />
      <div className="mt-3 flex flex-wrap gap-4 text-caption-sm text-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: down }} />
          {t("stat.download")} <span className="tnum text-ink">{bitrate(adapter.receiveBytesPerSec)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: up }} />
          {t("stat.upload")} <span className="tnum text-ink">{bitrate(adapter.sendBytesPerSec)}</span>
        </span>
      </div>
    </>
  );
}

export function AdapterDetails({ adapter }: { adapter: NetworkAdapterSnapshot }) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    [t("stat.linkSpeed"), linkSpeed(adapter.linkSpeedBitsPerSec)],
    [t("stat.ipv4"), adapter.iPv4.join(", ") || "–"],
    [t("stat.ipv6"), adapter.iPv6.join(", ") || "–"],
    [t("stat.gateway"), adapter.gateways.join(", ") || "–"],
    [t("stat.dns"), adapter.dnsServers.join(", ") || "–"],
    [t("stat.dhcp"), adapter.dhcpEnabled ? t("stat.yes") : t("stat.no")],
    [t("stat.mac"), adapter.macAddress || "–"],
    [t("stat.received"), bytes(adapter.totalReceived)],
    [t("stat.sent"), bytes(adapter.totalSent)],
  ];
  if (adapter.wifi) {
    rows.unshift(
      [t("stat.ssid"), adapter.wifi.ssid],
      [t("stat.signal"), `${adapter.wifi.signalPercent}%`],
      [t("stat.channel"), adapter.wifi.channel ? `${adapter.wifi.channel}${adapter.wifi.band ? ` · ${adapter.wifi.band}` : ""}` : "–"],
      [t("stat.rxRate"), adapter.wifi.rxRateMbps ? `${adapter.wifi.rxRateMbps} Mbit/s` : "–"],
      [t("stat.txRate"), adapter.wifi.txRateMbps ? `${adapter.wifi.txRateMbps} Mbit/s` : "–"],
    );
  }

  return (
    <Panel title={adapter.name} subtitle={adapter.description}>
      <StatGrid>
        <Stat label={t("stat.download")} value={bitrate(adapter.receiveBytesPerSec)} accent={down} hint={rate(adapter.receiveBytesPerSec)} />
        <Stat label={t("stat.upload")} value={bitrate(adapter.sendBytesPerSec)} accent={up} hint={rate(adapter.sendBytesPerSec)} />
      </StatGrid>
      <dl className="mt-4">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[10rem_1fr] gap-3 border-b border-hairline-soft py-1.5 text-body-sm last:border-0">
            <dt className="text-mute">{label}</dt>
            <dd className="selectable tnum min-w-0 break-all text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
