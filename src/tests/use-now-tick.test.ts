import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { timeOfDayHasPassedToday } from "@/lib/hooks/use-now-tick";

describe("timeOfDayHasPassedToday", () => {
  beforeEach(() => {
    // Fix "now" at 10:00 AM local time so the past/future split is
    // unambiguous regardless of when the test runs.
    const fixed = new Date();
    fixed.setHours(10, 0, 0, 0);
    vi.setSystemTime(fixed);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for null / undefined / empty / unparseable", () => {
    expect(timeOfDayHasPassedToday(null)).toBe(false);
    expect(timeOfDayHasPassedToday(undefined)).toBe(false);
    expect(timeOfDayHasPassedToday("")).toBe(false);
    expect(timeOfDayHasPassedToday("morning")).toBe(false);
    expect(timeOfDayHasPassedToday("noonish")).toBe(false);
  });

  it("returns true when 24h time is in the past", () => {
    expect(timeOfDayHasPassedToday("07:00")).toBe(true);
    expect(timeOfDayHasPassedToday("09:59")).toBe(true);
  });

  it("returns false when 24h time is in the future", () => {
    expect(timeOfDayHasPassedToday("10:01")).toBe(false);
    expect(timeOfDayHasPassedToday("18:00")).toBe(false);
    expect(timeOfDayHasPassedToday("23:59")).toBe(false);
  });

  it("handles 12-hour with AM/PM", () => {
    expect(timeOfDayHasPassedToday("7:00 AM")).toBe(true);
    expect(timeOfDayHasPassedToday("9:30 am")).toBe(true);
    expect(timeOfDayHasPassedToday("11:00 AM")).toBe(false);
    expect(timeOfDayHasPassedToday("2:00 PM")).toBe(false);
    expect(timeOfDayHasPassedToday("12:00 AM")).toBe(true); // midnight already past 10am
    expect(timeOfDayHasPassedToday("12:00 PM")).toBe(false); // noon is future
  });

  it("handles loose formatting (7am / 9:30pm)", () => {
    expect(timeOfDayHasPassedToday("7am")).toBe(true);
    expect(timeOfDayHasPassedToday("9:30am")).toBe(true);
    expect(timeOfDayHasPassedToday("9:30pm")).toBe(false);
  });

  it("rejects garbage that happens to start with digits", () => {
    expect(timeOfDayHasPassedToday("99")).toBe(false);
    expect(timeOfDayHasPassedToday("25:00")).toBe(false);
    expect(timeOfDayHasPassedToday("12:99")).toBe(false);
  });
});
