export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  const saved = Math.max(0, 1 - ratio) * 100;
  return `${saved.toFixed(saved >= 10 ? 0 : 1)}% saved`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export function formatThroughput(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec == null || bytesPerSec <= 0) return "—";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(
  bytesUploaded: number,
  bytesTotal: number,
  bytesPerSec: number | null,
): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "—";
  const remaining = Math.max(0, bytesTotal - bytesUploaded);
  return formatDuration((remaining / bytesPerSec) * 1000);
}
