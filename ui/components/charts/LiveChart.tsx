"use client";

import { useEffect, useRef, useState } from "react";
import { LIVE_WINDOW } from "@/lib/store";

export interface ChartSeries {
  values: readonly number[];
  /** CSS color, may reference custom properties such as var(--res-cpu). */
  color: string;
  fill?: boolean;
  dashed?: boolean;
}

interface LiveChartProps {
  series: ChartSeries[];
  /** Fixed maximum (e.g. 100 for percentages). When omitted the chart scales to the data. */
  max?: number;
  height: number;
  grid?: boolean;
  className?: string;
  label: string;
  /** Number of samples on the x axis. */
  window?: number;
  /** Formats the current top of the scale, shown in the corner for auto-scaled charts. */
  formatScale?: (value: number) => string;
  /** Byte values are shown in 1024 steps, so their scale is rounded in those units. */
  binaryScale?: boolean;
}

/** Rounds up to 1, 2, 2.5 or 5 times a power of ten so the scale moves in calm, readable steps. */
export function niceCeil(value: number, binary = false): number {
  if (value <= 0) return 1;
  if (binary && value >= 1024) {
    const unit = 1024 ** Math.floor(Math.log(value) / Math.log(1024));
    return niceCeil(value / unit) * unit;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

const colorCache = new Map<string, string>();
let colorCacheTheme: string | undefined;

/**
 * Resolves a CSS custom property to its color. Values are cached per theme: reading computed styles
 * forces a style recalculation, which adds up quickly with many charts redrawing every second.
 */
export function resolveColor(_element: HTMLElement, color: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(color.trim());
  if (!match?.[1]) return color;

  const theme = document.documentElement.dataset.theme;
  if (theme !== colorCacheTheme) {
    colorCache.clear();
    colorCacheTheme = theme;
  }

  const cached = colorCache.get(match[1]);
  if (cached) return cached;
  const value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || "#888888";
  // Tokens can alias other tokens (e.g. --res-cpu: var(--accent-blue)).
  const resolved = value.startsWith("var(") ? resolveColor(_element, value) : value;
  colorCache.set(match[1], resolved);
  return resolved;
}

/** All charts that changed in one update are drawn together in a single animation frame. */
const pendingDraws = new Set<() => void>();
let frameRequested = false;

function scheduleDraw(draw: () => void): void {
  pendingDraws.add(draw);
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    const draws = [...pendingDraws];
    pendingDraws.clear();
    for (const run of draws) run();
  });
}

/** Converts a hex or rgb() color to rgba() with the given alpha, for canvas gradients. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex?.[1]) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(color);
  if (rgb?.[1]) {
    const [r, g, b] = rgb[1].split(/[,\s/]+/);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** Canvas line chart for rolling live values. Redraws once per update, batched with all other charts. */
export function LiveChart({ series, max, height, grid = true, className, label, window: samples = LIVE_WINDOW, formatScale, binaryScale = false }: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const drawRef = useRef<() => void>(() => {});
  const scaleRef = useRef(0);
  const [scale, setScale] = useState(0);

  // Auto-scaled charts grow at once when a spike arrives but shrink slowly afterwards, so a single
  // burst leaving the window does not make every line jump.
  let peak = max ?? 0;
  if (max === undefined) {
    const target = niceCeil(Math.max(0, ...series.flatMap((s) => s.values)) * 1.1, binaryScale);
    const current = scaleRef.current;
    peak = current === 0 || target > current ? target : target < current * 0.5 ? Math.max(target, niceCeil(current * 0.8, binaryScale)) : current;
    scaleRef.current = peak;
  }

  useEffect(() => {
    if (max === undefined && peak !== scale) setScale(peak);
  }, [max, peak, scale]);

  // The size is tracked by one observer for the chart's lifetime instead of being read on every draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      sizeRef.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      scheduleDraw(drawRef.current);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      pendingDraws.delete(drawRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height: h } = sizeRef.current;
      if (width === 0 || h === 0) return;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(h * ratio);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, h);

      const step = width / Math.max(1, samples - 1);

      if (grid) {
        ctx.strokeStyle = resolveColor(canvas, "var(--hairline-soft)");
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
          const y = Math.round((h / 4) * i) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        for (let i = 1; i < 6; i++) {
          const x = Math.round((width / 6) * i) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        ctx.stroke();
      }

      for (const s of series) {
        if (s.values.length < 2) continue;
        const color = resolveColor(canvas, s.color);
        const offset = samples - s.values.length;
        const points = s.values.map((v, i) => [(offset + i) * step, h - 1 - (Math.min(v, peak) / peak) * (h - 2)] as const);

        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        if (s.fill) {
          const gradient = ctx.createLinearGradient(0, 0, 0, h);
          gradient.addColorStop(0, withAlpha(color, 0.28));
          gradient.addColorStop(1, withAlpha(color, 0.02));
          ctx.save();
          ctx.lineTo(points[points.length - 1]![0], h);
          ctx.lineTo(points[0]![0], h);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        }
        ctx.setLineDash(s.dashed ? [4, 3] : []);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };

    pendingDraws.delete(drawRef.current);
    drawRef.current = draw;
    scheduleDraw(draw);
  }, [series, peak, grid, samples]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} role="img" aria-label={label} className={className} style={{ height, width: "100%", display: "block" }} />
      {formatScale && max === undefined && scale > 0 && (
        <span className="tnum pointer-events-none absolute top-1 right-1.5 text-caption-sm text-ash">{formatScale(scale)}</span>
      )}
    </div>
  );
}
