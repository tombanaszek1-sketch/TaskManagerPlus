"use client";

import { FlaskConical, Menu, Pause, Play, Search, X } from "lucide-react";
import { useAppState } from "@/lib/app-state";
import { useI18n } from "@/lib/i18n";
import { IconButton, Pill, Segmented } from "../ui/primitives";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { detail, setDetail, paused, setPaused, search, setSearch, navigate, view, isHost } = useAppState();
  const { t } = useI18n();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3 md:px-5">
      <IconButton icon={Menu} label="Menu" className="md:hidden" onClick={onMenu} />

      <label className="relative flex h-9 min-w-0 flex-1 items-center md:max-w-md">
        <Search className="pointer-events-none absolute left-3 size-4 text-ash" strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value && view.kind !== "processes") navigate({ kind: "processes" });
          }}
          placeholder={t("top.search")}
          aria-label={t("top.search")}
          spellCheck={false}
          autoComplete="off"
          className="h-full w-full rounded-md border border-hairline bg-card pr-8 pl-9 text-body-sm text-ink outline-none placeholder:text-ash focus-visible:border-[var(--accent-blue)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            aria-label={t("action.close")}
            onClick={() => setSearch("")}
            className="absolute right-2 inline-flex size-5 items-center justify-center rounded-sm text-ash hover:text-ink"
          >
            <X className="size-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </label>

      <div className="ml-auto flex items-center gap-2">
        {!isHost && (
          <span className="hidden lg:inline-flex" title={t("top.demoHint")}>
            <Pill tone="info">
              <FlaskConical className="size-3" strokeWidth={1.75} aria-hidden />
              {t("top.demo")}
            </Pill>
          </span>
        )}
        {paused && (
          <span className="hidden sm:inline-flex">
            <Pill tone="warning">{t("top.paused")}</Pill>
          </span>
        )}
        <span title={t("mode.hint")}>
          <Segmented
            label={t("mode.hint")}
            value={detail ? "detail" : "normal"}
            onChange={(value) => setDetail(value === "detail")}
            options={[
              { value: "normal", label: t("mode.normal") },
              { value: "detail", label: t("mode.detail") },
            ]}
          />
        </span>
        <IconButton icon={paused ? Play : Pause} label={paused ? t("top.resume") : t("top.pause")} active={paused} onClick={() => setPaused(!paused)} />
      </div>
    </header>
  );
}
