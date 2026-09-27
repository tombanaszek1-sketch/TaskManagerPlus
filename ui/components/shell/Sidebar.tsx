"use client";

import {
  Activity,
  Cpu,
  Gauge,
  HardDrive,
  History,
  LayoutGrid,
  ListTree,
  MemoryStick,
  Monitor,
  Network,
  Power,
  Settings,
  ShieldCheck,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { sameView, useAppState, type View } from "@/lib/app-state";
import { listDevices, type DeviceKind } from "@/lib/devices";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useSnapshot } from "@/lib/store";
import { cx } from "../ui/primitives";

const deviceIcons: Record<DeviceKind, LucideIcon> = {
  cpu: Cpu,
  gpu: Monitor,
  memory: MemoryStick,
  disk: HardDrive,
  adapter: Network,
};

const primary: { view: View; label: MessageKey; icon: LucideIcon }[] = [
  { view: { kind: "overview" }, label: "nav.overview", icon: LayoutGrid },
  { view: { kind: "processes" }, label: "nav.processes", icon: ListTree },
  { view: { kind: "network" }, label: "nav.network", icon: Activity },
  { view: { kind: "history" }, label: "nav.history", icon: History },
];

const manage: { view: View; label: MessageKey; icon: LucideIcon }[] = [
  { view: { kind: "autostart" }, label: "nav.autostart", icon: Power },
  { view: { kind: "services" }, label: "nav.services", icon: Wrench },
  { view: { kind: "security" }, label: "nav.security", icon: ShieldCheck },
];

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  trailing,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-body-sm transition-colors duration-150",
        active ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--hairline)]" : "text-body hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} style={accent ? { color: accent } : undefined} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { view, navigate } = useAppState();
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const devices = snapshot ? listDevices(snapshot, t) : [];
  const findings = snapshot?.processes.filter((p) => p.threat !== "none").length ?? 0;
  const hasWarning = snapshot?.processes.some((p) => p.threat === "warning") ?? false;

  const go = (target: View) => {
    navigate(target);
    onNavigate?.();
  };

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      <div className="flex items-center gap-2.5 px-2.5">
        <img src="/icon.png" alt="" width={24} height={24} className="size-6 rounded-sm" />
        <span className="text-body-sm font-semibold tracking-[0.2px] text-ink">{t("app.name")}</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {primary.map((item) => (
          <NavItem key={item.view.kind} icon={item.icon} label={t(item.label)} active={sameView(view, item.view)} onClick={() => go(item.view)} />
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-caption-sm font-medium tracking-[0.4px] text-ash uppercase">{t("nav.hardware")}</div>
        {devices.map((device) => (
          <NavItem
            key={device.key}
            icon={device.kind === "adapter" && device.label === "Wi-Fi" ? Wifi : deviceIcons[device.kind]}
            accent={device.color}
            label={device.label}
            active={sameView(view, device.view)}
            onClick={() => go(device.view)}
            trailing={<span className="tnum shrink-0 text-caption-sm text-mute">{device.value}</span>}
          />
        ))}
        {devices.length === 0 && <div className="px-2.5 text-caption-sm text-ash">{t("common.loading")}</div>}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-caption-sm font-medium tracking-[0.4px] text-ash uppercase">{t("nav.manage")}</div>
        {manage.map((item) => (
          <NavItem
            key={item.view.kind}
            icon={item.icon}
            label={t(item.label)}
            active={sameView(view, item.view)}
            onClick={() => go(item.view)}
            trailing={
              item.view.kind === "security" && findings > 0 ? (
                <span className={cx("tnum inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-on-primary", hasWarning ? "bg-danger" : "bg-warning")}>
                  {findings}
                </span>
              ) : undefined
            }
          />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-0.5">
        <NavItem icon={Settings} label={t("nav.settings")} active={view.kind === "settings"} onClick={() => go({ kind: "settings" })} />
        {snapshot && (
          <div className="flex items-center gap-2 px-2.5 pt-2 text-caption-sm text-ash">
            <Gauge className="size-3.5" strokeWidth={1.75} aria-hidden />
            <span className="tnum truncate">
              {snapshot.summary.processCount} {t("stat.processes")}
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}
