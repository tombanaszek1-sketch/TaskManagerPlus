"use client";

import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useAppState } from "@/lib/app-state";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { displayName } from "@/lib/process-groups";
import { useSnapshot } from "@/lib/store";
import type { AutostartEntry, ProcessSnapshot } from "@/lib/types";
import { ProcessIcon } from "../process/ProcessIcon";
import { SignatureBadge, ThreatBadge } from "../ui/badges";
import { Empty, PageHeader, Panel } from "../ui/primitives";
import { useRemoteList } from "./AutostartView";

export function SecurityView() {
  const snapshot = useSnapshot();
  const { t } = useI18n();
  const { openProcess, navigate } = useAppState();
  const autostart = useRemoteList<AutostartEntry>("autostart.list");

  // One entry per executable path, most severe first.
  const findings = useMemo(() => {
    const byPath = new Map<string, ProcessSnapshot[]>();
    for (const p of snapshot?.processes ?? []) {
      if (p.threat === "none") continue;
      const key = p.path ?? p.name;
      byPath.set(key, [...(byPath.get(key) ?? []), p]);
    }
    return [...byPath.values()].sort((a, b) => (a[0]!.threat === "warning" ? -1 : 1) - (b[0]!.threat === "warning" ? -1 : 1));
  }, [snapshot]);

  const unsignedAutostart = autostart.items?.filter((e) => e.enabled && !e.isSelf && e.signature !== "valid" && e.signature !== "unknown") ?? [];

  return (
    <div>
      <PageHeader title={t("sec.title")} subtitle={t("sec.subtitle")} />
      <p className="mb-4 max-w-3xl text-body-sm leading-relaxed text-mute">{t("sec.explain")}</p>

      <Panel title={t("sec.processes")} subtitle={`${findings.length}`} bodyClassName="p-0">
        {findings.length === 0 ? (
          <Empty icon={ShieldCheck}>{t("sec.clean")}</Empty>
        ) : (
          <ul>
            {findings.map((group) => {
              const p = group[0]!;
              return (
                <li key={p.path ?? p.name} className="border-b border-hairline-soft last:border-0">
                  <button type="button" onClick={() => openProcess(p.pid)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover">
                    <ProcessIcon name={p.name} path={p.path} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body-sm font-medium text-ink">{displayName(p)}</span>
                        {group.length > 1 && <span className="tnum text-caption-sm text-ash">× {group.length}</span>}
                        <ThreatBadge level={p.threat} />
                        <SignatureBadge state={p.signature} signer={p.signer} />
                      </div>
                      <div className="selectable mt-0.5 truncate font-mono text-caption-sm text-ash">{p.path ?? p.name}</div>
                      <ul className="mt-1.5 space-y-0.5 text-caption-md text-body">
                        {p.threatReasons.map((reason) => (
                          <li key={reason}>{t(`threat.${reason}` as MessageKey)}</li>
                        ))}
                      </ul>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel className="mt-4" title={t("sec.autostart")} subtitle={autostart.items ? `${unsignedAutostart.length}` : t("common.loading")} bodyClassName="p-0">
        {autostart.items && unsignedAutostart.length === 0 ? (
          <Empty icon={ShieldCheck}>{t("sec.clean")}</Empty>
        ) : (
          <ul>
            {unsignedAutostart.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => navigate({ kind: "autostart" })} className="flex w-full items-center gap-3 border-b border-hairline-soft px-4 py-3 text-left last:border-0 hover:bg-hover">
                  <ProcessIcon name={entry.name} path={entry.imagePath} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-medium text-ink">{entry.name}</span>
                      <SignatureBadge state={entry.signature} />
                    </div>
                    <div className="selectable truncate font-mono text-caption-sm text-ash">{entry.command}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
