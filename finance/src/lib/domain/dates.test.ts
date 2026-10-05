import { describe, expect, it } from "vitest";
import { addMonths, excelSerialToISO, formatDate, manilaToday, parseFlexibleDate, parseMonthName } from "./dates";

describe("parseFlexibleDate", () => {
  it.each([
    [45470, "2024-06-27"],
    ["45470", "2024-06-27"],
    ["02.16.2023", "2023-02-16"],
    ["4.15.23", "2023-04-15"],
    ["2-23-2023", "2023-02-23"],
    ["6/19/2023", "2023-06-19"],
    ["9/15/2026", "2026-09-15"],
    ["2024-03-12 00:00:00", "2024-03-12"],
    ["2024-03-12", "2024-03-12"],
    ["February 20, 2024", "2024-02-20"],
    ["APRil 2, 2024", "2024-04-02"],
    ["January  8, 2024", "2024-01-08"],
    ["Feb 16 2023", "2023-02-16"],
    ["16-Feb-23", "2023-02-16"],
    ["25.12.2023", "2023-12-25"], // first part > 12 → day first
  ])("%s → %s", (input, expected) => {
    expect(parseFlexibleDate(input).date).toBe(expected);
  });

  it("flags 03.04.2024 as ambiguous (could be Mar 4 or Apr 3)", () => {
    const r = parseFlexibleDate("03.04.2024");
    expect(r.date).toBe("2024-03-04");
    expect(r.ambiguous).toBe(true);
  });
  it("is not ambiguous when both parts are equal", () => {
    expect(parseFlexibleDate("5/5/2024").ambiguous).toBe(false);
  });
  it("reads real Date objects as calendar dates", () => {
    expect(parseFlexibleDate(new Date(Date.UTC(2024, 6, 1))).date).toBe("2024-07-01");
  });
  it.each([["AUGUST , 2026"], ["2/30/2024"], ["hello"], [12], [1234567]])("rejects %s", (input) => {
    const r = parseFlexibleDate(input);
    expect(r.date).toBeNull();
    expect(r.error).toBeTruthy();
  });
  it("blank → null without error", () => {
    expect(parseFlexibleDate("")).toEqual({ date: null, ambiguous: false });
  });
});

describe("helpers", () => {
  it("Excel serial edge cases", () => {
    expect(excelSerialToISO(1)).toBe("1900-01-01");
    expect(excelSerialToISO(61)).toBe("1900-03-01");
    expect(excelSerialToISO(45292)).toBe("2024-01-01");
  });
  it("month names with trailing spaces and mixed case", () => {
    expect(parseMonthName("JULY ")).toBe(7);
    expect(parseMonthName("Sept")).toBe(9);
    expect(parseMonthName("xyz")).toBeNull();
  });
  it("MM/DD/YYYY display", () => {
    expect(formatDate("2026-10-05")).toBe("10/05/2026");
  });
  it("adds months without overflowing short months", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("Manila date differs from UTC late in the UTC day", () => {
    // 2026-10-04 17:30 UTC = 2026-10-05 01:30 in Manila
    expect(manilaToday(new Date(Date.UTC(2026, 9, 4, 17, 30)))).toBe("2026-10-05");
  });
});
