"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-pressed",
  secondary: "bg-elevated text-ink border border-hairline hover:border-hairline-strong",
  ghost: "text-body hover:bg-hover hover:text-ink",
  danger: "bg-danger/12 text-danger border border-danger/30 hover:bg-danger/20",
};

export function Button({
  variant = "secondary",
  icon: Icon,
  children,
  className,
  size = "md",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; icon?: LucideIcon; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium tracking-[0.2px] whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
        size === "md" ? "h-9 px-4 text-body-sm" : "h-7 px-2.5 text-caption-md",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={size === "md" ? "size-4" : "size-3.5"} strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className,
  active,
  ...props
}: ComponentProps<"button"> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-40",
        active ? "bg-elevated text-ink" : "text-mute hover:bg-hover hover:text-ink",
        className,
      )}
      {...props}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:opacity-40",
        checked ? "border-transparent bg-ok" : "border-hairline bg-elevated",
      )}
    >
      <span
        className={cx(
          "inline-block size-3.5 rounded-full shadow-sm transition-transform duration-150",
          checked ? "translate-x-[18px] bg-card" : "translate-x-[2px] bg-mute",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-hairline bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            "h-7 rounded-sm px-2.5 text-caption-md font-medium transition-colors duration-150",
            option.value === value ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--hairline-strong)]" : "text-mute hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("rounded-lg border border-hairline bg-card", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-hairline-soft px-4 py-2">
          <div className="min-w-0">
            {title && <h2 className="truncate text-body-sm font-medium tracking-[0.2px] text-ink">{title}</h2>}
            {subtitle && <p className="truncate text-caption-sm text-mute">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A labeled line in a settings panel with its control on the right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-body-sm text-ink">{label}</div>
        {hint && <div className="text-caption-md text-mute">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-caption-sm tracking-[0.4px] text-mute">{label}</div>
      <div className="tnum truncate text-body-sm font-medium text-ink" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="truncate text-caption-sm text-ash">{hint}</div>}
    </div>
  );
}

export function Meter({ value, color, className, label }: { value: number; color: string; className?: string; label?: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-hairline", className)}
    >
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export function Pill({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "ok" | "warning" | "danger" | "info"; title?: string }) {
  const tones = {
    neutral: "border-hairline text-mute",
    ok: "border-ok/30 bg-ok/10 text-ok",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
    info: "border-cpu/30 bg-cpu/10 text-cpu",
  };
  return (
    <span title={title} className={cx("inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-caption-sm font-medium whitespace-nowrap", tones[tone])}>
      {children}
    </span>
  );
}

export function Empty({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-body-sm text-mute">
      {Icon && <Icon className="size-5 text-ash" strokeWidth={1.5} aria-hidden />}
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-heading-lg font-medium text-balance text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-body-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Background tint for table cells, stronger with higher load, like the Windows Task Manager heat map. */
export function heat(value: number, max: number, color: string): React.CSSProperties | undefined {
  if (value <= 0 || max <= 0) return undefined;
  const strength = Math.min(1, value / max);
  if (strength < 0.08) return undefined;
  return { background: `color-mix(in srgb, ${color} ${Math.round(6 + strength * 30)}%, transparent)` };
}
