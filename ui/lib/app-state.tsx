"use client";

import { createContext, useContext } from "react";
import type { Settings, SystemInfo } from "./types";

export type View =
  | { kind: "overview" }
  | { kind: "processes" }
  | { kind: "network" }
  | { kind: "autostart" }
  | { kind: "services" }
  | { kind: "security" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "cpu"; id: string }
  | { kind: "gpu"; id: string }
  | { kind: "memory" }
  | { kind: "disk"; id: string }
  | { kind: "adapter"; id: string };

export interface AppState {
  view: View;
  navigate: (view: View) => void;
  detail: boolean;
  setDetail: (detail: boolean) => void;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  search: string;
  setSearch: (search: string) => void;
  selectedPid: number | undefined;
  openProcess: (pid: number | undefined) => void;
  settings: Settings | undefined;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  systemInfo: SystemInfo | undefined;
  traceFailure: string | undefined;
  /** True when this build carries the sensor driver installer. */
  sensorDriverBundled: boolean;
  /** Installs the bundled sensor driver; resolves to true when CPU sensors are available afterwards. */
  installSensorDriver: () => Promise<boolean>;
  isHost: boolean;
}

export const AppStateContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error("useAppState must be used inside AppStateContext");
  return state;
}

export function sameView(a: View, b: View): boolean {
  return a.kind === b.kind && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");
}
