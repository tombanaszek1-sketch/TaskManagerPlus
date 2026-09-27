"use client";

import { useEffect, useState } from "react";
import { getTransport } from "./bridge";

/** Program icons, loaded from the host in batches and cached for the session. */
const cache = new Map<string, string | null>();
const waiting = new Map<string, Set<(icon: string | null) => void>>();
let queued: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const paths = queued;
  queued = [];
  getTransport()
    .then((t): Promise<Record<string, string | null>> => (t.isHost ? t.request("process.icons", { paths }) : Promise.resolve({})))
    .catch((): Record<string, string | null> => ({}))
    .then((icons) => {
      for (const path of paths) {
        const icon = icons[path] ?? null;
        cache.set(path, icon);
        waiting.get(path)?.forEach((notify) => notify(icon));
        waiting.delete(path);
      }
    });
}

function load(path: string, notify: (icon: string | null) => void): () => void {
  let listeners = waiting.get(path);
  if (!listeners) {
    listeners = new Set();
    waiting.set(path, listeners);
    queued.push(path);
    timer ??= setTimeout(flush, 30);
  }
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useProgramIcon(path: string | undefined): string | null {
  const [icon, setIcon] = useState<string | null>(() => (path ? cache.get(path) ?? null : null));

  useEffect(() => {
    if (!path) {
      setIcon(null);
      return;
    }
    if (cache.has(path)) {
      setIcon(cache.get(path) ?? null);
      return;
    }
    return load(path, setIcon);
  }, [path]);

  return icon;
}
