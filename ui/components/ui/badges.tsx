"use client";

import { BadgeCheck, CircleHelp, ShieldAlert, ShieldX, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { SignatureState, ThreatLevel } from "@/lib/types";
import { Pill } from "./primitives";

export function SignatureBadge({ state, signer, compact, self }: { state: SignatureState; signer?: string; compact?: boolean; self?: boolean }) {
  const { t } = useI18n();

  // Task Manager+ itself: builds from source are unsigned, which is not a finding.
  if (self) {
    return compact ? (
      <Sparkles className="size-3.5 shrink-0 text-cpu" strokeWidth={2} aria-label={t("sig.self")} />
    ) : (
      <Pill tone="info" title={t("sig.selfHint")}>
        {t("sig.self")}
      </Pill>
    );
  }
  const label = t(`sig.${state}`);
  const title = signer ? `${label}: ${signer}` : label;

  if (compact) {
    const Icon = state === "valid" ? BadgeCheck : state === "unknown" ? CircleHelp : state === "unsigned" ? ShieldAlert : ShieldX;
    const color = state === "valid" ? "text-ok" : state === "unknown" ? "text-ash" : state === "unsigned" ? "text-warning" : "text-danger";
    return <Icon className={`size-3.5 shrink-0 ${color}`} strokeWidth={2} aria-label={title} />;
  }

  const tone = state === "valid" ? "ok" : state === "unknown" ? "neutral" : state === "unsigned" ? "warning" : "danger";
  return (
    <Pill tone={tone} title={title}>
      {label}
    </Pill>
  );
}

export function ThreatBadge({ level }: { level: ThreatLevel }) {
  const { t } = useI18n();
  if (level === "none") return null;
  return <Pill tone={level === "warning" ? "danger" : "warning"}>{t(level === "warning" ? "sec.warning" : "sec.notice")}</Pill>;
}
