const locale = "en-US";

const numberFormats = new Map<string, Intl.NumberFormat>();

function nf(digits: number): Intl.NumberFormat {
  const key = `${locale}:${digits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(key, format);
  }
  return format;
}

export function number(value: number, digits = 0): string {
  return nf(digits).format(value);
}

export function percent(value: number | undefined, digits?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "–";
  const d = digits ?? (value > 0 && value < 10 ? 1 : 0);
  return `${nf(d).format(value)}%`;
}

const byteUnits = ["B", "KB", "MB", "GB", "TB"];

export function bytes(value: number | undefined, digits?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "–";
  let v = Math.abs(value);
  let unit = 0;
  // Switch units at 1000 so values never show four integer digits ("1.008 MB").
  while (v >= 1000 && unit < byteUnits.length - 1) {
    v /= 1024;
    unit++;
  }
  const d = digits ?? (unit === 0 ? 0 : v >= 100 ? 0 : 1);
  return `${nf(d).format(v)} ${byteUnits[unit]}`;
}

/** Throughput in bytes per second, shown the way people read transfer speeds. */
export function rate(bytesPerSec: number | undefined): string {
  if (bytesPerSec === undefined || !Number.isFinite(bytesPerSec)) return "–";
  if (bytesPerSec < 1) return "0 KB/s";
  return `${bytes(bytesPerSec, bytesPerSec < 1024 ? 0 : undefined)}/s`;
}

/** Network speed in bits per second (Mbit/s), which is how internet contracts are sold. */
export function bitrate(bytesPerSec: number | undefined): string {
  if (bytesPerSec === undefined || !Number.isFinite(bytesPerSec)) return "–";
  const bits = bytesPerSec * 8;
  if (bits >= 1e9) return `${nf(2).format(bits / 1e9)} Gbit/s`;
  if (bits >= 1e6) return `${nf(bits >= 1e8 ? 0 : 1).format(bits / 1e6)} Mbit/s`;
  if (bits >= 1e3) return `${nf(0).format(bits / 1e3)} kbit/s`;
  return `${nf(0).format(bits)} bit/s`;
}

export function linkSpeed(bitsPerSec: number): string {
  if (bitsPerSec <= 0) return "–";
  if (bitsPerSec >= 1e9) return `${nf(bitsPerSec % 1e9 === 0 ? 0 : 1).format(bitsPerSec / 1e9)} Gbit/s`;
  return `${nf(0).format(bitsPerSec / 1e6)} Mbit/s`;
}

export function mhz(value: number | undefined): string {
  if (value === undefined) return "–";
  return value >= 1000 ? `${nf(2).format(value / 1000)} GHz` : `${nf(0).format(value)} MHz`;
}

export function celsius(value: number | undefined): string {
  return value === undefined ? "–" : `${nf(0).format(value)} °C`;
}

export function watts(value: number | undefined): string {
  return value === undefined ? "–" : `${nf(value < 10 ? 1 : 0).format(value)} W`;
}

export function ms(value: number | undefined): string {
  return value === undefined ? "–" : `${nf(value < 10 ? 1 : 0).format(value)} ms`;
}

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return d > 0 ? `${d}:${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function time(unixSeconds: number, withDate: boolean): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(withDate ? { day: "2-digit", month: "2-digit" } : {}),
  }).format(new Date(unixSeconds * 1000));
}

export function dateTime(iso: string | undefined): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(iso));
}

/** Formats a sensor reading with the unit implied by its kind. */
export function sensorValue(kind: string, value: number | undefined): string {
  if (value === undefined) return "–";
  switch (kind) {
    case "temperature":
      return celsius(value);
    case "load":
    case "control":
    case "level":
      return percent(value, 1);
    case "clock":
      return mhz(value);
    case "power":
      return watts(value);
    case "voltage":
      return `${nf(3).format(value)} V`;
    case "current":
      return `${nf(2).format(value)} A`;
    case "fan":
      return `${nf(0).format(value)} RPM`;
    case "data":
      return `${nf(1).format(value)} GB`;
    case "smallData":
      return `${nf(0).format(value)} MB`;
    case "throughput":
      return rate(value);
    case "energy":
      return `${nf(0).format(value)} mWh`;
    case "frequency":
      return `${nf(0).format(value)} Hz`;
    default:
      return nf(2).format(value);
  }
}
