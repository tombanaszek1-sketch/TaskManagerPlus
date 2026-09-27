"use client";

import { AppWindow, ArrowDownUp, ChevronDown, ChevronRight, Info, Lock, Layers, ShieldAlert, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useAppState } from "@/lib/app-state";
import { bytes, number, percent, rate } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { compareGroups, processDisk, processGpu, processNetwork, type ProcessGroup, type SortKey } from "@/lib/process-groups";
import { useStableOrder } from "@/lib/stable-order";
import type { ProcessCategory, ProcessSnapshot } from "@/lib/types";
import { cx, heat } from "../ui/primitives";
import { SignatureBadge } from "../ui/badges";
import { useEndTask } from "./EndTask";
import { ProcessIcon } from "./ProcessIcon";

interface Column {
  key: SortKey;
  label: MessageKey;
  width: string;
  align: "left" | "right";
  detailOnly?: boolean;
}

const columns: Column[] = [
  { key: "cpu", label: "col.cpu", width: "5.5rem", align: "right" },
  { key: "memory", label: "col.memory", width: "7rem", align: "right" },
  { key: "gpu", label: "col.gpu", width: "5.5rem", align: "right" },
  { key: "disk", label: "col.disk", width: "6.5rem", align: "right" },
  { key: "network", label: "col.network", width: "6.5rem", align: "right" },
  { key: "pid", label: "col.pid", width: "4.5rem", align: "right", detailOnly: true },
  { key: "threads", label: "col.threads", width: "5rem", align: "right", detailOnly: true },
  { key: "handles", label: "col.handles", width: "5.5rem", align: "right", detailOnly: true },
  { key: "publisher", label: "col.publisher", width: "11rem", align: "left", detailOnly: true },
];

const folders: { category: ProcessCategory; label: MessageKey; hint: MessageKey; icon: typeof AppWindow }[] = [
  { category: "app", label: "folder.app", hint: "folder.app.hint", icon: AppWindow },
  { category: "background", label: "folder.background", hint: "folder.background.hint", icon: Layers },
  { category: "windows", label: "folder.windows", hint: "folder.windows.hint", icon: Lock },
];

const REM = 16;
/** Name column minimum plus the action column, in rem. */
const FIXED_REM = 14 + 4.5;

function fitColumns(wanted: Column[], widthPx: number): Column[] {
  if (widthPx <= 0) return wanted;
  const result: Column[] = [];
  let used = FIXED_REM * REM;
  for (const column of wanted) {
    const size = parseFloat(column.width) * REM;
    if (used + size > widthPx) break;
    result.push(column);
    used += size;
  }
  return result;
}

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

interface Totals {
  memory: number;
}

function cellValue(key: SortKey, group: ProcessGroup, process: ProcessSnapshot | undefined): string {
  const p = process;
  switch (key) {
    case "cpu":
      return percent(p ? p.cpu : group.cpu, 1);
    case "memory":
      return bytes(p ? p.workingSet : group.workingSet);
    case "gpu":
      return percent(p ? processGpu(p) : group.gpu, 1);
    case "disk":
      return rate(p ? processDisk(p) : group.disk);
    case "network":
      return rate(p ? processNetwork(p) : group.network);
    case "pid":
      return p ? String(p.pid) : group.members.length > 1 ? "" : String(group.root.pid);
    case "threads":
      return number(p ? p.threads : group.threads);
    case "handles":
      return number(p ? p.handles : group.handles);
    case "publisher":
      return (p ?? group.root).signer ?? (p ?? group.root).company ?? "";
    default:
      return "";
  }
}

function cellHeat(key: SortKey, value: number, totals: Totals) {
  switch (key) {
    case "cpu":
      return heat(value, 25, "var(--res-cpu)");
    case "memory":
      return heat(value, totals.memory * 0.1, "var(--res-memory)");
    case "gpu":
      return heat(value, 25, "var(--res-gpu)");
    case "disk":
      return heat(value, 20 * 1024 * 1024, "var(--res-disk)");
    case "network":
      return heat(value, 5 * 1024 * 1024, "var(--res-network)");
    default:
      return undefined;
  }
}

function numeric(key: SortKey, group: ProcessGroup, p?: ProcessSnapshot): number {
  switch (key) {
    case "cpu":
      return p ? p.cpu : group.cpu;
    case "memory":
      return p ? p.workingSet : group.workingSet;
    case "gpu":
      return p ? processGpu(p) : group.gpu;
    case "disk":
      return p ? processDisk(p) : group.disk;
    case "network":
      return p ? processNetwork(p) : group.network;
    default:
      return 0;
  }
}

const Row = memo(function Row({
  group,
  process,
  depth,
  expanded,
  onToggle,
  visibleColumns,
  totals,
  detail,
  selected,
}: {
  group: ProcessGroup;
  process?: ProcessSnapshot;
  depth: number;
  expanded?: boolean;
  onToggle?: () => void;
  visibleColumns: Column[];
  totals: Totals;
  detail: boolean;
  selected: boolean;
}) {
  const { t } = useI18n();
  const { openProcess } = useAppState();
  const { endTask } = useEndTask();
  const target = process ?? group.root;
  const name = process ? process.windowTitle ?? process.name : group.displayName;
  const count = group.members.length;
  const threat = process ? process.threat : group.threat;
  const critical = process ? process.isCritical : group.isCritical;

  return (
    <div
      role="row"
      aria-selected={selected}
      onDoubleClick={() => openProcess(target.pid)}
      className={cx(
        "group/row grid h-9 items-center border-b border-hairline-soft text-body-sm transition-colors duration-100",
        selected ? "bg-elevated" : "hover:bg-hover",
      )}
      style={{ gridTemplateColumns: `minmax(14rem, 1fr) ${visibleColumns.map((c) => c.width).join(" ")} 4.5rem` }}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2 pr-2" style={{ paddingLeft: `${0.75 + depth * 1.75}rem` }}>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? t("action.collapse") : t("action.expand")}
            aria-expanded={expanded}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-ash hover:bg-elevated hover:text-ink"
          >
            {expanded ? <ChevronDown className="size-3.5" strokeWidth={2} /> : <ChevronRight className="size-3.5" strokeWidth={2} />}
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <ProcessIcon name={target.name} path={target.path} size={depth ? "sm" : "md"} />
        <button type="button" onClick={() => openProcess(target.pid)} className="min-w-0 truncate text-left text-ink hover:underline" title={target.path ?? target.name}>
          {name}
        </button>
        {!process && count > 1 && <span className="tnum shrink-0 text-caption-sm text-ash">({count})</span>}
        {threat !== "none" && (
          <ShieldAlert className={cx("size-3.5 shrink-0", threat === "warning" ? "text-danger" : "text-warning")} strokeWidth={2} aria-label={t(threat === "warning" ? "sec.warning" : "sec.notice")} />
        )}
        {detail && depth === 0 && !process && <SignatureBadge state={group.root.signature} self={group.root.isSelf} compact />}
      </div>
      {visibleColumns.map((column) => {
        const value = numeric(column.key, group, process);
        return (
          <div
            role="cell"
            key={column.key}
            className={cx("tnum flex h-full items-center truncate px-3", column.align === "right" ? "justify-end" : "justify-start text-mute", column.align === "right" && value === 0 && !["pid", "threads", "handles"].includes(column.key) && "text-ash")}
            style={cellHeat(column.key, value, totals)}
          >
            <span className="truncate">{cellValue(column.key, group, process)}</span>
          </div>
        );
      })}
      <div role="cell" className="flex items-center justify-end gap-0.5 pr-2 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => openProcess(target.pid)}
          aria-label={t("action.details")}
          title={t("action.details")}
          className="inline-flex size-7 items-center justify-center rounded-md text-mute hover:bg-elevated hover:text-ink"
        >
          <Info className="size-4" strokeWidth={1.75} />
        </button>
        {critical ? (
          <span title={t("details.protected")} className="inline-flex size-7 items-center justify-center text-ash">
            <Lock className="size-3.5" strokeWidth={1.75} aria-label={t("details.protected")} />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => endTask(name, process ? [process] : group.members)}
            aria-label={t("action.end")}
            title={t("action.end")}
            className="inline-flex size-7 items-center justify-center rounded-md text-mute hover:bg-danger/15 hover:text-danger"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
});

export function ProcessTable({ groups, totalMemory }: { groups: ProcessGroup[]; totalMemory: number }) {
  const { t } = useI18n();
  const { detail, selectedPid, search } = useAppState();
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "cpu", descending: true });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<ProcessCategory>>(new Set());

  const tableRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(tableRef);
  const wanted = useMemo(() => columns.filter((c) => detail || !c.detailOnly), [detail]);
  // Columns are listed by importance; the least important ones are left out when the window is too narrow.
  const visibleColumns = useMemo(() => fitColumns(wanted, width), [wanted, width]);
  const hiddenColumns = wanted.length - visibleColumns.length;
  const [resortToken, setResortToken] = useState(0);
  const compare = useMemo(() => compareGroups(sort.key, sort.descending), [sort]);

  // Rows keep their place between live updates; new programs are appended to their folder.
  // The list is only re-sorted when the sort column, the search or the explicit re-sort changes.
  const sorted = useStableOrder(groups, (g) => g.id, () => 0, compare, `${sort.key}:${sort.descending}:${search}:${resortToken}`, Infinity);
  const totals = { memory: totalMemory };

  const toggleSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, descending: !current.descending } : { key, descending: key !== "name" && key !== "publisher" }));

  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sums = (category: ProcessCategory) => {
    const list = groups.filter((g) => g.category === category);
    return { count: list.length, cpu: list.reduce((s, g) => s + g.cpu, 0), memory: list.reduce((s, g) => s + g.workingSet, 0) };
  };

  const template = `minmax(14rem, 1fr) ${visibleColumns.map((c) => c.width).join(" ")} 4.5rem`;

  return (
    <>
    {hiddenColumns > 0 && <p className="mb-2 text-caption-md text-ash">{t("proc.hiddenColumns", { n: hiddenColumns })}</p>}
    <div ref={tableRef} role="table" aria-label={t("proc.title")} className="w-full overflow-hidden rounded-lg border border-hairline bg-card">
      <div role="row" className="sticky top-0 z-10 grid h-10 items-center border-b border-hairline bg-card text-caption-sm font-medium tracking-[0.4px] text-mute" style={{ gridTemplateColumns: template }}>
        {[{ key: "name" as SortKey, label: "col.name" as MessageKey, align: "left" as const }, ...visibleColumns].map((column) => (
          <button
            role="columnheader"
            aria-sort={sort.key === column.key ? (sort.descending ? "descending" : "ascending") : "none"}
            key={column.key}
            type="button"
            onClick={() => toggleSort(column.key)}
            className={cx(
              "flex h-full items-center gap-1 px-3 transition-colors hover:text-ink",
              column.align === "right" ? "justify-end" : "justify-start",
              column.key === "name" && "pl-[2.75rem]",
              sort.key === column.key && "text-ink",
            )}
          >
            {t(column.label)}
            {sort.key === column.key && <span aria-hidden>{sort.descending ? "↓" : "↑"}</span>}
          </button>
        ))}
        <span className="flex justify-end pr-2">
          <button
            type="button"
            onClick={() => setResortToken((n) => n + 1)}
            aria-label={t("action.resort")}
            title={t("action.resort")}
            className="inline-flex size-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-elevated hover:text-ink"
          >
            <ArrowDownUp className="size-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </span>
      </div>

      {folders.map((folder) => {
        const folderGroups = sorted.filter((g) => g.category === folder.category);
        if (folderGroups.length === 0) return null;
        const collapsed = collapsedFolders.has(folder.category) && !search;
        const stats = sums(folder.category);
        const Icon = folder.icon;
        return (
          <div key={folder.category} role="rowgroup">
            <button
              type="button"
              onClick={() =>
                setCollapsedFolders((current) => {
                  const next = new Set(current);
                  if (next.has(folder.category)) next.delete(folder.category);
                  else next.add(folder.category);
                  return next;
                })
              }
              aria-expanded={!collapsed}
              className="grid h-10 w-full items-center border-b border-hairline bg-surface text-left transition-colors hover:bg-hover"
              style={{ gridTemplateColumns: template }}
            >
              <span className="flex min-w-0 items-center gap-2 pl-3">
                {collapsed ? <ChevronRight className="size-3.5 shrink-0 text-ash" strokeWidth={2} /> : <ChevronDown className="size-3.5 shrink-0 text-ash" strokeWidth={2} />}
                <Icon className="size-4 shrink-0 text-mute" strokeWidth={1.75} aria-hidden />
                <span className="text-body-sm font-medium text-ink">{t(folder.label)}</span>
                <span className="tnum text-caption-sm text-ash">{stats.count}</span>
                <span className="hidden truncate text-caption-sm text-ash lg:inline">· {t(folder.hint)}</span>
              </span>
              {visibleColumns.map((column) => (
                <span key={column.key} className="tnum px-3 text-right text-caption-sm text-mute">
                  {column.key === "cpu" ? percent(stats.cpu, 1) : column.key === "memory" ? bytes(stats.memory) : ""}
                </span>
              ))}
              <span />
            </button>
            {!collapsed &&
              folderGroups.map((group) => {
                const isExpanded = expanded.has(group.id) || (search !== "" && group.members.length > 1 && group.members.length <= 8);
                return (
                  <div key={group.id} role="rowgroup">
                    <Row
                      group={group}
                      depth={0}
                      expanded={isExpanded}
                      onToggle={group.members.length > 1 ? () => toggle(group.id) : undefined}
                      visibleColumns={visibleColumns}
                      totals={totals}
                      detail={detail}
                      selected={group.members.some((m) => m.pid === selectedPid)}
                    />
                    {isExpanded &&
                      group.members.length > 1 &&
                      group.members.map((member) => (
                        <Row
                          key={member.pid}
                          group={group}
                          process={member}
                          depth={1}
                          visibleColumns={visibleColumns}
                          totals={totals}
                          detail={detail}
                          selected={member.pid === selectedPid}
                        />
                      ))}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
    </>
  );
}
