"use client";

import { useProgramIcon } from "@/lib/icons";
import { cx } from "../ui/primitives";

const palette = ["var(--accent-blue)", "var(--accent-green)", "var(--accent-yellow)", "var(--accent-lime)", "var(--accent-neutral)", "var(--accent-red)"];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Kernel pseudo processes: part of Windows itself, without an executable file to take an icon from. */
const kernelProcesses = new Set(["system", "registry", "memory compression", "secure system", "idle"]);

/** Four-pane Windows mark for processes that are the operating system itself. */
function WindowsMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cx(className, "shrink-0 p-[3px]")}>
      <rect x="1" y="1" width="10.5" height="10.5" fill="#0078d4" />
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#0078d4" />
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#0078d4" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#0078d4" />
    </svg>
  );
}

/** The program's own icon, with a monogram tile as fallback when no icon can be read. */
export function ProcessIcon({ name, path, size = "md" }: { name: string; path?: string; size?: "sm" | "md" }) {
  const icon = useProgramIcon(path);
  const box = size === "md" ? "size-6" : "size-5";

  if (!path && kernelProcesses.has(name.toLowerCase())) {
    return <WindowsMark className={box} />;
  }

  if (icon) {
    return <img src={icon} alt="" width={size === "md" ? 24 : 20} height={size === "md" ? 24 : 20} className={cx(box, "shrink-0 object-contain")} />;
  }

  const clean = name.replace(/\.exe$/i, "");
  const letter = clean.match(/[a-z0-9]/i)?.[0]?.toUpperCase() ?? "?";
  const color = palette[hash(clean.toLowerCase()) % palette.length];
  return (
    <span
      aria-hidden
      className={cx(box, "inline-flex shrink-0 items-center justify-center rounded-sm border border-hairline-soft font-semibold", size === "md" ? "text-caption-md" : "text-[11px]")}
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {letter}
    </span>
  );
}
