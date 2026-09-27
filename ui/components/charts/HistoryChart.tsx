"use client";

import { useEffect, useRef, useState } from "react";
import { time } from "@/lib/format";
import type { HistoryPoint } from "@/lib/types";
import { resolveColor, withAlpha } from "./LiveChart";

export interface HistorySeries {
  label: string;
  points: HistoryPoint[];
  color: string;
  dashed?: boolean;
}

/**
 * Time-axis chart for recorded history. Hovering shows the values at a point in time, clicking
 * selects the bucket so the page can list which programs were active then.
 */
export function HistoryChart({
  series,
  from,
  to,
  bucket,
  max,
  format,
  height = 160,
  selected,
  onSelect,
  label,
}: {
  series: HistorySeries[];
  from: number;
  to: number;
  bucket: number;
  max?: number;
  format: (value: number) => string;
  height?: number;
  selected?: number;
  onSelect?: (timestamp: number) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; timestamp: number }>();
  const withDate = to - from > 86_400;

  const peak = max ?? Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value))) * 1.15;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!width || !h) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(h * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, h);

      const x = (ts: number) => ((ts - from) / Math.max(1, to - from)) * width;
      const y = (v: number) => h - 1 - (Math.min(v, peak) / peak) * (h - 2);

      ctx.strokeStyle = resolveColor(canvas, "var(--hairline-soft)");
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const gy = Math.round((h / 4) * i) + 0.5;
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
      }
      ctx.stroke();

      if (selected !== undefined) {
        ctx.fillStyle = resolveColor(canvas, "var(--hairline-soft)");
        ctx.fillRect(x(selected), 0, Math.max(2, x(selected + bucket) - x(selected)), h);
      }

      for (const s of series) {
        const color = resolveColor(canvas, s.color);
        ctx.setLineDash(s.dashed ? [4, 3] : []);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        // Break the line where no samples were recorded (app not running).
        let segment: HistoryPoint[] = [];
        const flush = () => {
          if (segment.length === 0) return;
          ctx.beginPath();
          segment.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.timestamp), y(p.value)) : ctx.lineTo(x(p.timestamp), y(p.value))));
          if (segment.length === 1) ctx.lineTo(x(segment[0]!.timestamp) + 1, y(segment[0]!.value));
          ctx.stroke();
          if (!s.dashed) {
            ctx.lineTo(x(segment[segment.length - 1]!.timestamp), h);
            ctx.lineTo(x(segment[0]!.timestamp), h);
            ctx.closePath();
            ctx.fillStyle = withAlpha(color, 0.12);
            ctx.fill();
          }
          segment = [];
        };
        s.points.forEach((p, i) => {
          const previous = s.points[i - 1];
          if (previous && p.timestamp - previous.timestamp > bucket * 3) flush();
          segment.push(p);
        });
        flush();
      }
      ctx.setLineDash([]);

      if (hover) {
        ctx.strokeStyle = resolveColor(canvas, "var(--hairline-strong)");
        ctx.beginPath();
        ctx.moveTo(Math.round(hover.x) + 0.5, 0);
        ctx.lineTo(Math.round(hover.x) + 0.5, h);
        ctx.stroke();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [series, from, to, bucket, peak, selected, hover]);

  const timestampAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const ts = from + ratio * (to - from);
    return { x: clientX - rect.left, timestamp: Math.floor(ts / bucket) * bucket };
  };

  const values = hover
    ? series.map((s) => ({ s, point: s.points.find((p) => Math.abs(p.timestamp - hover.timestamp) < bucket) }))
    : [];

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block w-full cursor-crosshair"
        style={{ height }}
        onMouseMove={(e) => setHover(timestampAt(e.clientX))}
        onMouseLeave={() => setHover(undefined)}
        onClick={(e) => onSelect?.(timestampAt(e.clientX).timestamp)}
      />
      {hover && values.some((v) => v.point) && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-hairline bg-card px-2.5 py-1.5 text-caption-sm shadow-lg"
          style={{ left: Math.min(hover.x + 12, (canvasRef.current?.clientWidth ?? 0) - 170) }}
        >
          <div className="tnum mb-0.5 text-mute">{time(hover.timestamp, withDate)}</div>
          {values.map(({ s, point }) => (
            <div key={s.label} className="tnum flex items-center gap-2 whitespace-nowrap">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-body">{s.label}</span>
              <span className="ml-auto pl-3 text-ink">{point ? format(point.value) : "–"}</span>
            </div>
          ))}
        </div>
      )}
      <div className="tnum mt-1.5 flex justify-between text-caption-sm text-ash">
        <span>{time(from, withDate)}</span>
        <span>{time(from + (to - from) / 2, withDate)}</span>
        <span>{time(to, withDate)}</span>
      </div>
    </div>
  );
}
