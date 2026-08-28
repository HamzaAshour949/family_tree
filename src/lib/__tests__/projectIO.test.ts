import { describe, expect, it } from "vitest";
import { normalizeSettings, parseProject, safeFileName, serializeProject } from "../projectIO";
import { person, project, relationship } from "./helpers";

const valid = project(
  [person("a", { firstName: "Nadia", gender: "female", tags: ["matriarch"] }), person("b")],
  [relationship("r1", "parent-child", "a", "b")],
);

describe("parseProject", () => {
  it("round-trips a project written by the app", () => {
    const parsed = parseProject(serializeProject(valid));
    expect(parsed.people).toHaveLength(2);
    expect(parsed.relationships).toHaveLength(1);
    expect(parsed.name).toBe("Test Tree");
    expect(parsed.people[0]?.tags).toEqual(["matriarch"]);
  });

  it("rejects anything that is not a .ftree document", () => {
    expect(() => parseProject("{ not json")).toThrow(/not valid JSON/);
    expect(() => parseProject("null")).toThrow(/not a valid Family Tree Studio/);
    expect(() => parseProject(JSON.stringify({ schema: "something-else", version: 1, people: [] }))).toThrow(/not a valid/);
    expect(() => parseProject(JSON.stringify({ ...valid, version: 99 }))).toThrow(/not a valid/);
    expect(() => parseProject(JSON.stringify({ ...valid, people: "nope" }))).toThrow(/not a valid/);
  });

  it("survives a file whose optional collections are missing", () => {
    const parsed = parseProject(JSON.stringify({ ...valid, relationships: undefined, settings: undefined }));
    expect(parsed.relationships).toEqual([]);
    expect(parsed.settings).toEqual({ compactNodes: false, showLinkCounts: true, showPhotos: true, sortByDates: true });
  });

  it("coerces person fields that were hand-edited to the wrong type", () => {
    const parsed = parseProject(
      JSON.stringify({ ...valid, people: [{ id: "a", firstName: 42, gender: "other", tags: "matriarch", notes: null }] }),
    );
    expect(parsed.people[0]).toMatchObject({ id: "a", firstName: "", gender: "male", tags: [], notes: "" });
  });

  it("drops relationships that point at people the file does not contain", () => {
    const parsed = parseProject(
      JSON.stringify({
        ...valid,
        relationships: [
          relationship("r1", "parent-child", "a", "b"),
          relationship("r2", "parent-child", "a", "ghost"),
          relationship("r3", "spouse", "a", "a"),
        ],
      }),
    );
    expect(parsed.relationships.map((item) => item.id)).toEqual(["r1"]);
  });

  it("keeps only the first record when ids repeat", () => {
    const parsed = parseProject(
      JSON.stringify({
        ...valid,
        people: [person("a", { firstName: "First" }), person("a", { firstName: "Second" })],
        relationships: [],
      }),
    );
    expect(parsed.people).toHaveLength(1);
    expect(parsed.people[0]?.firstName).toBe("First");
  });

  it("fills in identity and timestamps that a file omits", () => {
    const parsed = parseProject(JSON.stringify({ ...valid, id: undefined, name: "", createdAt: undefined, updatedAt: undefined }));
    expect(parsed.id).toMatch(/^project-/);
    expect(parsed.name).toBe("Untitled Family Tree");
    expect(Number.isNaN(Date.parse(parsed.createdAt))).toBe(false);
  });
});

describe("normalizeSettings", () => {
  it("defaults the display toggles on and compact off", () => {
    expect(normalizeSettings(undefined)).toEqual({ compactNodes: false, showLinkCounts: true, showPhotos: true, sortByDates: true });
    expect(normalizeSettings({ compactNodes: true, showPhotos: false })).toMatchObject({ compactNodes: true, showPhotos: false, showLinkCounts: true });
  });
});

describe("safeFileName", () => {
  it("produces a name that is safe on every platform", () => {
    expect(safeFileName("  Nasser / Family: 1948  ")).toBe("Nasser-Family-1948");
    expect(safeFileName("***")).toBe("family-tree");
    expect(safeFileName("")).toBe("family-tree");
    expect(safeFileName("a".repeat(200))).toHaveLength(80);
  });
});

describe("serializeProject", () => {
  it("stamps the save time without touching the rest of the document", () => {
    const written = JSON.parse(serializeProject(valid));
    expect(written.updatedAt).not.toBe(valid.updatedAt);
    expect(written.createdAt).toBe(valid.createdAt);
    expect(written.people).toHaveLength(2);
  });
});
