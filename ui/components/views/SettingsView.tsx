"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/lib/app-state";
import { request } from "@/lib/bridge";
import { useI18n } from "@/lib/i18n";
import { useSnapshot } from "@/lib/store";
import type { Settings } from "@/lib/types";
import { ConfirmDialog } from "../ui/Dialog";
import { OverlaySettingsPanel } from "./OverlaySettings";
import { SensorDriverCallout } from "./SensorDriverCallout";
import { Button, PageHeader, Panel, Pill, Segmented, SettingRow as Row, Toggle } from "../ui/primitives";

export function SettingsView() {
  const { t } = useI18n();
  const { settings, updateSettings, systemInfo, traceFailure } = useAppState();
  const snapshot = useSnapshot();
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string>();

  if (!settings) return null;

  const set = async (patch: Partial<Settings>) => {
    setError(undefined);
    try {
      await updateSettings(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const status = (ok: boolean, okLabel: string, badLabel: string) => <Pill tone={ok ? "ok" : "warning"}>{ok ? okLabel : badLabel}</Pill>;

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("set.title")} />
      {error && <p className="mb-3 text-body-sm text-danger">{t("common.error", { message: error })}</p>}

      <Panel title={t("set.appearance")}>
        <Row label={t("set.theme")}>
          <Segmented
            label={t("set.theme")}
            value={settings.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: "system", label: t("set.theme.system") },
              { value: "light", label: t("set.theme.light") },
              { value: "dark", label: t("set.theme.dark") },
            ]}
          />
        </Row>
        <Row label={t("set.detailDefault")} hint={t("mode.hint")}>
          <Toggle checked={settings.detailMode} onChange={(detailMode) => set({ detailMode })} label={t("set.detailDefault")} />
        </Row>
        <Row label={t("set.refresh")}>
          <Segmented
            label={t("set.refresh")}
            value={String(settings.refreshIntervalMs)}
            onChange={(value) => set({ refreshIntervalMs: Number(value) })}
            options={["500", "1000", "2000", "5000"].map((value) => ({ value, label: `${Number(value) / 1000} s` }))}
          />
        </Row>
      </Panel>

      <Panel className="mt-4" title={t("set.behavior")}>
        <Row label={t("set.closeToTray")} hint={t("set.closeToTrayHint")}>
          <Toggle checked={settings.closeToTray} onChange={(closeToTray) => set({ closeToTray })} label={t("set.closeToTray")} />
        </Row>
        <Row label={t("set.startWithWindows")} hint={t("set.startWithWindowsHint")}>
          <Toggle checked={settings.startWithWindows} onChange={(startWithWindows) => set({ startWithWindows })} label={t("set.startWithWindows")} />
        </Row>
        <Row label={t("set.startMinimized")}>
          <Toggle checked={settings.startMinimized} onChange={(startMinimized) => set({ startMinimized })} label={t("set.startMinimized")} />
        </Row>
        <Row label={t("set.performance")} hint={t("set.performanceHint")}>
          <Toggle checked={settings.performanceMode} onChange={(performanceMode) => set({ performanceMode })} label={t("set.performance")} />
        </Row>
      </Panel>

      <OverlaySettingsPanel onError={setError} />

      <Panel className="mt-4" title={t("set.history")}>
        <Row label={t("set.retention")}>
          <Segmented
            label={t("set.retention")}
            value={String(settings.retentionDays)}
            onChange={(value) => set({ retentionDays: Number(value) })}
            options={["7", "30", "90", "365"].map((value) => ({ value, label: t("set.days", { n: value }) }))}
          />
        </Row>
        <Row label={t("set.clear")} hint={cleared ? t("set.cleared") : undefined}>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmClear(true)}>
            {t("set.clear")}
          </Button>
        </Row>
      </Panel>

      <Panel className="mt-4" title={t("set.about")}>
        <Row label={t("set.version")}>
          <span className="tnum text-body-sm text-ink">{systemInfo?.appVersion ?? "–"}</span>
        </Row>
        <Row label={t("set.system")}>
          <span className="text-right text-body-sm text-ink">
            {systemInfo ? `${systemInfo.osName} ${systemInfo.osVersion}` : "–"}
            {systemInfo?.motherboard && <span className="block text-caption-md text-mute">{systemInfo.motherboard}</span>}
          </span>
        </Row>
        <Row label={t("set.elevated")}>{status(systemInfo?.isElevated ?? false, t("set.active"), t("set.inactive"))}</Row>
        <Row label={t("set.tracing")} hint={snapshot?.summary.tracingActive ? undefined : traceFailure}>
          {status(snapshot?.summary.tracingActive ?? false, t("set.active"), t("set.inactive"))}
        </Row>
        <Row label={t("set.driver")}>{status(systemInfo?.sensorDriverAvailable ?? false, t("set.installed"), t("set.notInstalled"))}</Row>
        <SensorDriverCallout className="mb-3" />
      </Panel>

      <ConfirmDialog
        open={confirmClear}
        title={t("set.clear")}
        body={t("set.clearBody")}
        confirmLabel={t("set.clear")}
        danger
        onConfirm={async () => {
          setConfirmClear(false);
          await request("history.clear");
          setCleared(true);
        }}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  );
}
