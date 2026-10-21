export const APP_TIME_ZONE = "America/Sao_Paulo";

export type Period = "today" | "week" | "month" | "all" | "custom";

export type TimeRange = {
  start?: Date;
  end?: Date;
};

export type ServiceTiming = {
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
  pausedDurationSeconds: number;
  pauseStartedAt: Date | null;
  status: "running" | "paused" | "completed";
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hourCycle: "h23",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const parts = (date: Date, withTime = false) =>
  Object.fromEntries(
    (withTime ? dateTimeFormatter : dateFormatter)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

export const dateKey = (date: Date) => {
  const value = parts(date);
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
};

export const isValidDateKey = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year!, month! - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month! - 1 &&
    check.getUTCDate() === day
  );
};

export const addDaysToDateKey = (value: string, amount: number) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

// Converts midnight in the configured business timezone to an absolute instant.
// The short iteration also handles historical daylight-saving offsets correctly.
export const startOfDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const wanted = Date.UTC(year!, month! - 1, day!, 0, 0, 0);
  let candidate = wanted;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = parts(new Date(candidate), true);
    const represented = Date.UTC(
      actual.year!,
      actual.month! - 1,
      actual.day!,
      actual.hour!,
      actual.minute!,
      actual.second!,
    );
    candidate -= represented - wanted;
  }
  return new Date(candidate);
};

export const rangeForPeriod = (
  period: Period,
  now = new Date(),
  startDate?: string,
  endDate?: string,
): TimeRange | null => {
  if (period === "all") return {};

  if (period === "custom") {
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) return null;
    if (startDate! > endDate!) return null;
    return {
      start: startOfDateKey(startDate!),
      end: startOfDateKey(addDaysToDateKey(endDate!, 1)),
    };
  }

  const today = dateKey(now);
  let firstDay = today;
  if (period === "week") {
    const [year, month, day] = today.split("-").map(Number);
    const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
    firstDay = addDaysToDateKey(today, -((weekday + 6) % 7));
  } else if (period === "month") {
    firstDay = `${today.slice(0, 7)}-01`;
  }

  return {
    start: startOfDateKey(firstDay),
    end: startOfDateKey(addDaysToDateKey(today, 1)),
  };
};

export const effectiveEnd = (service: ServiceTiming, now: Date) => {
  if (service.status === "completed") return service.endedAt ?? service.startedAt;
  if (service.status === "paused" && service.pauseStartedAt) {
    return service.pauseStartedAt;
  }
  return now;
};

export const productiveSeconds = (service: ServiceTiming, now: Date) => {
  if (service.status === "completed") return Math.max(0, service.durationSeconds);
  const wallSeconds = Math.max(
    0,
    Math.floor(
      (effectiveEnd(service, now).getTime() - service.startedAt.getTime()) / 1000,
    ),
  );
  return Math.max(0, wallSeconds - service.pausedDurationSeconds);
};

export const overlapsRange = (
  service: ServiceTiming,
  range: TimeRange,
  now: Date,
) => {
  const end = effectiveEnd(service, now);
  return (
    (!range.end || service.startedAt < range.end) &&
    (!range.start || end > range.start)
  );
};

export const productiveSecondsInRange = (
  service: ServiceTiming,
  range: TimeRange,
  now: Date,
) => {
  const total = productiveSeconds(service, now);
  if (total === 0) return 0;

  const serviceEnd = effectiveEnd(service, now);
  const wallMs = Math.max(0, serviceEnd.getTime() - service.startedAt.getTime());
  if (wallMs === 0) return 0;

  const overlapStart = Math.max(
    service.startedAt.getTime(),
    range.start?.getTime() ?? Number.NEGATIVE_INFINITY,
  );
  const overlapEnd = Math.min(
    serviceEnd.getTime(),
    range.end?.getTime() ?? Number.POSITIVE_INFINITY,
  );
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  if (overlapMs === 0) return 0;
  if (overlapMs === wallMs) return total;

  // Existing records keep only the aggregate pause duration. Distributing that
  // aggregate across a partial overlap preserves the exact session total while
  // allowing sessions that cross a date boundary to be split consistently.
  const elapsedBeforeStart = overlapStart - service.startedAt.getTime();
  const elapsedBeforeEnd = overlapEnd - service.startedAt.getTime();
  return (
    Math.floor((total * elapsedBeforeEnd) / wallMs) -
    Math.floor((total * elapsedBeforeStart) / wallMs)
  );
};

export const dateKeysInRange = (range: TimeRange, now = new Date()) => {
  if (!range.start) return [];
  const lastInstant = new Date(
    Math.max(range.start.getTime(), (range.end ?? now).getTime() - 1),
  );
  const last = dateKey(lastInstant);
  const keys: string[] = [];
  for (let key = dateKey(range.start); key <= last; key = addDaysToDateKey(key, 1)) {
    keys.push(key);
  }
  return keys;
};
