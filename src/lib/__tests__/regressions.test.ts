import { afterEach, describe, expect, it, vi } from "vitest";
import { ageLabel, generationMap, yearFromDate } from "../family";
import { parseProject } from "../projectFile";
import { person, project, relationship } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

describe("ageLabel is independent of the machine's time zone", () => {
  // `new Date("1990-06-15")` is UTC midnight. Read back with local getters in a
  // negative-offset zone it becomes the 14th, so the birthday arrived a day late.
  it("counts the birthday on the day itself for a living person", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 5, 15, 9, 0, 0)); // local June 15th, 09:00
    expect(ageLabel(person("p", { birthDate: "1990-06-15" }))).toBe("30 years old");
  });

  it("does not count the birthday the day before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 5, 14, 23, 30, 0)); // local June 14th, 23:30
    expect(ageLabel(person("p", { birthDate: "1990-06-15" }))).toBe("29 years old");
  });
});

describe("yearFromDate", () => {
  it("does not read a year out of a day-first date", () => {
    expect(yearFromDate("12-05-1990")).toBeUndefined();
  });

  it("accepts year-only and year-month values", () => {
    expect(yearFromDate("1948")).toBe(1948);
    expect(yearFromDate("1948-03")).toBe(1948);
  });
});

describe("generationMap", () => {
  it("keeps a married-in spouse below their own parents", () => {
    // `partner` has parents in the tree, so they cannot be lifted to the top row
    // just because their husband is a root.
    const people = [person("grandfather"), person("mother", { gender: "female" }), person("husband"), person("child")];
    const generations = generationMap(people, [
      relationship("r1", "parent-child", "grandfather", "mother"),
      relationship("r2", "spouse", "husband", "mother"),
      relationship("r3", "parent-child", "husband", "child"),
    ]);

    expect(generations.get("grandfather")).toBe(0);
    expect(generations.get("mother")).toBe(1);
    expect(generations.get("husband")).toBe(1);
    expect(generations.get("child")).toBe(2);
  });

  it("re-levels descendants when a spouse is moved down", () => {
    const people = [
      person("greatGrandfather"),
      person("grandfather"),
      person("father"),
      person("wife", { gender: "female" }),
      person("wifesSon"),
    ];
    const generations = generationMap(people, [
      relationship("r1", "parent-child", "greatGrandfather", "grandfather"),
      relationship("r2", "parent-child", "grandfather", "father"),
      relationship("r3", "spouse", "father", "wife"),
      relationship("r4", "parent-child", "wife", "wifesSon"),
    ]);

    expect(generations.get("father")).toBe(2);
    expect(generations.get("wife")).toBe(2);
    expect(generations.get("wifesSon")).toBe(3);
  });

  it("terminates on a hand-edited file that contains an ancestry loop", () => {
    const people = [person("a"), person("b")];
    const generations = generationMap(people, [
      relationship("r1", "parent-child", "a", "b"),
      relationship("r2", "parent-child", "b", "a"),
    ]);
    expect(generations.size).toBe(2);
  });
});

describe("parseProject", () => {
  it("opens a file saved with a UTF-8 byte order mark", () => {
    const text = `﻿${JSON.stringify(project([person("a")]))}`;
    expect(parseProject(text).people).toHaveLength(1);
  });

  it("explains that a newer file version needs a newer app", () => {
    const text = JSON.stringify({ ...project([]), version: 2 });
    expect(() => parseProject(text)).toThrow(/newer version/i);
  });

  it("drops a repeated relationship between the same two people", () => {
    const parsed = parseProject(
      JSON.stringify({
        ...project([person("a"), person("b", { gender: "female" })]),
        relationships: [
          relationship("r1", "spouse", "a", "b"),
          relationship("r2", "spouse", "b", "a"),
          relationship("r3", "parent-child", "a", "b"),
        ],
      }),
    );
    expect(parsed.relationships.map((item) => item.id)).toEqual(["r1", "r3"]);
  });
});
