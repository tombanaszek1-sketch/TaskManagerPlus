"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { request } from "@/lib/bridge";
import { useI18n } from "@/lib/i18n";
import type { ProcessSnapshot } from "@/lib/types";
import { ConfirmDialog } from "../ui/Dialog";

interface EndTaskTarget {
  name: string;
  processes: ProcessSnapshot[];
  tree: boolean;
}

interface EndTaskApi {
  endTask: (name: string, processes: ProcessSnapshot[], tree?: boolean) => void;
  error: string | undefined;
}

const EndTaskContext = createContext<EndTaskApi | null>(null);

export function useEndTask(): EndTaskApi {
  const api = useContext(EndTaskContext);
  if (!api) throw new Error("useEndTask must be used inside EndTaskProvider");
  return api;
}

/** Owns the confirmation dialog for terminating processes, so every list can offer "End task". */
export function EndTaskProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [target, setTarget] = useState<EndTaskTarget>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const endTask = useCallback((name: string, processes: ProcessSnapshot[], tree = false) => {
    setError(undefined);
    setTarget({ name, processes, tree });
  }, []);

  const critical = target?.processes.some((p) => p.isCritical) ?? false;

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await request("process.kill", { pids: target.processes.map((p) => p.pid), tree: target.tree });
      setTarget(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTarget(undefined);
    } finally {
      setBusy(false);
    }
  };

  const api = useMemo(() => ({ endTask, error }), [endTask, error]);

  return (
    <EndTaskContext.Provider value={api}>
      {children}
      <ConfirmDialog
        open={target !== undefined}
        title={t("confirm.endTitle", { name: target?.name ?? "" })}
        body={critical ? t("confirm.criticalBody") : t("confirm.endBody", { n: target?.processes.length ?? 0 })}
        confirmLabel={target && target.processes.length > 1 ? t("action.endGroup", { n: target.processes.length }) : t("action.end")}
        danger
        busy={busy}
        hideConfirm={critical}
        onConfirm={confirm}
        onClose={() => setTarget(undefined)}
      />
      {error && (
        <div role="alert" className="fixed right-4 bottom-4 z-50 max-w-sm rounded-md border border-danger/40 bg-card px-4 py-3 text-body-sm text-danger shadow-xl">
          {t("common.error", { message: error })}
          <button type="button" className="ml-3 text-mute underline hover:text-ink" onClick={() => setError(undefined)}>
            {t("action.close")}
          </button>
        </div>
      )}
    </EndTaskContext.Provider>
  );
}
