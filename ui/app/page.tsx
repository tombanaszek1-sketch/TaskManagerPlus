"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProcessDrawer } from "@/components/process/ProcessDrawer";
import { EndTaskProvider } from "@/components/process/EndTask";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { AdapterView } from "@/components/views/AdapterView";
import { AutostartView } from "@/components/views/AutostartView";
import { CpuView } from "@/components/views/CpuView";
import { DiskView } from "@/components/views/DiskView";
import { GpuView } from "@/components/views/GpuView";
import { HistoryView } from "@/components/views/HistoryView";
import { MemoryView } from "@/components/views/MemoryView";
import { NetworkView } from "@/components/views/NetworkView";
import { OverviewView } from "@/components/views/OverviewView";
import { ProcessesView } from "@/components/views/ProcessesView";
import { SecurityView } from "@/components/views/SecurityView";
import { ServicesView } from "@/components/views/ServicesView";
import { SettingsView } from "@/components/views/SettingsView";
import { AppStateContext, type AppState, type View } from "@/lib/app-state";
import { getTransport, type Transport } from "@/lib/bridge";
import { I18nContext, createTranslator } from "@/lib/i18n";
import { liveStore, useSnapshot } from "@/lib/store";
import type { Settings, SystemInfo } from "@/lib/types";

const THEME_KEY = "taskmanagerplus.theme";

function applyTheme(theme: Settings["theme"], transport: Transport | undefined) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable; the theme still applies for this session.
  }
  transport?.notifyTheme(dark);
}

function CurrentView({ view }: { view: View }) {
  switch (view.kind) {
    case "overview":
      return <OverviewView />;
    case "processes":
      return <ProcessesView />;
    case "network":
      return <NetworkView />;
    case "autostart":
      return <AutostartView />;
    case "services":
      return <ServicesView />;
    case "security":
      return <SecurityView />;
    case "history":
      return <HistoryView />;
    case "settings":
      return <SettingsView />;
    case "cpu":
      return <CpuView id={view.id} />;
    case "gpu":
      return <GpuView id={view.id} />;
    case "memory":
      return <MemoryView />;
    case "disk":
      return <DiskView id={view.id} />;
    case "adapter":
      return <AdapterView id={view.id} />;
  }
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-3 text-body-sm text-mute">
        <span className="size-2 animate-pulse rounded-full bg-cpu" />
        Task Manager+
      </div>
    </div>
  );
}

export default function Home() {
  const [transport, setTransport] = useState<Transport>();
  const [view, setView] = useState<View>({ kind: "overview" });
  const [detail, setDetail] = useState(false);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPid, setSelectedPid] = useState<number>();
  const [settings, setSettings] = useState<Settings>();
  const [systemInfo, setSystemInfo] = useState<SystemInfo>();
  const [sensorDriverBundled, setSensorDriverBundled] = useState(false);
  const [traceFailure, setTraceFailure] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const pausedRef = useRef(paused);
  const mainRef = useRef<HTMLElement>(null);
  const skipRef = useRef<HTMLAnchorElement>(null);
  const snapshot = useSnapshot();

  pausedRef.current = paused;

useEffect(() => {
    // The host reopens the page on the settings view after switching performance mode.
    if (window.location.hash === "#settings") setView({ kind: "settings" });
    let stop: (() => void) | undefined;
    getTransport().then((t) => {
      setTransport(t);
      stop = t.start((next) => {
        if (!pausedRef.current) liveStore.push(next);
      });
      t.request<Settings>("settings.get").then((s) => {
        setSettings(s);
        setDetail(s.detailMode);
        applyTheme(s.theme, t);
      });
      t.request<{ info: SystemInfo; traceFailure?: string; sensorDriverBundled?: boolean }>("system.info").then((r) => {
        setSystemInfo(r.info);
        setSensorDriverBundled(Boolean(r.sensorDriverBundled));
        setTraceFailure(r.traceFailure);
      });
    });
    return () => stop?.();
  }, []);

  // Performance mode keeps the design but drops every transition and animation.
  const performanceMode = settings?.performanceMode ?? false;
  useEffect(() => {
    if (performanceMode) document.documentElement.dataset.performance = "";
    else delete document.documentElement.dataset.performance;
  }, [performanceMode]);

  // Follow the operating system theme while "system" is selected.
  useEffect(() => {
    if (!settings || settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system", transport);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings, transport]);

  // When the desktop window is activated, WebView2 may put focus on the first link. The skip link
  // should only appear for keyboard users, so it is released unless Tab was pressed.
  useEffect(() => {
    let tabbed = false;
    const onKey = (e: KeyboardEvent) => {
      tabbed = e.key === "Tab";
    };
    const onFocus = () =>
      requestAnimationFrame(() => {
        if (!tabbed && document.activeElement === skipRef.current) skipRef.current?.blur();
      });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("focusin", onFocus);
    };
  }, []);

  const navigate = useCallback((next: View) => {
    setView(next);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!transport) return;
      const next = await transport.request<Settings>("settings.set", patch);
      setSettings(next);
      if (patch.theme) applyTheme(next.theme, transport);
    },
    [transport],
  );

  const t = useMemo(() => createTranslator(), []);

  const installSensorDriver = useCallback(async () => {
    if (!transport) return false;
    const result = await transport.request<{ installed: boolean; info?: SystemInfo }>("sensors.installDriver");
    if (result.info) setSystemInfo(result.info);
    return result.installed;
  }, [transport]);

  const state: AppState = {
    view,
    navigate,
    detail,
    setDetail,
    paused,
    setPaused,
    search,
    setSearch,
    selectedPid,
    openProcess: setSelectedPid,
    settings,
    updateSettings,
    systemInfo,
    traceFailure,
    sensorDriverBundled,
    installSensorDriver,
    isHost: transport?.isHost ?? true,
  };

  const viewKey = "id" in view ? `${view.kind}:${view.id}` : view.kind;

return (
    <I18nContext.Provider value={{ t }}>
      <MotionConfig reducedMotion={performanceMode ? "always" : "user"}>
        <AppStateContext.Provider value={state}>
          <EndTaskProvider>
            <a ref={skipRef} href="#main" className="sr-only z-50 rounded-md bg-card px-3 py-2 text-ink focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2">
              {t("nav.skip")}
            </a>
            <div className="flex h-dvh overflow-hidden bg-canvas text-body">
              <aside className="hidden w-60 shrink-0 border-r border-hairline bg-surface md:block">
                <Sidebar />
              </aside>
  
              <AnimatePresence>
                {menuOpen && (
                  <>
                    <motion.div className="fixed inset-0 z-30 bg-black/50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />
                    <motion.aside
                      className="fixed top-0 bottom-0 left-0 z-40 w-64 border-r border-hairline bg-surface md:hidden"
                      initial={{ x: "-100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "-100%" }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      <Sidebar onNavigate={() => setMenuOpen(false)} />
                    </motion.aside>
                  </>
                )}
              </AnimatePresence>
  
              <div className="flex min-w-0 flex-1 flex-col">
                <TopBar onMenu={() => setMenuOpen(true)} />
                <main id="main" ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
                  <div className="w-full max-w-[1760px] px-4 py-5 md:px-6 md:py-6">
                    {snapshot ? (
                      <motion.div key={viewKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                        <CurrentView view={view} />
                      </motion.div>
                    ) : (
                      <Loading />
                    )}
                  </div>
                </main>
              </div>
            </div>
            <ProcessDrawer />
          </EndTaskProvider>
        </AppStateContext.Provider>
      </MotionConfig>
    </I18nContext.Provider>
  );
}
