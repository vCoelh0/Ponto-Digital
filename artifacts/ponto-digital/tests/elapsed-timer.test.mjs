import assert from "node:assert/strict";
import test from "node:test";
import { displayedElapsedSeconds } from "../src/components/elapsed-timer.ts";

test("advances a running period from the seconds reported by the server", () => {
  assert.equal(displayedElapsedSeconds(0, false, 100_000, 105_000), 5);
  assert.equal(displayedElapsedSeconds(17, false, 100_000, 104_000), 21);
});

test("does not compare the browser clock with a server timestamp", () => {
  const clientClockFourHoursBehind = -14_400_000;
  assert.equal(
    displayedElapsedSeconds(
      12,
      false,
      clientClockFourHoursBehind,
      clientClockFourHoursBehind + 3_000,
    ),
    15,
  );
});

test("freezes on pause, resumes without resetting, and catches up after tab inactivity", () => {
  assert.equal(displayedElapsedSeconds(20, true, 10_000, 70_000), 20);
  assert.equal(displayedElapsedSeconds(20, false, 70_000, 70_000), 20);
  assert.equal(displayedElapsedSeconds(20, false, 70_000, 75_000), 25);
  assert.equal(displayedElapsedSeconds(25, false, 75_000, 135_000), 85);
});