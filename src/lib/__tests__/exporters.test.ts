import { describe, expect, it } from "vitest";
import { dataUrlToBytes, exportPixelRatio, parseTranslate, pdfPageSize } from "../exporters";

describe("exportPixelRatio", () => {
  it("keeps full sharpness for an ordinary tree", () => {
    expect(exportPixelRatio(1600, 1000)).toBe(2);
  });

  it("backs off so a wide tree stays within the canvas side limit", () => {
    const ratio = exportPixelRatio(20_000, 900);
    expect(ratio).toBeLessThan(1);
    expect(20_000 * ratio).toBeLessThanOrEqual(16_384 + 1);
  });

  it("backs off so a large tree stays within the pixel budget", () => {
    const ratio = exportPixelRatio(9_000, 9_000);
    expect(9_000 * ratio * 9_000 * ratio).toBeLessThanOrEqual(100_000_000 * 1.001);
  });

  it("never reaches zero", () => {
    expect(exportPixelRatio(10_000_000, 10)).toBeGreaterThan(0);
  });
});

describe("pdfPageSize", () => {
  it("leaves a normal page alone", () => {
    expect(pdfPageSize(1600, 1000)).toEqual({ width: 1600, height: 1000 });
  });

  it("scales an oversized page down proportionally to the viewer limit", () => {
    const page = pdfPageSize(40_000, 10_000);
    expect(page.width * 0.75).toBeLessThanOrEqual(14_400);
    expect(page.width / page.height).toBeCloseTo(4, 1);
  });
});

describe("parseTranslate", () => {
  it("reads the offset of a positioned node", () => {
    expect(parseTranslate("translate(120px, 340.5px)")).toEqual({ x: 120, y: 340.5 });
    expect(parseTranslate("translate(-20px,-8px)")).toEqual({ x: -20, y: -8 });
  });

  it("returns the origin when there is no translation", () => {
    expect(parseTranslate("")).toEqual({ x: 0, y: 0 });
  });
});

describe("dataUrlToBytes", () => {
  it("decodes a base64 data URL", () => {
    const bytes = dataUrlToBytes("data:application/octet-stream;base64,AAECAw==");
    expect([...bytes]).toEqual([0, 1, 2, 3]);
  });
});
