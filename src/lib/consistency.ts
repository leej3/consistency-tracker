import type { ConsistencyEntry, DailySeriesPoint, WindowRange } from "../types";

export const BRISTOL_SCALE = [1, 2, 3, 4, 5, 6, 7] as const;
export const DEFAULT_COMMENT_MAX_LENGTH = 1000;

function toUtcStartOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function toUtcHour(date: string, hour: string): string {
  const [year, month, day] = date.split("-").map((value) => Number(value));
  const [rawHour] = hour.split(":");
  const hourNumber = Number(rawHour);

  return new Date(Date.UTC(year, month - 1, day, hourNumber, 0, 0, 0)).toISOString();
}

export function getUtcWindowRange(dayCount: number, backwardShiftDays: number): WindowRange {
  const todayStartUtc = toUtcStartOfDay(new Date());
  const start = addUtcDays(todayStartUtc, -(backwardShiftDays + dayCount - 1));
  const endExclusive = addUtcDays(todayStartUtc, -backwardShiftDays + 1);

  return {
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
    startDate: start,
    endDateExclusive: endExclusive,
    dayCount,
    displayStartLabel: start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    displayEndLabel: addUtcDays(endExclusive, -1).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

export function isCommentLengthValid(comment: string): boolean {
  return comment.length <= DEFAULT_COMMENT_MAX_LENGTH;
}

export function formatUtcDateTime(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

export function shortPersonLabel(personId: string): string {
  const safe = personId.trim();
  if (safe.length <= 12) {
    return safe;
  }

  return `${safe.slice(0, 8)}...${safe.slice(-4)}`;
}

export function dayLabelFromKey(utcDateKey: string): string {
  return new Date(`${utcDateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildDailySeries(
  entries: ConsistencyEntry[],
  range: WindowRange,
  rollingWindowSize = 3,
): DailySeriesPoint[] {
  const buckets: DailySeriesPoint[] = [];
  const values = new Map<string, { count: number; sum: number }>();

  for (let dayOffset = 0; dayOffset < range.dayCount; dayOffset += 1) {
    const bucketDate = addUtcDays(range.startDate, dayOffset).toISOString().slice(0, 10);
    const point: DailySeriesPoint = {
      date: bucketDate,
      label: dayLabelFromKey(bucketDate),
      count: 0,
      average: null,
      rollingAverage: null,
    };
    buckets.push(point);
    values.set(bucketDate, { count: 0, sum: 0 });
  }

  for (const entry of entries) {
    const dayKey = entry.at.slice(0, 10);
    const stats = values.get(dayKey);
    if (!stats) {
      continue;
    }

    stats.count += 1;
    stats.sum += entry.score;
  }

  for (const point of buckets) {
    const stats = values.get(point.date);
    if (stats && stats.count > 0) {
      point.count = stats.count;
      point.average = Number((stats.sum / stats.count).toFixed(2));
    }
  }

  for (let idx = 0; idx < buckets.length; idx += 1) {
    const startIndex = Math.max(0, idx - rollingWindowSize + 1);
    let total = 0;
    let sampleCount = 0;

    for (let cursor = startIndex; cursor <= idx; cursor += 1) {
      const point = buckets[cursor];
      if (point.average === null) {
        continue;
      }

      total += point.average;
      sampleCount += 1;
    }

    if (sampleCount > 0) {
      buckets[idx].rollingAverage = Number((total / sampleCount).toFixed(2));
    }
  }

  return buckets;
}
