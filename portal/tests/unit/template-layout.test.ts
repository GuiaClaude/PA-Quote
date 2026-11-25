import { describe, expect, it } from "vitest";
import { boxPx, fitFontSize, isChanged, pxPerPt, textX } from "@/lib/templates/layout";

describe("editable field layout", () => {
  it("converts printed points to screen pixels using the page size", () => {
    // a 252pt-wide business card shown 504px wide = 2 px per pt
    expect(pxPerPt(504, 252, 1200)).toBe(2);
    // unknown page size: assume 150 dpi preview
    expect(pxPerPt(600, null, 1200)).toBeCloseTo(600 / 576);
  });
  it("places boxes by percentage at any size", () => {
    expect(boxPx({ x_pct: 10, y_pct: 50, w_pct: 50, h_pct: 10 }, 1000, 600)).toEqual({ x: 100, y: 300, w: 500, h: 60 });
    const small = boxPx({ x_pct: 10, y_pct: 50, w_pct: 50, h_pct: 10 }, 320, 192);
    expect(small.x).toBeCloseTo(32); expect(small.y).toBeCloseTo(96); expect(small.w).toBeCloseTo(160); expect(small.h).toBeCloseTo(19.2);
  });
  it("shrinks long text to fit, but never below half size", () => {
    const measure = (size: number) => size * 10; // text is 10x as wide as its size
    expect(fitFontSize(20, 300, 40, measure)).toBe(20);       // 200px fits in 300
    const s = fitFontSize(20, 150, 40, measure);
    expect(s).toBeLessThanOrEqual(15);
    expect(s).toBeGreaterThanOrEqual(10);
    expect(fitFontSize(20, 10, 40, measure)).toBe(10);        // can't fit: stops at 50%
    expect(fitFontSize(20, 300, 10, measure)).toBeLessThanOrEqual(9.5); // limited by box height
  });
  it("aligns text and only draws changed fields", () => {
    expect(textX("left", 10, 100)).toBe(10);
    expect(textX("center", 10, 100)).toBe(60);
    expect(textX("right", 10, 100)).toBe(110);
    expect(isChanged("0918 200 0001", "0918 200 0001")).toBe(false);
    expect(isChanged("0917 123 4567", "0918 200 0001")).toBe(true);
    expect(isChanged(undefined, "x")).toBe(false);
  });
});
