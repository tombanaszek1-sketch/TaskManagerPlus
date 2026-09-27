"use client";

import { Copy, FolderOpen, GitBranch, Globe, Lock, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { request } from "@/lib/bridge";
import { bytes, dateTime, number, percent, rate } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { displayName, processDisk, processGpu, processNetwork } from "@/lib/process-groups";
import { useSnapshot } from "@/lib/store";
import type { ProcessDetails, ProcessSnapshot } from "@/lib/types";
import { SignatureBadge, ThreatBadge } from "../ui/badges";
import { Button, IconButton, Stat } from "../ui/primitives";
import { useEndTask } from "./EndTask";
import { ProcessIcon } from "./ProcessIcon";

const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 border-b border-hairline-soft py-2 text-body-sm last:border-0">
      <dt className="text-mute">{label}</dt>
      <dd className={`selectable min-w-0 break-words text-ink ${mono ? "font-mono text-caption-md" : ""}`}>{children}</dd>
    </div>
  );
}

export function ProcessDrawer() {
  const { selectedPid, openProcess, isHost } = useAppState();
  const snapshot = useSnapshot();
  const [lastKnown, setLastKnown] = useState<ProcessSnapshot>();
  const live = snapshot?.processes.find((p) => p.pid === selectedPid);
  const process = live ?? (lastKnown?.pid === selectedPid ? lastKnown : undefined);

  useEffect(() => {
    if (live) setLastKnown(live);
  }, [live]);

  useEffect(() => {
    if (selectedPid === undefined) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openProcess(undefined);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPid, openProcess]);

  return (
    <AnimatePresence>
      {selectedPid !== undefined && process && (
        <>
          <motion.div
            className="fixed inset-0 z-30 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => openProcess(undefined)}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={displayName(process)}
            className="fixed top-0 right-0 bottom-0 z-40 flex w-full max-w-[30rem] flex-col border-l border-hairline bg-surface shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring}
          >
            <DrawerBody process={process} alive={Boolean(live)} snapshotProcesses={snapshot?.processes ?? []} isHost={isHost} onClose={() => openProcess(undefined)} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({
  process,
  alive,
  snapshotProcesses,
  isHost,
  onClose,
}: {
  process: ProcessSnapshot;
  alive: boolean;
  snapshotProcesses: ProcessSnapshot[];
  isHost: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { openProcess } = useAppState();
  const { endTask } = useEndTask();
  const [details, setDetails] = useState<ProcessDetails>();
  const [copied, setCopied] = useState(false);
  const members = snapshotProcesses.filter((p) => p.groupId === process.groupId);
  const children = snapshotProcesses.filter((p) => p.parentPid === process.pid && p.pid !== process.pid);

  useEffect(() => {
    let cancelled = false;
    setDetails(undefined);
    request<ProcessDetails>("process.details", { pid: process.pid })
      .then((d) => !cancelled && setDetails(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [process.pid]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const categoryLabel = t(process.category === "app" ? "folder.app" : process.category === "background" ? "folder.background" : "folder.windows");

  return (
    <>
      <header className="flex items-start gap-3 border-b border-hairline px-5 py-4">
        <ProcessIcon name={process.name} path={process.path} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading-sm font-medium text-ink">{displayName(process)}</h2>
          <p className="truncate font-mono text-caption-md text-mute">
            {process.name} · PID {process.pid}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SignatureBadge state={process.signature} signer={process.signer} self={process.isSelf} />
            <ThreatBadge level={process.threat} />
            {process.isCritical && (
              <span className="inline-flex items-center gap-1 text-caption-sm text-mute">
                <Lock className="size-3" strokeWidth={2} aria-hidden />
                {t("details.protected")}
              </span>
            )}
          </div>
        </div>
        <IconButton icon={X} label={t("action.close")} onClick={onClose} />
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-lg border border-hairline bg-card p-4">
          <Stat label={t("col.cpu")} value={percent(process.cpu, 1)} accent="var(--res-cpu)" />
          <Stat label={t("col.memory")} value={bytes(process.workingSet)} accent="var(--res-memory)" />
          <Stat label={t("col.gpu")} value={percent(processGpu(process), 1)} accent="var(--res-gpu)" />
          <Stat label={t("col.disk")} value={rate(processDisk(process))} />
          <Stat label={t("col.network")} value={rate(processNetwork(process))} accent="var(--res-network)" />
          <Stat label={t("col.threads")} value={number(process.threads)} />
        </div>

        {process.threatReasons.length > 0 && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-body-sm font-medium text-ink">
              <ShieldAlert className="size-4 text-danger" strokeWidth={1.75} aria-hidden />
              {t("details.findings")}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-body">
              {process.threatReasons.map((reason) => (
                <li key={reason}>{t(`threat.${reason}` as MessageKey)}</li>
              ))}
            </ul>
          </div>
        )}

        <dl className="mt-4">
          {process.windowTitle && <Field label={t("details.window")}>{process.windowTitle}</Field>}
          {process.description && <Field label={t("details.description")}>{process.description}</Field>}
          {process.company && <Field label={t("details.company")}>{process.company}</Field>}
          {process.signer && <Field label={t("details.signedBy")}>{process.signer}</Field>}
          <Field label={t("details.category")}>{categoryLabel}</Field>
          {process.path && (
            <Field label={t("details.path")} mono>
              {process.path}
            </Field>
          )}
          {details?.commandLine && (
            <Field label={t("details.commandLine")} mono>
              <span className="line-clamp-4">{details.commandLine}</span>
              <button type="button" className="mt-1 inline-flex items-center gap-1 text-caption-sm text-mute hover:text-ink" onClick={() => copy(details.commandLine ?? "")}>
                <Copy className="size-3" strokeWidth={2} aria-hidden />
                {copied ? t("action.copied") : t("action.copy")}
              </button>
            </Field>
          )}
          {details?.owner && <Field label={t("details.owner")}>{details.owner}</Field>}
          <Field label={t("details.started")}>{dateTime(process.startTime)}</Field>
          <Field label={t("details.parent")}>
            <button type="button" className="tnum hover:underline" onClick={() => openProcess(process.parentPid)}>
              {process.parentPid}
            </button>
          </Field>
          <Field label={t("details.private")}>{bytes(process.privateBytes)}</Field>
          <Field label={t("col.handles")}>{number(process.handles)}</Field>
          <Field label={t("details.session")}>{process.sessionId}</Field>
        </dl>

        {(members.length > 1 || children.length > 0) && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2 text-caption-sm font-medium tracking-[0.4px] text-mute">
              <GitBranch className="size-3.5" strokeWidth={1.75} aria-hidden />
              {t("details.groupMembers")}
            </div>
            <ul className="overflow-hidden rounded-lg border border-hairline">
              {(members.length > 1 ? members : children).map((member) => (
                <li key={member.pid}>
                  <button
                    type="button"
                    onClick={() => openProcess(member.pid)}
                    className="flex h-8 w-full items-center gap-2 border-b border-hairline-soft px-3 text-left text-body-sm last:border-0 hover:bg-hover"
                    aria-current={member.pid === process.pid ? "true" : undefined}
                  >
                    <span className="tnum w-14 shrink-0 text-caption-sm text-ash">{member.pid}</span>
                    <span className={`min-w-0 flex-1 truncate ${member.pid === process.pid ? "text-ink" : "text-body"}`}>{member.windowTitle ?? member.name}</span>
                    <span className="tnum text-caption-sm text-mute">{percent(member.cpu, 1)}</span>
                    <span className="tnum w-16 text-right text-caption-sm text-mute">{bytes(member.workingSet)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-hairline px-5 py-3">
        {!process.isCritical && alive && (
          <>
            <Button variant="danger" icon={X} onClick={() => endTask(displayName(process), [process])}>
              {t("action.end")}
            </Button>
            {children.length > 0 && (
              <Button variant="secondary" onClick={() => endTask(displayName(process), [process], true)}>
                {t("action.endTree")}
              </Button>
            )}
          </>
        )}
        {process.path && isHost && (
          <Button variant="ghost" icon={FolderOpen} onClick={() => request("process.openLocation", { path: process.path })}>
            {t("action.openLocation")}
          </Button>
        )}
        {isHost && (
          <Button variant="ghost" icon={Globe} onClick={() => request("process.searchOnline", { query: process.name })}>
            {t("action.searchOnline")}
          </Button>
        )}
      </footer>
    </>
  );
}
