import { describe, expect, it } from "vitest";
import {
  ageLabel,
  filteredPeople,
  generationMap,
  lifeLabel,
  normalizeSearchText,
  peopleById,
  personName,
  relatedPeople,
  relationshipCountsById,
  relationshipLabel,
  timelineEvents,
  totalLinks,
  yearFromDate,
} from "../family";
import { person, project, relationship } from "./helpers";

describe("personName", () => {
  it("joins the parts and falls back when both are blank", () => {
    expect(personName(person("p", { firstName: "Amina", lastName: "Haddad" }))).toBe("Amina Haddad");
    expect(personName(person("p", { firstName: "", lastName: "" }))).toBe("Unnamed person");
  });
});

describe("yearFromDate", () => {
  it("reads the year and rejects unusable input", () => {
    expect(yearFromDate("1948-03-02")).toBe(1948);
    expect(yearFromDate(undefined)).toBeUndefined();
    expect(yearFromDate("")).toBeUndefined();
    expect(yearFromDate("not-a-date")).toBeUndefined();
  });
});

describe("lifeLabel", () => {
  it("describes whichever dates are known", () => {
    expect(lifeLabel(person("p", { birthDate: "1901-01-01", deathDate: "1980-01-01" }))).toBe("1901-1980");
    expect(lifeLabel(person("p", { birthDate: "1901-01-01" }))).toBe("b. 1901");
    expect(lifeLabel(person("p", { deathDate: "1980-01-01" }))).toBe("d. 1980");
    expect(lifeLabel(person("p"))).toBe("Dates unknown");
  });
});

describe("ageLabel", () => {
  it("counts whole years and accounts for the birthday not yet passed", () => {
    expect(ageLabel(person("p", { birthDate: "1900-06-15", deathDate: "1980-06-14" }))).toBe("79 years");
    expect(ageLabel(person("p", { birthDate: "1900-06-15", deathDate: "1980-06-15" }))).toBe("80 years");
  });

  it("refuses to report an impossible age", () => {
    expect(ageLabel(person("p", { birthDate: "1990-01-01", deathDate: "1980-01-01" }))).toBe("Age unknown");
    expect(ageLabel(person("p", { birthDate: "not-a-date" }))).toBe("Age unknown");
    expect(ageLabel(person("p"))).toBe("Age unknown");
  });
});

describe("relationshipCountsById", () => {
  it("counts parents, children and spouses in a single pass", () => {
    const people = [person("father"), person("mother", { gender: "female" }), person("child")];
    const relationships = [
      relationship("r1", "parent-child", "father", "child"),
      relationship("r2", "parent-child", "mother", "child"),
      relationship("r3", "spouse", "father", "mother"),
    ];
    const counts = relationshipCountsById(people, relationships);

    expect(counts.get("father")).toEqual({ parents: 0, spouses: 1, children: 1 });
    expect(counts.get("child")).toEqual({ parents: 2, spouses: 0, children: 0 });
    expect(totalLinks(counts.get("mother"))).toBe(2);
    expect(totalLinks(counts.get("missing"))).toBe(0);
  });

  it("ignores links pointing at people who are not in the tree", () => {
    const counts = relationshipCountsById([person("only")], [relationship("r1", "parent-child", "only", "ghost")]);
    expect(counts.get("only")).toEqual({ parents: 0, spouses: 0, children: 1 });
    expect(counts.has("ghost")).toBe(false);
  });
});

describe("filteredPeople", () => {
  const people = [
    person("a", { firstName: "Layla", lastName: "Nasser", gender: "female", occupation: "Teacher" }),
    person("b", { firstName: "Omar", lastName: "Nasser", tags: ["migrated"] }),
  ];

  it("matches across every searchable field, case-insensitively", () => {
    expect(filteredPeople(people, "teacher", "all").map((match) => match.id)).toEqual(["a"]);
    expect(filteredPeople(people, "MIGRATED", "all").map((match) => match.id)).toEqual(["b"]);
    expect(filteredPeople(people, "nasser", "all")).toHaveLength(2);
  });

  it("combines the search with the gender filter", () => {
    expect(filteredPeople(people, "nasser", "female").map((match) => match.id)).toEqual(["a"]);
    expect(filteredPeople(people, "   ", "all")).toHaveLength(2);
    expect(filteredPeople(people, "nobody", "all")).toHaveLength(0);
  });
});

describe("search normalization", () => {
  it("ignores Latin accents and case", () => {
    expect(normalizeSearchText("José Álvarez")).toBe("jose alvarez");
  });

  it("treats Arabic spelling variants as the same word", () => {
    // hamza forms of alef, tashkeel marks, taa marbuta vs haa, alef maqsura vs yaa
    expect(normalizeSearchText("أحمد")).toBe(normalizeSearchText("احمد"));
    expect(normalizeSearchText("مُحَمَّد")).toBe(normalizeSearchText("محمد"));
    expect(normalizeSearchText("فاطمة")).toBe(normalizeSearchText("فاطمه"));
    expect(normalizeSearchText("مصطفى")).toBe(normalizeSearchText("مصطفي"));
  });

  it("finds a person through a variant spelling", () => {
    const people = [person("a", { firstName: "أحمد", lastName: "الحداد" }), person("b", { firstName: "Omar" })];
    expect(filteredPeople(people, "احمد", "all").map((match) => match.id)).toEqual(["a"]);
    expect(filteredPeople(people, "OMAR", "all").map((match) => match.id)).toEqual(["b"]);
  });
});

describe("generationMap", () => {
  it("puts a child one row below its deepest parent", () => {
    const people = [person("grandfather"), person("father"), person("child")];
    const generations = generationMap(people, [
      relationship("r1", "parent-child", "grandfather", "father"),
      relationship("r2", "parent-child", "father", "child"),
    ]);
    expect([generations.get("grandfather"), generations.get("father"), generations.get("child")]).toEqual([0, 1, 2]);
  });

  it("pulls spouses onto a shared row", () => {
    const people = [person("root"), person("child"), person("partner", { gender: "female" })];
    const generations = generationMap(people, [
      relationship("r1", "parent-child", "root", "child"),
      relationship("r2", "spouse", "child", "partner"),
    ]);
    expect(generations.get("partner")).toBe(generations.get("child"));
  });
});

describe("relatedPeople", () => {
  it("splits the links into parents, spouses and children regardless of stored direction", () => {
    const people = [person("father"), person("subject"), person("wife", { gender: "female" }), person("child")];
    const relationships = [
      relationship("r1", "parent-child", "father", "subject"),
      relationship("r2", "parent-child", "subject", "child"),
      relationship("r3", "spouse", "wife", "subject"),
    ];
    const related = relatedPeople(peopleById(people), relationships, "subject");

    expect(related.parents.map((match) => match.id)).toEqual(["father"]);
    expect(related.children.map((match) => match.id)).toEqual(["child"]);
    expect(related.spouses.map((match) => match.id)).toEqual(["wife"]);
  });
});

describe("relationshipLabel", () => {
  it("names both ends and marks people the tree no longer contains", () => {
    const directory = peopleById([person("a", { firstName: "Ali", lastName: "" }), person("b", { firstName: "Sara", lastName: "" })]);
    expect(relationshipLabel(directory, relationship("r1", "parent-child", "a", "b"))).toBe("Ali → Sara");
    expect(relationshipLabel(directory, relationship("r2", "spouse", "a", "b"))).toBe("Ali + Sara");
    expect(relationshipLabel(directory, relationship("r3", "spouse", "a", "gone"))).toBe("Ali + Unknown");
  });
});

describe("timelineEvents", () => {
  it("collects births, deaths and dated marriages in chronological order", () => {
    const tree = project(
      [
        person("husband", { firstName: "Nabil", lastName: "", birthDate: "1920-01-01", deathDate: "1995-01-01" }),
        person("wife", { firstName: "Hala", lastName: "", gender: "female", birthDate: "1925-01-01" }),
      ],
      [relationship("r1", "spouse", "husband", "wife", { date: "1948-06-01" })],
    );

    expect(timelineEvents(tree).map((event) => [event.year, event.kind])).toEqual([
      [1920, "birth"],
      [1925, "birth"],
      [1948, "marriage"],
      [1995, "death"],
    ]);
  });

  it("orders events inside one year by month and day", () => {
    const tree = project([
      person("late", { firstName: "Late", lastName: "", birthDate: "1950-11-30" }),
      person("early", { firstName: "Early", lastName: "", birthDate: "1950-02-01" }),
      person("yearOnly", { firstName: "Zed", lastName: "", birthDate: "1950" }),
    ]);
    expect(timelineEvents(tree).map((event) => event.personId)).toEqual(["yearOnly", "early", "late"]);
  });

  it("skips people without dates and marriages without one", () => {
    const tree = project(
      [person("a"), person("b", { gender: "female" })],
      [relationship("r1", "spouse", "a", "b")],
    );
    expect(timelineEvents(tree)).toEqual([]);
  });
});
