import { describe, expect, it } from "vitest";
import { dataUrlToBytes, exportPixelRatio, parseTranslate, pdfPageSize, prunedDeclarations, type PropertyTraits } from "../exporters";

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

describe("prunedDeclarations", () => {
  const map = (entries: Record<string, string>) => new Map(Object.entries(entries));
  const defaults = map({ color: "rgb(0, 0, 0)", display: "block", "margin-top": "0px" });

  it("drops what the element would get anyway, whether the property is inherited or not", () => {
    const own = map({ color: "rgb(0, 0, 0)", display: "block" });
    const parent = map({ color: "rgb(0, 0, 0)", display: "block" });
    expect([...prunedDeclarations(own, parent, defaults).keys()]).toEqual([]);
  });

  it("keeps a default value its parent does not share, in case the property is inherited", () => {
    // Without it, an inherited colour would take the parent's white.
    const kept = prunedDeclarations(map({ color: "rgb(0, 0, 0)" }), map({ color: "rgb(255, 255, 255)" }), defaults);
    expect(kept.get("color")).toBe("rgb(0, 0, 0)");
  });

  it("keeps a value shared with the parent that is not the default, in case the property is not inherited", () => {
    // Without it, a non-inherited property would fall back to its default.
    const kept = prunedDeclarations(map({ display: "flex" }), map({ display: "flex" }), defaults);
    expect(kept.get("display")).toBe("flex");
  });

  it("compares the outermost element with the defaults alone", () => {
    const kept = prunedDeclarations(map({ color: "rgb(0, 0, 0)", display: "grid" }), undefined, defaults);
    expect([...kept]).toEqual([["display", "grid"]]);
  });

  const traits: PropertyTraits = {
    inherited: new Set(["color", "font-family"]),
    notInherited: new Set(["display", "border-top-color"]),
    followsColor: new Set(["border-top-color"]),
  };

  it("drops an inherited value that matches the parent's, default or not", () => {
    const own = map({ "font-family": "Inter", color: "rgb(1, 1, 1)" });
    const kept = prunedDeclarations(own, map({ "font-family": "Inter", color: "rgb(9, 9, 9)" }), defaults, traits);
    expect([...kept]).toEqual([["color", "rgb(1, 1, 1)"]]);
  });

  it("drops a non-inherited default even when the parent differs", () => {
    const kept = prunedDeclarations(map({ display: "block" }), map({ display: "flex" }), defaults, traits);
    expect(kept.size).toBe(0);
  });

  it("treats a border colour that repeats the element's own colour as the default", () => {
    const own = map({ color: "rgb(5, 5, 5)", "border-top-color": "rgb(5, 5, 5)" });
    expect([...prunedDeclarations(own, map({ color: "rgb(5, 5, 5)" }), defaults, traits)]).toEqual([]);
    const different = map({ color: "rgb(5, 5, 5)", "border-top-color": "rgb(6, 6, 6)" });
    expect(prunedDeclarations(different, undefined, defaults, traits).get("border-top-color")).toBe("rgb(6, 6, 6)");
  });

  it("never drops a property the browser's stylesheet sets for that kind of element", () => {
    // A heading inheriting its parent's 16px would come back at the browser's 1.17em.
    const heading = map({ "font-size": "16px" });
    const plain = map({ "font-size": "16px" });
    const headingDefaults = map({ "font-size": "18.72px" });
    const kept = prunedDeclarations(heading, map({ "font-size": "16px" }), headingDefaults, { ...traits, inherited: new Set(["font-size"]) }, plain);
    expect(kept.get("font-size")).toBe("16px");
  });

  it("never drops an inherited property the browser overrides for that kind of element", () => {
    // A button's text colour comes from the system button colour, not its parent.
    const own = map({ color: "rgb(237, 243, 242)" });
    const kept = prunedDeclarations(own, map({ color: "rgb(237, 243, 242)" }), defaults, traits, defaults, new Set(["color"]));
    expect(kept.get("color")).toBe("rgb(237, 243, 242)");
  });

  it("never drops a size measured from layout", () => {
    const kept = prunedDeclarations(map({ width: "0px", "transform-origin": "0px 0px" }), undefined, map({ width: "0px", "transform-origin": "0px 0px" }));
    expect([...kept.keys()]).toEqual(["width", "transform-origin"]);
  });

  it("compares offsets and margins only when they are written values, not measurements", () => {
    const layoutDefaults = map({ "margin-top": "0px", top: "auto", left: "auto" });
    const kept = prunedDeclarations(map({ "margin-top": "0px", top: "auto", left: "12px" }), undefined, map({ ...Object.fromEntries(layoutDefaults), left: "12px" }));
    expect([...kept]).toEqual([["left", "12px"]]);
  });

  it("drops 'initial' on a property that does not inherit", () => {
    const own = map({ "text-decoration-line": "initial", "font-family": "initial" });
    const kept = prunedDeclarations(own, undefined, defaults, { ...traits, notInherited: new Set(["text-decoration-line"]) });
    expect([...kept.keys()]).toEqual(["font-family"]);
  });

  it("keeps a custom property where it is set and drops it where it is inherited", () => {
    // The app's own variables leak into any probe, so a probe never decides these.
    const leaky = map({ "--accent": "#3fb68b" });
    expect(prunedDeclarations(map({ "--accent": "#3fb68b" }), undefined, leaky).get("--accent")).toBe("#3fb68b");
    expect(prunedDeclarations(map({ "--accent": "#3fb68b" }), map({ "--accent": "#3fb68b" }), leaky).size).toBe(0);
    expect(prunedDeclarations(map({ "--accent": "#ffffff" }), map({ "--accent": "#3fb68b" }), leaky).get("--accent")).toBe("#ffffff");
  });

  it("keeps properties it has no default for", () => {
    expect(prunedDeclarations(map({ d: "path(\"M 0 0\")" }), undefined, defaults).has("d")).toBe(true);
  });
});
