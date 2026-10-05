import { describe, expect, it } from "vitest";
import { ageBalances, agingBucket } from "./aging";

describe("aging buckets", () => {
  const asOf = "2026-10-05";
  it.each([
    ["2026-10-20", "current"],
    ["2026-10-05", "current"],
    ["2026-10-04", "1-30"],
    ["2026-09-05", "1-30"],
    ["2026-09-04", "31-60"],
    ["2026-08-06", "31-60"],
    ["2026-08-05", "61-90"],
    ["2026-07-07", "61-90"],
    ["2026-07-06", "90+"],
  ])("due %s → %s", (due, bucket) => {
    expect(agingBucket(due, asOf)).toBe(bucket);
  });
  it("sums balances per bucket", () => {
    expect(
      ageBalances(
        [
          { dueDate: "2026-10-30", balance: 100 },
          { dueDate: "2026-09-30", balance: 250 },
          { dueDate: "2026-01-01", balance: 999 },
          { dueDate: "2026-01-01", balance: 0 },
        ],
        asOf,
      ),
    ).toEqual({ current: 100, "1-30": 250, "31-60": 0, "61-90": 0, "90+": 999 });
  });
});
