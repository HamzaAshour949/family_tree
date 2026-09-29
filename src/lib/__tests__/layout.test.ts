import { describe, expect, it } from "vitest";
import { flowExtentFromNodes, layoutFamilyTree, layoutFamilyTreeCached, layoutSignature, metricsFor, monotonePlacement, type LayoutPoint } from "../layout";
import type { Person, Relationship } from "../../types";
import { person, relationship } from "./helpers";

const ids = (people: { id: string }[]) => new Set(people.map((item) => item.id));
const layout = (people: Person[], relationships: Relationship[] = [], compact = false) => layoutFamilyTree(people, relationships, ids(people), compact);
const male = (id: string, extra: Partial<Person> = {}) => person(id, { gender: "male", ...extra });
const female = (id: string, extra: Partial<Person> = {}) => person(id, { gender: "female", ...extra });

function at(positions: Map<string, LayoutPoint>, id: string): LayoutPoint {
  const point = positions.get(id);
  if (!point) throw new Error(`${id} was not placed`);
  return point;
}

/** Centre of a person's card. */
const centerX = (positions: Map<string, LayoutPoint>, id: string, compact = false) => at(positions, id).x + metricsFor(compact).nodeWidth / 2;

describe("layoutFamilyTree", () => {
  it("returns nothing when the filters hide everyone", () => {
    expect(layout([])).toEqual(new Map());
    expect(layoutFamilyTree([person("a")], [], new Set(), false)).toEqual(new Map());
  });

  it("places each generation on its own row, deeper generations lower", () => {
    const people = [male("grandfather"), male("father"), male("child")];
    const positions = layout(people, [
      relationship("r1", "parent-child", "grandfather", "father"),
      relationship("r2", "parent-child", "father", "child"),
    ]);

    expect(positions.size).toBe(3);
    expect(at(positions, "grandfather").y).toBeLessThan(at(positions, "father").y);
    expect(at(positions, "father").y).toBeLessThan(at(positions, "child").y);
  });

  it("keeps siblings on one row without overlapping", () => {
    const people = [male("parent"), male("first"), male("second")];
    const positions = layout(people, [
      relationship("r1", "parent-child", "parent", "first"),
      relationship("r2", "parent-child", "parent", "second"),
    ]);

    expect(at(positions, "first").y).toBe(at(positions, "second").y);
    expect(Math.abs(at(positions, "first").x - at(positions, "second").x)).toBeGreaterThanOrEqual(metricsFor(false).nodeWidth);
  });

  it("lays out only the visible subset", () => {
    const people = [male("shown"), male("hidden")];
    const positions = layoutFamilyTree(people, [], new Set(["shown"]), false);
    expect([...positions.keys()]).toEqual(["shown"]);
  });

  it("packs nodes more tightly in compact mode", () => {
    const people = [male("parent"), male("first"), male("second")];
    const relationships = [
      relationship("r1", "parent-child", "parent", "first"),
      relationship("r2", "parent-child", "parent", "second"),
    ];
    const spread = (compact: boolean) => {
      const positions = layout(people, relationships, compact);
      return Math.abs(at(positions, "first").x - at(positions, "second").x);
    };
    expect(spread(true)).toBeLessThan(spread(false));
  });

  it("separates unconnected families horizontally on the same row", () => {
    const positions = layout([male("familyA"), male("familyB")]);
    expect(at(positions, "familyA").y).toBe(at(positions, "familyB").y);
    expect(at(positions, "familyA").x).not.toBe(at(positions, "familyB").x);
  });

  it("orders spouses with the husband first and living wives before deceased ones", () => {
    const people = [
      male("husband"),
      female("lateWife", { deathDate: "1990-01-01", birthDate: "1930-01-01" }),
      female("wife", { birthDate: "1940-01-01" }),
    ];
    const positions = layout(people, [
      relationship("r1", "spouse", "husband", "lateWife"),
      relationship("r2", "spouse", "husband", "wife"),
    ]);

    expect(at(positions, "husband").x).toBeLessThan(at(positions, "wife").x);
    expect(at(positions, "wife").x).toBeLessThan(at(positions, "lateWife").x);
  });

  it("seats a couple side by side, closer than two unrelated people", () => {
    const metrics = metricsFor(false);
    const positions = layout([male("husband"), female("wife"), male("stranger")], [relationship("r1", "spouse", "husband", "wife")]);
    expect(at(positions, "wife").x - at(positions, "husband").x).toBe(metrics.nodeWidth + metrics.spouseGap);
  });
});

describe("family grouping", () => {
  it("keeps cousins under their own parents instead of interleaving them by birth year", () => {
    // Every child of A was born before the same-numbered child of B, so a
    // birth-year sort would give a1, b1, a2, b2 and cross every line.
    const people = [
      male("root"),
      male("brotherA", { birthDate: "1950-01-01" }),
      male("brotherB", { birthDate: "1952-01-01" }),
      male("a1", { birthDate: "1980-01-01" }),
      male("a2", { birthDate: "1984-01-01" }),
      male("b1", { birthDate: "1982-01-01" }),
      male("b2", { birthDate: "1986-01-01" }),
    ];
    const positions = layout(people, [
      relationship("r1", "parent-child", "root", "brotherA"),
      relationship("r2", "parent-child", "root", "brotherB"),
      relationship("r3", "parent-child", "brotherA", "a1"),
      relationship("r4", "parent-child", "brotherA", "a2"),
      relationship("r5", "parent-child", "brotherB", "b1"),
      relationship("r6", "parent-child", "brotherB", "b2"),
    ]);

    const order = ["a1", "a2", "b1", "b2"].map((id) => at(positions, id).x);
    expect(order).toEqual([...order].sort((first, second) => first - second));
  });

  it("orders siblings by birth date", () => {
    const people = [male("parent"), male("youngest", { birthDate: "1990-05-01" }), male("eldest", { birthDate: "1980-05-01" }), male("middle", { birthDate: "1985-05-01" })];
    const positions = layout(people, ["youngest", "eldest", "middle"].map((id, index) => relationship(`r${index}`, "parent-child", "parent", id)));
    const byX = ["eldest", "middle", "youngest"].map((id) => at(positions, id).x);
    expect(byX).toEqual([...byX].sort((first, second) => first - second));
  });

  it("centres parents over their children", () => {
    const people = [male("father"), female("mother"), male("c1", { birthDate: "1980-01-01" }), male("c2", { birthDate: "1982-01-01" }), male("c3", { birthDate: "1984-01-01" })];
    const positions = layout(people, [
      relationship("s", "spouse", "father", "mother"),
      ...["c1", "c2", "c3"].flatMap((child) => [
        relationship(`f-${child}`, "parent-child", "father", child),
        relationship(`m-${child}`, "parent-child", "mother", child),
      ]),
    ]);

    const couple = (centerX(positions, "father") + centerX(positions, "mother")) / 2;
    const children = (centerX(positions, "c1") + centerX(positions, "c3")) / 2;
    expect(couple).toBeCloseTo(children, 3);
  });

  it("puts a married-in spouse on their partner's row, beside them", () => {
    const people = [male("grandfather"), male("son"), female("daughterInLaw"), male("grandchild")];
    const positions = layout(people, [
      relationship("r1", "parent-child", "grandfather", "son"),
      relationship("r2", "spouse", "son", "daughterInLaw"),
      relationship("r3", "parent-child", "son", "grandchild"),
    ]);

    expect(at(positions, "daughterInLaw").y).toBe(at(positions, "son").y);
    expect(at(positions, "daughterInLaw").x).toBeGreaterThan(at(positions, "son").x);
    expect(at(positions, "grandchild").y).toBeGreaterThan(at(positions, "son").y);
  });

  it("does not lift a spouse who has parents of their own above them", () => {
    const people = [male("grandfather"), female("mother"), male("husband"), male("child")];
    const positions = layout(people, [
      relationship("r1", "parent-child", "grandfather", "mother"),
      relationship("r2", "spouse", "husband", "mother"),
      relationship("r3", "parent-child", "husband", "child"),
    ]);
    expect(at(positions, "mother").y).toBeGreaterThan(at(positions, "grandfather").y);
  });

  it("groups a man's children under each of his wives", () => {
    const people = [
      male("husband"),
      female("wife1", { birthDate: "1950-01-01" }),
      female("wife2", { birthDate: "1955-01-01" }),
      // Interleaved birth years: a plain birth sort would mix the two mothers' children.
      male("w1a", { birthDate: "1975-01-01" }),
      male("w2a", { birthDate: "1976-01-01" }),
      male("w1b", { birthDate: "1977-01-01" }),
      male("w2b", { birthDate: "1978-01-01" }),
    ];
    const positions = layout(people, [
      relationship("s1", "spouse", "husband", "wife1"),
      relationship("s2", "spouse", "husband", "wife2"),
      ...["w1a", "w1b"].flatMap((child) => [
        relationship(`h-${child}`, "parent-child", "husband", child),
        relationship(`m-${child}`, "parent-child", "wife1", child),
      ]),
      ...["w2a", "w2b"].flatMap((child) => [
        relationship(`h-${child}`, "parent-child", "husband", child),
        relationship(`m-${child}`, "parent-child", "wife2", child),
      ]),
    ]);

    const firstWife = Math.max(at(positions, "w1a").x, at(positions, "w1b").x);
    const secondWife = Math.min(at(positions, "w2a").x, at(positions, "w2b").x);
    expect(firstWife).toBeLessThan(secondWife);
  });

  it("keeps two families joined by a marriage close together", () => {
    const people = [male("rootA"), male("sonA"), male("rootB"), female("daughterB")];
    const positions = layout(people, [
      relationship("r1", "parent-child", "rootA", "sonA"),
      relationship("r2", "parent-child", "rootB", "daughterB"),
      relationship("r3", "spouse", "sonA", "daughterB"),
    ]);
    expect(positions.size).toBe(4);
    expect(at(positions, "sonA").y).toBe(at(positions, "daughterB").y);
    expect(Math.abs(at(positions, "sonA").x - at(positions, "daughterB").x)).toBe(metricsFor(false).nodeWidth + metricsFor(false).spouseGap);
  });
});

describe("marriage between families", () => {
  // A patriarch with a living wife (children c, d) and a deceased one (child a).
  // a marries m, whose parents - the Mansours, the older couple - are a separate family.
  const people = [
    male("khalil", { birthDate: "1930-01-01" }),
    female("maryam", { birthDate: "1940-01-01" }),
    female("zainab", { birthDate: "1934-01-01", deathDate: "1990-01-01" }),
    male("c", { birthDate: "1967-01-01" }),
    male("d", { birthDate: "1970-01-01" }),
    male("a", { birthDate: "1954-01-01" }),
    male("mansour", { birthDate: "1928-01-01" }),
    female("mansourWife", { birthDate: "1932-01-01" }),
    female("m", { birthDate: "1958-01-01" }),
    male("grandchild", { birthDate: "1982-01-01" }),
  ];
  const relationships = [
    relationship("s1", "spouse", "khalil", "maryam"),
    relationship("s2", "spouse", "khalil", "zainab"),
    relationship("s3", "spouse", "mansour", "mansourWife"),
    relationship("s4", "spouse", "a", "m"),
    ...["c", "d"].flatMap((child) => [relationship(`k-${child}`, "parent-child", "khalil", child), relationship(`m-${child}`, "parent-child", "maryam", child)]),
    relationship("k-a", "parent-child", "khalil", "a"),
    relationship("z-a", "parent-child", "zainab", "a"),
    relationship("m1", "parent-child", "mansour", "m"),
    relationship("m2", "parent-child", "mansourWife", "m"),
    relationship("g1", "parent-child", "a", "grandchild"),
    relationship("g2", "parent-child", "m", "grandchild"),
  ];

  it("keeps the son with his siblings rather than under his wife's parents", () => {
    // The Mansours are older, so walking their family first used to seat the
    // couple ahead of everyone, far from the patriarch's other children.
    const positions = layout(people, relationships);
    const order = ["c", "d", "a"].map((id) => at(positions, id).x);
    expect(order).toEqual([...order].sort((first, second) => first - second));
  });

  it("seats the wife's parents beside the family she married into, on the same row", () => {
    const positions = layout(people, relationships);
    expect(at(positions, "mansour").y).toBe(at(positions, "khalil").y);
    const gap = Math.abs(centerX(positions, "khalil") - centerX(positions, "mansour"));
    expect(gap).toBeLessThan(metricsFor(false).nodeWidth * 8);
  });

  it("keeps everyone on a row, in order, with the grandchild below both parents", () => {
    const positions = layout(people, relationships);
    assertNoOverlaps(positions, people, false);
    expect(at(positions, "grandchild").y).toBeGreaterThan(at(positions, "a").y);
    expect(at(positions, "m").y).toBe(at(positions, "a").y);
  });
});

describe("robustness", () => {
  it("still places everybody when the file contains an ancestry loop", () => {
    const people = [male("a"), male("b"), male("c")];
    const positions = layout(people, [
      relationship("r1", "parent-child", "a", "b"),
      relationship("r2", "parent-child", "b", "c"),
      relationship("r3", "parent-child", "c", "a"),
    ]);
    expect(positions.size).toBe(3);
    assertNoOverlaps(positions, people, false);
  });

  it("ignores relationships that point outside the visible set", () => {
    const people = [male("parent"), male("child")];
    const positions = layoutFamilyTree(people, [relationship("r1", "parent-child", "parent", "child")], new Set(["child"]), false);
    expect([...positions.keys()]).toEqual(["child"]);
  });

  it("is deterministic", () => {
    const { people, relationships } = randomFamily(7, 5);
    expect([...layout(people, relationships)]).toEqual([...layout(people, relationships)]);
  });

  it("places every person exactly once without overlap across many random families", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { people, relationships } = randomFamily(seed, 5);
      for (const compact of [false, true]) {
        const positions = layout(people, relationships, compact);
        expect(positions.size, `seed ${seed}`).toBe(people.length);
        assertNoOverlaps(positions, people, compact);
        for (const link of relationships) {
          if (link.type === "parent-child") expect(at(positions, link.to).y, `seed ${seed} ${link.id}`).toBeGreaterThan(at(positions, link.from).y);
        }
      }
    }
  });

  it("lays out a large tree quickly", () => {
    const { people, relationships } = randomFamily(99, 8, 5);
    expect(people.length).toBeGreaterThan(500);
    const started = performance.now();
    layout(people, relationships);
    expect(performance.now() - started).toBeLessThan(4000);
  });
});

describe("layoutFamilyTreeCached", () => {
  const people = [male("father", { birthDate: "1950-01-01" }), male("son", { birthDate: "1980-01-01" })];
  const links = [relationship("r1", "parent-child", "father", "son")];

  it("returns the very same result while nothing that affects positions changes", () => {
    const first = layoutFamilyTreeCached(people, links, ids(people), false);
    // Editing names, notes and photos creates new person objects but must not move anyone.
    const edited = people.map((item) => ({ ...item, firstName: "Renamed", notes: "typed a note", photoUrl: "https://example.com/x.png" }));
    expect(layoutFamilyTreeCached(edited, links, ids(edited), false)).toBe(first);
  });

  it("recomputes when the structure, the filters or the density change", () => {
    const first = layoutFamilyTreeCached(people, links, ids(people), false);
    expect(layoutFamilyTreeCached(people, links, ids(people), true)).not.toBe(first);
    expect(layoutFamilyTreeCached(people, [], ids(people), true).get("son")?.y).toBe(layoutFamilyTreeCached(people, [], ids(people), true).get("father")?.y);
    expect(layoutFamilyTreeCached(people, links, new Set(["son"]), true).size).toBe(1);
  });

  it("notices a change of birth date, because siblings are ordered by it", () => {
    const before = layoutSignature(people, links, ids(people), false);
    const redated = people.map((item) => (item.id === "son" ? { ...item, birthDate: "1975-06-01" } : item));
    expect(layoutSignature(redated, links, ids(redated), false)).not.toBe(before);
  });

  it("gives the same positions as the uncached function", () => {
    expect([...layoutFamilyTreeCached(people, links, ids(people), false)]).toEqual([...layoutFamilyTree(people, links, ids(people), false)]);
  });
});

describe("monotonePlacement", () => {
  it("keeps targets that are already ordered and far enough apart", () => {
    expect(monotonePlacement([0, 500, 1000], [1, 1, 1], [100, 100])).toEqual([0, 500, 1000]);
  });

  it("pushes neighbours apart to respect the separation", () => {
    const placed = monotonePlacement([0, 0, 0], [1, 1, 1], [100, 100]);
    expect(placed[1]! - placed[0]!).toBeCloseTo(100);
    expect(placed[2]! - placed[1]!).toBeCloseTo(100);
    // The block stays centred on the position everyone asked for.
    expect((placed[0]! + placed[2]!) / 2).toBeCloseTo(0);
  });

  it("never lets a heavier target be dragged as far as a light one", () => {
    const placed = monotonePlacement([0, 0], [10, 1], [100]);
    expect(placed[0]!).toBeGreaterThan(-20);
    expect(placed[1]! - placed[0]!).toBeCloseTo(100);
  });

  it("handles empty and single rows", () => {
    expect(monotonePlacement([], [], [])).toEqual([]);
    expect(monotonePlacement([42], [1], [])).toEqual([42]);
  });
});

describe("flowExtentFromNodes", () => {
  it("has no extent without nodes", () => {
    expect(flowExtentFromNodes([])).toBeUndefined();
  });

  it("pads the bounding box of the placed cards, including their size", () => {
    const metrics = metricsFor(false);
    const extent = flowExtentFromNodes([
      { id: "a", position: { x: 0, y: 0 }, data: {} },
      { id: "b", position: { x: 100, y: 200 }, data: {} },
    ]);
    expect(extent).toEqual([
      [-480, -480],
      [100 + metrics.nodeWidth + 480, 200 + metrics.nodeHeight + 480],
    ]);
  });
});

// ---------------------------------------------------------------------------

/** No two cards in the same row may overlap, with the minimum gap respected. */
function assertNoOverlaps(positions: Map<string, LayoutPoint>, people: Person[], compact: boolean): void {
  const metrics = metricsFor(compact);
  const rows = new Map<number, number[]>();
  for (const { id } of people) {
    const point = at(positions, id);
    rows.set(point.y, [...(rows.get(point.y) ?? []), point.x]);
  }
  for (const [row, xs] of rows) {
    const sorted = [...xs].sort((first, second) => first - second);
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = sorted[index]! - sorted[index - 1]! - metrics.nodeWidth;
      expect(gap, `row ${row} has overlapping cards`).toBeGreaterThanOrEqual(metrics.spouseGap - 1e-6);
    }
  }
}

/** Small deterministic generator so a failing seed can be replayed. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a plausible forest: couples with a few children per generation, some
 * children marrying people from outside the family, occasional second wives.
 */
function randomFamily(seed: number, generations: number, roots = 3): { people: Person[]; relationships: Relationship[] } {
  const random = mulberry32(seed);
  const people: Person[] = [];
  const relationships: Relationship[] = [];
  let counter = 0;
  const newPerson = (gender: "male" | "female", born: number) => {
    const created = person(`p${(counter += 1)}`, { gender, birthDate: random() < 0.15 ? "" : `${born}-0${1 + Math.floor(random() * 9)}-15` });
    people.push(created);
    return created;
  };
  const link = (type: Relationship["type"], from: string, to: string) => relationships.push(relationship(`r${relationships.length}`, type, from, to));

  let current: Person[] = [];
  for (let index = 0; index < roots; index += 1) current.push(newPerson(random() < 0.5 ? "male" : "female", 1900 + Math.floor(random() * 10)));

  for (let generation = 0; generation < generations; generation += 1) {
    const born = 1900 + (generation + 1) * 25;
    const next: Person[] = [];
    for (const member of current) {
      // Only men start couples here, so every couple has one mother per child.
      const spouse = newPerson(member.gender === "male" ? "female" : "male", born - 25 + Math.floor(random() * 5));
      const [husband, wife] = member.gender === "male" ? [member, spouse] : [spouse, member];
      link("spouse", husband.id, wife.id);
      const wives = [wife];
      if (random() < 0.1) {
        const second = newPerson("female", born - 25);
        link("spouse", husband.id, second.id);
        wives.push(second);
      }
      for (const mother of wives) {
        const childCount = Math.floor(random() * 4);
        for (let child = 0; child < childCount; child += 1) {
          const created = newPerson(random() < 0.5 ? "male" : "female", born + Math.floor(random() * 10));
          link("parent-child", husband.id, created.id);
          link("parent-child", mother.id, created.id);
          next.push(created);
        }
      }
    }
    current = next;
    if (current.length === 0) break;
  }
  return { people, relationships };
}
