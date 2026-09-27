"use client";

import { Play, RefreshCw, RotateCw, Search, Square } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { request } from "@/lib/bridge";
import { useI18n } from "@/lib/i18n";
import type { ServiceEntry } from "@/lib/types";
import { SignatureBadge } from "../ui/badges";
import { ConfirmDialog } from "../ui/Dialog";
import { Button, IconButton, PageHeader, Panel, Pill, Toggle } from "../ui/primitives";
import { useRemoteList } from "./AutostartView";

type StartMode = "automatic" | "automaticDelayed" | "manual" | "disabled";

function modeOf(service: ServiceEntry): StartMode {
  switch (service.startType.toLowerCase()) {
    case "auto":
      return service.delayedStart ? "automaticDelayed" : "automatic";
    case "disabled":
      return "disabled";
    default:
      return "manual";
  }
}

export function ServicesView() {
  const { t } = useI18n();
  const { detail, openProcess } = useAppState();
  const { items, error, setError, loading, reload } = useRemoteList<ServiceEntry>("services.list");
  const [hideMicrosoft, setHideMicrosoft] = useState(true);
  const [runningOnly, setRunningOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string>();
  const [confirmStop, setConfirmStop] = useState<ServiceEntry>();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (s) =>
        (!hideMicrosoft || !s.isMicrosoft) &&
        (!runningOnly || s.status === "Running") &&
        (!q || s.displayName.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.signer?.toLowerCase().includes(q) ?? false)),
    );
  }, [items, hideMicrosoft, runningOnly, query]);

  const run = async (service: ServiceEntry, action: string, args: Record<string, unknown>) => {
    setBusy(service.name);
    try {
      await request(action, { name: service.name, ...args });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("svc.title")}
        subtitle={t("svc.subtitle")}
        actions={
          <Button icon={RefreshCw} onClick={reload} disabled={loading}>
            {t("action.refresh")}
          </Button>
        }
      />
      {error && <p className="mb-3 text-body-sm text-danger">{t("common.error", { message: error })}</p>}

      <Panel
        title={items ? t("svc.count", { n: visible.length }) : t("common.loading")}
        bodyClassName="p-0"
        actions={
          <>
            <label className="relative flex h-8 items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ash" strokeWidth={1.75} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("top.search")}
                aria-label={t("top.search")}
                className="h-full w-48 rounded-md border border-hairline bg-surface pr-2 pl-8 text-caption-md text-ink outline-none placeholder:text-ash focus-visible:border-[var(--accent-blue)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-caption-md text-mute">
              <Toggle checked={hideMicrosoft} onChange={setHideMicrosoft} label={t("svc.hideMicrosoft")} />
              {t("svc.hideMicrosoft")}
            </label>
            <label className="inline-flex items-center gap-2 text-caption-md text-mute">
              <Toggle checked={runningOnly} onChange={setRunningOnly} label={t("svc.runningOnly")} />
              {t("svc.runningOnly")}
            </label>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-body-sm">
            <thead>
              <tr className="border-b border-hairline-soft text-left text-caption-sm text-mute">
                <th className="px-4 py-2 font-medium">{t("col.name")}</th>
                <th className="px-4 py-2 font-medium">{t("col.status")}</th>
                <th className="px-4 py-2 font-medium">{t("col.startType")}</th>
                <th className="px-4 py-2 font-medium">{t("col.publisher")}</th>
                {detail && <th className="px-4 py-2 font-medium">{t("col.account")}</th>}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((service) => {
                const running = service.status === "Running";
                return (
                  <tr key={service.name} className="border-b border-hairline-soft align-top last:border-0 hover:bg-hover">
                    <td className="max-w-[26rem] px-4 py-2">
                      <div className="truncate text-ink" title={service.displayName}>
                        {service.displayName}
                      </div>
                      <div className="truncate text-caption-sm text-ash" title={service.description}>
                        {detail ? `${service.name} · ${service.imagePath ?? ""}` : service.description ?? service.name}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Pill tone={running ? "ok" : "neutral"}>{service.status}</Pill>
                      {running && service.pid && (
                        <button type="button" className="tnum ml-2 text-caption-sm text-ash hover:text-ink hover:underline" onClick={() => openProcess(service.pid)}>
                          {service.pid}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={modeOf(service)}
                        disabled={busy === service.name}
                        aria-label={t("col.startType")}
                        onChange={(e) => run(service, "services.startMode", { mode: e.target.value })}
                        className="h-7 rounded-md border border-hairline bg-surface px-2 text-caption-md text-ink outline-none focus-visible:border-[var(--accent-blue)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
                      >
                        {(["automatic", "automaticDelayed", "manual", "disabled"] as StartMode[]).map((mode) => (
                          <option key={mode} value={mode}>
                            {t(`svc.mode.${mode}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <SignatureBadge state={service.signature} signer={service.signer} compact />
                        <span className="truncate text-body">{service.signer ?? "–"}</span>
                      </div>
                    </td>
                    {detail && <td className="px-4 py-2 text-caption-md text-mute">{service.account}</td>}
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-0.5">
                        {running ? (
                          <>
                            <IconButton icon={RotateCw} label={t("action.restart")} disabled={busy === service.name || !service.canStop} onClick={() => run(service, "services.action", { action: "restart" })} />
                            <IconButton icon={Square} label={t("action.stop")} disabled={busy === service.name || !service.canStop} onClick={() => setConfirmStop(service)} />
                          </>
                        ) : (
                          <IconButton icon={Play} label={t("action.start")} disabled={busy === service.name || modeOf(service) === "disabled"} onClick={() => run(service, "services.action", { action: "start" })} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmStop !== undefined}
        title={t("action.stop")}
        body={t("confirm.serviceStop", { name: confirmStop?.displayName ?? "" })}
        confirmLabel={t("action.stop")}
        danger
        onConfirm={() => {
          const service = confirmStop;
          setConfirmStop(undefined);
          if (service) run(service, "services.action", { action: "stop" });
        }}
        onClose={() => setConfirmStop(undefined)}
      />
    </div>
  );
}
