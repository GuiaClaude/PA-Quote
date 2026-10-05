import { describe, expect, it } from "vitest";
import { periodContaining, periodFromParams, periodLabel, previousPeriod, samePeriodLastYear } from "./periods";

describe("periods", () => {
  it("week runs Monday to Sunday", () => {
    expect(periodContaining("week", "2026-10-05")).toEqual({ kind: "week", start: "2026-10-05", end: "2026-10-11" });
    expect(periodContaining("week", "2026-10-11")).toEqual({ kind: "week", start: "2026-10-05", end: "2026-10-11" });
  });
  it("month, quarter, year", () => {
    expect(periodContaining("month", "2024-02-10")).toMatchObject({ start: "2024-02-01", end: "2024-02-29" });
    expect(periodContaining("quarter", "2026-08-15")).toMatchObject({ start: "2026-07-01", end: "2026-09-30" });
    expect(periodContaining("year", "2026-08-15")).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
  });
  it("previous period and same period last year", () => {
    const q = periodContaining("quarter", "2026-01-10");
    expect(previousPeriod(q)).toMatchObject({ start: "2025-10-01", end: "2025-12-31" });
    expect(samePeriodLastYear(q)).toMatchObject({ start: "2025-01-01", end: "2025-03-31" });
    expect(previousPeriod({ kind: "custom", start: "2026-09-10", end: "2026-09-19" })).toMatchObject({ start: "2026-08-31", end: "2026-09-09" });
  });
  it("labels", () => {
    expect(periodLabel(periodContaining("month", "2026-09-01"))).toBe("Sep 2026");
    expect(periodLabel(periodContaining("quarter", "2026-09-01"))).toBe("Q3 2026");
  });
  it("falls back to the current month on bad params", () => {
    expect(periodFromParams({ period: "bogus", anchor: "x" }, "2026-10-05")).toMatchObject({ kind: "month", start: "2026-10-01" });
    expect(periodFromParams({ period: "custom", start: "2026-02-01", end: "2026-01-01" }, "2026-10-05").kind).toBe("month");
  });
});
