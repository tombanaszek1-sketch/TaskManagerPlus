import type { Snapshot } from "./types";

interface HostWebView {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

declare global {
  interface Window {
    chrome?: { webview?: HostWebView };
  }
}

type HostMessage =
  | { type: "snapshot"; data: Snapshot }
  | { type: "result"; id: string; ok: true; data: unknown }
  | { type: "result"; id: string; ok: false; error: string };

type SnapshotListener = (snapshot: Snapshot) => void;

/** Transport between the page and its host: the desktop app, or a local mock when opened in a browser. */
export interface Transport {
  readonly isHost: boolean;
  start(onSnapshot: SnapshotListener): () => void;
  request<T>(action: string, args?: Record<string, unknown>): Promise<T>;
  notifyTheme(dark: boolean): void;
}

class HostTransport implements Transport {
  readonly isHost = true;
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private sequence = 0;

  constructor(private readonly webview: HostWebView) {}

  start(onSnapshot: SnapshotListener): () => void {
    const listener = (event: MessageEvent) => {
      const message = event.data as HostMessage;
      if (message.type === "snapshot") {
        onSnapshot(message.data);
      } else if (message.type === "result") {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.ok) entry.resolve(message.data);
        else entry.reject(new Error(message.error));
      }
    };
    this.webview.addEventListener("message", listener);
    this.webview.postMessage({ type: "ready" });
    return () => this.webview.removeEventListener("message", listener);
  }

  request<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
    const id = `r${++this.sequence}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.webview.postMessage({ type: "request", id, action, args });
    });
  }

  notifyTheme(dark: boolean): void {
    this.webview.postMessage({ type: "theme", dark });
  }
}

let transport: Transport | undefined;

export async function getTransport(): Promise<Transport> {
  if (transport) return transport;
  const webview = typeof window !== "undefined" ? window.chrome?.webview : undefined;
  if (webview) {
    transport = new HostTransport(webview);
  } else {
    // Development and screenshots in a normal browser run against generated data.
    const { MockTransport } = await import("./mock");
    transport = new MockTransport();
  }
  return transport;
}

export function request<T>(action: string, args?: Record<string, unknown>): Promise<T> {
  return getTransport().then((t) => t.request<T>(action, args));
}
