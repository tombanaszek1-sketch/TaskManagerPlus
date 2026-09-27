"use client";

import { Power, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { request } from "@/lib/bridge";
import { useI18n } from "@/lib/i18n";
import type { AutostartEntry } from "@/lib/types";
import { ProcessIcon } from "../process/ProcessIcon";
import { SignatureBadge } from "../ui/badges";
import { Button, Empty, PageHeader, Panel, Toggle, cx } from "../ui/primitives";

export function useRemoteList<T>(action: string) {
  const [items, setItems] = useState<T[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setItems(await request<T[]>(action));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, setItems, error, setError, loading, reload };
}

export function AutostartView() {
  const { t } = useI18n();
  const { detail } = useAppState();
  const { items, setItems, error, setError, loading, reload } = useRemoteList<AutostartEntry>("autostart.list");
  const [pending, setPending] = useState<string>();

  const toggle = async (entry: AutostartEntry, enabled: boolean) => {
    setPending(entry.id);
    setItems((current) => current?.map((e) => (e.id === entry.id ? { ...e, enabled } : e)));
    try {
      await request("autostart.set", { id: entry.id, enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems((current) => current?.map((x) => (x.id === entry.id ? { ...x, enabled: !enabled } : x)));
    } finally {
      setPending(undefined);
    }
  };

  const enabled = items?.filter((e) => e.enabled).length ?? 0;

  return (
    <div>
      <PageHeader
        title={t("auto.title")}
        subtitle={t("auto.subtitle")}
        actions={
          <Button icon={RefreshCw} onClick={reload} disabled={loading}>
            {t("action.refresh")}
          </Button>
        }
      />
      {error && <p className="mb-3 text-body-sm text-danger">{t("common.error", { message: error })}</p>}

      <Panel title={items ? t("auto.enabledCount", { n: enabled, total: items.length }) : t("common.loading")} bodyClassName="p-0">
        {items && items.length === 0 && <Empty icon={Power}>{t("common.none")}</Empty>}
        <ul>
          {items?.map((entry) => (
            <li key={entry.id} className={cx("flex items-center gap-3 border-b border-hairline-soft px-4 py-3 last:border-0", !entry.enabled && "opacity-60")}>
              <ProcessIcon name={entry.name} path={entry.imagePath} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-body-sm font-medium text-ink">{entry.name}</span>
                  <SignatureBadge state={entry.signature} signer={entry.publisher} self={entry.isSelf} />
                  {!entry.isSelf && entry.signature === "unsigned" && /\\(Temp|Downloads)\\/i.test(entry.command) && (
                    <TriangleAlert className="size-3.5 text-danger" strokeWidth={2} aria-label={t("sec.warning")} />
                  )}
                </div>
                <div className="truncate text-caption-md text-mute">
                  {entry.publisher ?? "–"} · {t(`auto.source.${entry.source}`)}
                </div>
                {detail && (
                  <div className="selectable mt-1 truncate font-mono text-caption-sm text-ash" title={entry.command}>
                    {entry.command}
                  </div>
                )}
              </div>
              <Toggle checked={entry.enabled} disabled={!entry.canToggle || pending === entry.id} onChange={(value) => toggle(entry, value)} label={entry.name} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
