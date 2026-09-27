"use client";

import { useRef } from "react";

/** How long an item stays in a live ranking after its value dropped to zero. */
const HOLD_MS = 8000;

/** Weight of the newest sample in the moving average; lower is calmer. */
const ALPHA = 0.4;

/**
 * Exponentially smooths per-item values of a live list and keeps items for a few seconds after
 * they stop reporting, fading their value out. Bursty metrics (disk and network I/O, short CPU
 * spikes) otherwise make rows appear, vanish and swap with every sample.
 *
 * `version` must change exactly once per new sample (e.g. the snapshot object); re-renders for
 * other reasons reuse the last result. Changing `resetKey` starts from scratch.
 */
export function useSmoothed<T>(
  items: readonly T[],
  key: (item: T) => string | number,
  value: (item: T) => number,
  version: unknown,
  resetKey: string,
): { item: T; value: number }[] {
  const state = useRef<{
    version?: unknown;
    resetKey?: string;
    entries: Map<string | number, { item: T; value: number; lastActive: number }>;
    result: { item: T; value: number }[];
  }>({ entries: new Map(), result: [] });

  const s = state.current;
  if (s.version === version && s.resetKey === resetKey) return s.result;

  if (s.resetKey !== resetKey) s.entries.clear();
  const now = Date.now();
  const seen = new Set<string | number>();

  for (const item of items) {
    const v = value(item);
    if (v <= 0) continue;
    const k = key(item);
    const previous = s.entries.get(k);
    s.entries.set(k, { item, value: previous ? previous.value * (1 - ALPHA) + v * ALPHA : v, lastActive: now });
    seen.add(k);
  }

  for (const [k, entry] of s.entries) {
    if (seen.has(k)) continue;
    if (now - entry.lastActive > HOLD_MS) s.entries.delete(k);
    else entry.value *= 1 - ALPHA;
  }

  s.version = version;
  s.resetKey = resetKey;
  s.result = [...s.entries.values()].map(({ item, value: v }) => ({ item, value: v }));
  return s.result;
}
