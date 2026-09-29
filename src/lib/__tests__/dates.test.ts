import { describe, expect, it } from "vitest";
import { dateSortKey, daysInMonth, parseDateParts, todayParts, yearsBetween } from "../dates";

describe("parseDateParts", () => {
  it("reads full dates, year-month and bare years", () => {
    expect(parseDateParts("1990-06-15")).toEqual({ year: 1990, month: 6, day: 15 });
    expect(parseDateParts("1990-06")).toEqual({ year: 1990, month: 6, day: undefined });
    expect(parseDateParts("1990")).toEqual({ year: 1990, month: undefined, day: undefined });
  });

  it("ignores a time suffix", () => {
    expect(parseDateParts("1990-06-15T23:59:00.000Z")).toEqual({ year: 1990, month: 6, day: 15 });
  });

  it("rejects values that are not calendar dates", () => {
    for (const bad of ["", undefined, "abc", "15-06-1990", "1990-13-01", "1990-00-10", "1990-02-30", "1990-06-00", "90-06-15"]) {
      expect(parseDateParts(bad), String(bad)).toBeUndefined();
    }
  });

  it("knows leap years", () => {
    expect(parseDateParts("2000-02-29")).toBeDefined();
    expect(parseDateParts("1900-02-29")).toBeUndefined();
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
  });
});

describe("yearsBetween", () => {
  it("counts whole years and holds back until the birthday", () => {
    expect(yearsBetween({ year: 1990, month: 6, day: 15 }, { year: 2020, month: 6, day: 15 })).toBe(30);
    expect(yearsBetween({ year: 1990, month: 6, day: 15 }, { year: 2020, month: 6, day: 14 })).toBe(29);
    expect(yearsBetween({ year: 1990, month: 6, day: 15 }, { year: 2020, month: 5, day: 30 })).toBe(29);
  });

  it("does not guess a birthday from a year-only date", () => {
    expect(yearsBetween({ year: 1990 }, { year: 2020, month: 1, day: 1 })).toBe(30);
    expect(yearsBetween({ year: 1990, month: 6 }, { year: 2020, month: 6, day: 1 })).toBe(30);
  });

  it("returns nothing when the end precedes the start", () => {
    expect(yearsBetween({ year: 2000, month: 1, day: 1 }, { year: 1999, month: 12, day: 31 })).toBeUndefined();
    expect(yearsBetween({ year: 2000, month: 6, day: 10 }, { year: 2000, month: 6, day: 1 })).toBeUndefined();
  });
});

describe("todayParts and dateSortKey", () => {
  it("reads the local calendar day", () => {
    expect(todayParts(new Date(2021, 11, 31, 23, 59))).toEqual({ year: 2021, month: 12, day: 31 });
  });

  it("orders by year, then month, then day", () => {
    const keys = [
      dateSortKey({ year: 1990, month: 6, day: 15 }),
      dateSortKey({ year: 1990, month: 6 }),
      dateSortKey({ year: 1990 }),
      dateSortKey({ year: 1989, month: 12, day: 31 }),
    ];
    expect([...keys].sort((a, b) => a - b)).toEqual([keys[3], keys[2], keys[1], keys[0]]);
  });
});
