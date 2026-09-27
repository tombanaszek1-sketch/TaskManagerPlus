"use client";

import { useRef } from "react";

/**
 * Keeps a list in a stable order across live updates so rows do not jump every second.
 *
 * - Items keep the position they had in the previous update.
 * - New items are appended at the end, in the order `compare` gives them.
 * - An item only moves up past its neighbour when its value is larger by more than `margin`
 *   (0.25 = 25 %) and by at least `minDelta`. With `margin = Infinity` the order is frozen until
 *   `resetKey` changes.
 * - With `minIntervalMs`, ranks change at most that often; values keep updating in between.
 * - Changing `resetKey` (e.g. a new sort column) re-sorts the whole list once with `compare`.
 */
export function useStableOrder<T>(
  items: readonly T[],
  key: (item: T) => string | number,
  value: (item: T) => number,
  compare: (a: T, b: T) => number,
  resetKey: string,
  margin: number,
  minDelta = 0,
  minIntervalMs = 0,
): T[] {
  const state = useRef<{ resetKey: string; order: (string | number)[]; reorderedAt: number }>({ resetKey: "", order: [], reorderedAt: 0 });
  const now = Date.now();
  let reorderedAt = state.current.reorderedAt;

  const byKey = new Map<string | number, T>();
  for (const item of items) byKey.set(key(item), item);

  let order: (string | number)[];
  if (state.current.resetKey !== resetKey) {
    order = [...items].sort(compare).map(key);
    reorderedAt = now;
  } else {
    const kept = state.current.order.filter((k) => byKey.has(k));
    const known = new Set(kept);
    const added = items.filter((item) => !known.has(key(item))).sort(compare).map(key);
    order = [...kept, ...added];

    if (Number.isFinite(margin) && now - reorderedAt >= minIntervalMs) {
      reorderedAt = now;
      // Insertion pass: an item overtakes the one above only with a clear lead.
      for (let i = 1; i < order.length; i++) {
        let j = i;
        while (j > 0) {
          const current = value(byKey.get(order[j]!)!);
          const above = value(byKey.get(order[j - 1]!)!);
          if (current <= above * (1 + margin) + minDelta) break;
          [order[j - 1], order[j]] = [order[j]!, order[j - 1]!];
          j--;
        }
      }
    }
  }

  state.current = { resetKey, order, reorderedAt };
  return order.map((k) => byKey.get(k)!);
}
