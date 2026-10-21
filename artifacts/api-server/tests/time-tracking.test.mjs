import assert from "node:assert/strict";
import test from "node:test";
import {
  dateKey,
  isValidDateKey,
  productiveSeconds,
  productiveSecondsInRange,
  rangeForPeriod,
} from "../src/lib/time-tracking.ts";

const completedService = (overrides = {}) => ({
  startedAt: new Date("2026-10-20T02:30:00.000Z"),
  endedAt: new Date("2026-10-20T03:30:00.000Z"),
  durationSeconds: 3_600,
  pausedDurationSeconds: 0,
  pauseStartedAt: null,
  status: "completed",
  ...overrides,
});

test("a custom end date includes that entire day in São Paulo", () => {
  const range = rangeForPeriod(
    "custom",
    new Date("2026-10-21T12:00:00.000Z"),
    "2026-10-01",
    "2026-10-21",
  );

  assert.ok(range);
  assert.equal(range.start.toISOString(), "2026-10-01T03:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-10-22T03:00:00.000Z");
});

test("rejects impossible or reversed custom dates", () => {
  assert.equal(isValidDateKey("2026-02-29"), false);
  assert.equal(
    rangeForPeriod("custom", new Date(), "2026-10-22", "2026-10-21"),
    null,
  );
});

test("splits a session crossing midnight between both calendar days", () => {
  const service = completedService();
  const now = new Date("2026-10-21T12:00:00.000Z");
  const firstDay = rangeForPeriod("custom", now, "2026-10-19", "2026-10-19");
  const secondDay = rangeForPeriod("custom", now, "2026-10-20", "2026-10-20");

  assert.ok(firstDay && secondDay);
  assert.equal(productiveSecondsInRange(service, firstDay, now), 1_800);
  assert.equal(productiveSecondsInRange(service, secondDay, now), 1_800);
});

test("preserves paused totals when a historical session is split", () => {
  const service = completedService({
    durationSeconds: 2_400,
    pausedDurationSeconds: 1_200,
  });
  const now = new Date("2026-10-21T12:00:00.000Z");
  const firstDay = rangeForPeriod("custom", now, "2026-10-19", "2026-10-19");
  const secondDay = rangeForPeriod("custom", now, "2026-10-20", "2026-10-20");

  assert.ok(firstDay && secondDay);
  assert.equal(productiveSecondsInRange(service, firstDay, now), 1_200);
  assert.equal(productiveSecondsInRange(service, secondDay, now), 1_200);
});

test("split ranges add back to the exact recorded total", () => {
  const service = completedService({ durationSeconds: 3_599 });
  const now = new Date("2026-10-21T12:00:00.000Z");
  const firstDay = rangeForPeriod("custom", now, "2026-10-19", "2026-10-19");
  const secondDay = rangeForPeriod("custom", now, "2026-10-20", "2026-10-20");

  assert.ok(firstDay && secondDay);
  assert.equal(
    productiveSecondsInRange(service, firstDay, now) +
      productiveSecondsInRange(service, secondDay, now),
    3_599,
  );
});

test("includes running time and freezes elapsed time while paused", () => {
  const now = new Date("2026-10-21T16:00:00.000Z");
  const running = completedService({
    startedAt: new Date("2026-10-21T15:00:00.000Z"),
    endedAt: null,
    durationSeconds: 0,
    status: "running",
  });
  const paused = {
    ...running,
    status: "paused",
    pauseStartedAt: new Date("2026-10-21T15:30:00.000Z"),
  };

  assert.equal(productiveSeconds(running, now), 3_600);
  assert.equal(productiveSeconds(paused, now), 1_800);
  assert.equal(dateKey(now), "2026-10-21");
});
