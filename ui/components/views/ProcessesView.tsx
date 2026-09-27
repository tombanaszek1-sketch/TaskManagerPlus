"use client";

import { SearchX } from "lucide-react";
import { useMemo } from "react";
import { useAppState } from "@/lib/app-state";
import { useI18n } from "@/lib/i18n";
import { groupProcesses } from "@/lib/process-groups";
import { useSnapshot } from "@/lib/store";
import { ProcessTable } from "../process/ProcessTable";
import { Empty, PageHeader } from "../ui/primitives";

export function ProcessesView() {
  const snapshot = useSnapshot();
  const { search } = useAppState();
  const { t } = useI18n();
  const groups = useMemo(() => (snapshot ? groupProcesses(snapshot.processes, search.trim()) : []), [snapshot, search]);
  if (!snapshot) return null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("proc.title")} subtitle={t("proc.subtitle", { n: snapshot.processes.length, g: groups.length })} />
      {groups.length === 0 ? (
        <Empty icon={SearchX}>{t("common.noResults")}</Empty>
      ) : (
        <div className="-mx-1 min-h-0 overflow-x-auto px-1 pb-1">
          <ProcessTable groups={groups} totalMemory={snapshot.memory.total} />
        </div>
      )}
    </div>
  );
}
