export function truncate(value: string, max = 72): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function formatDateLabel(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0B";
  if (value < 1024) return `${value}B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)}${units[index]}`;
}

export function getWindowedItems<T>(items: T[], selectedIndex: number, windowSize = 12) {
  if (items.length <= windowSize) {
    return {
      items,
      start: 0,
      end: items.length,
    };
  }

  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, Math.min(selectedIndex - half, items.length - windowSize));
  const end = Math.min(items.length, start + windowSize);

  return {
    items: items.slice(start, end),
    start,
    end,
  };
}
