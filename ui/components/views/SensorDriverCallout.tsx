"use client";

import { Thermometer, X } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/lib/app-state";
import { useI18n } from "@/lib/i18n";
import { Button, IconButton, cx } from "../ui/primitives";

/**
 * Offers to enable CPU temperatures and mainboard sensors with one click. The driver installer ships
 * inside the app, so nothing has to be downloaded separately.
 */
export function SensorDriverCallout({ dismissible, className }: { dismissible?: boolean; className?: string }) {
  const { t } = useI18n();
  const { systemInfo, sensorDriverBundled, installSensorDriver, isHost } = useAppState();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return dismissible === true && localStorage.getItem("taskmanagerplus.sensorPromptDismissed") === "1";
    } catch {
      return false;
    }
  });

  if (!systemInfo || systemInfo.sensorDriverAvailable || dismissed) return null;

  const enable = async () => {
    setState("busy");
    try {
      setState((await installSensorDriver()) ? "idle" : "failed");
    } catch {
      setState("failed");
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("taskmanagerplus.sensorPromptDismissed", "1");
    } catch {
      // The banner simply shows again next time.
    }
  };

  return (
    <div className={cx("flex flex-wrap items-center gap-3 rounded-lg border border-cpu/30 bg-cpu/5 px-4 py-3", className)}>
      <Thermometer className="size-4 shrink-0 text-cpu" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1 text-body-sm leading-relaxed text-body">
        <span className="font-medium text-ink">{t("driver.title")}</span> {sensorDriverBundled ? t("driver.body") : t("sensors.driver")}
        {state === "failed" && <span className="mt-1 block text-danger">{t("driver.failed")}</span>}
      </div>
      {sensorDriverBundled && isHost && (
        <Button variant="primary" size="sm" onClick={enable} disabled={state === "busy"}>
          {state === "busy" ? t("driver.enabling") : t("driver.enable")}
        </Button>
      )}
      {dismissible && <IconButton icon={X} label={t("action.close")} onClick={dismiss} />}
    </div>
  );
}
