"use client";

import { useSyncExternalStore } from "react";
import type { Snapshot } from "./types";

/** Number of live samples kept per series (two minutes at the default one second interval). */
export const LIVE_WINDOW = 120;

type Listener = () => void;

class LiveStore {
  private snapshot: Snapshot | undefined;
  private readonly series = new Map<string, number[]>();
  private readonly listeners = new Set<Listener>();
  private version = 0;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot | undefined => this.snapshot;

  getVersion = (): number => this.version;

  /** Rolling samples for a metric key such as "cpu:CPU0" or "net:{id}:down". */
  getSeries(key: string): readonly number[] {
    return this.series.get(key) ?? [];
  }

  push(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    for (const [key, value] of metricsOf(snapshot)) {
      let values = this.series.get(key);
      if (!values) {
        values = [];
        this.series.set(key, values);
      }
      values.push(value);
      if (values.length > LIVE_WINDOW) values.shift();
    }
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
}

function* metricsOf(s: Snapshot): Generator<[string, number]> {
  for (const cpu of s.cpus) {
    yield [`cpu:${cpu.id}`, cpu.utilization];
    for (let i = 0; i < cpu.logicalLoads.length; i++) yield [`cpu:${cpu.id}:${i}`, cpu.logicalLoads[i] ?? 0];
    if (cpu.temperature !== undefined) yield [`cpu:${cpu.id}:temp`, cpu.temperature];
  }
  for (const gpu of s.gpus) {
    yield [`gpu:${gpu.id}`, gpu.utilization];
    for (const [engine, value] of Object.entries(gpu.engines)) yield [`gpu:${gpu.id}:${engine}`, value];
    yield [`gpu:${gpu.id}:vram`, gpu.dedicatedTotal ? (gpu.dedicatedUsed / gpu.dedicatedTotal) * 100 : 0];
  }
  yield ["ram", s.memory.total ? (s.memory.used / s.memory.total) * 100 : 0];
  for (const disk of s.disks) {
    yield [`disk:${disk.id}`, disk.activePercent];
    yield [`disk:${disk.id}:read`, disk.readBytesPerSec];
    yield [`disk:${disk.id}:write`, disk.writeBytesPerSec];
  }
  for (const adapter of s.adapters) {
    yield [`net:${adapter.id}:down`, adapter.receiveBytesPerSec];
    yield [`net:${adapter.id}:up`, adapter.sendBytesPerSec];
  }
  if (s.latency.internetMs !== undefined) yield ["ping:internet", s.latency.internetMs];
  if (s.latency.gatewayMs !== undefined) yield ["ping:gateway", s.latency.gatewayMs];
}

export const liveStore = new LiveStore();

export function useSnapshot(): Snapshot | undefined {
  return useSyncExternalStore(liveStore.subscribe, liveStore.getSnapshot, () => undefined);
}

/** Re-renders on every tick and returns the rolling series for a key. */
export function useSeries(key: string): readonly number[] {
  useSyncExternalStore(liveStore.subscribe, liveStore.getVersion, () => 0);
  return liveStore.getSeries(key);
}
