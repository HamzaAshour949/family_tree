import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timelineEvents } from "../family";
import { parseProject } from "../projectFile";
import { validateRelationship } from "../relationshipRules";

/**
 * The bundled sample is the first thing anyone opens, so it is held to the
 * same rules the editor enforces while a tree is being built.
 */
describe("examples/sample-family.ftree", () => {
  const sample = parseProject(readFileSync("examples/sample-family.ftree", "utf8"));

  it("parses with every person and link intact", () => {
    expect(sample.people).toHaveLength(8);
    expect(sample.relationships).toHaveLength(11);
    expect(sample.name).toBe("Nasser Family");
  });

  it("contains no relationship the editor would have rejected", () => {
    const built = { ...sample, relationships: [] as typeof sample.relationships };
    for (const relationship of sample.relationships) {
      expect(validateRelationship(built, relationship), `rejected ${relationship.id}`).toEqual({ ok: true });
      built.relationships = [...built.relationships, relationship];
    }
  });

  it("produces a timeline in chronological order", () => {
    const years = timelineEvents(sample).map((event) => event.year);
    expect(years.length).toBeGreaterThan(5);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });
});
