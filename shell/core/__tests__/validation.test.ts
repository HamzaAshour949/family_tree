import { describe, expect, it } from "vitest";
import { DEFAULT_SHELL_STRINGS, SHELL_STRING_KEYS } from "../../../shared/desktop";
import {
  InvalidRequestError,
  MAX_EXPORT_BYTES,
  parseConfirmRequest,
  parseDocumentState,
  parseExportRequest,
  parseSaveProjectRequest,
  parseShellStrings,
} from "../validation";

describe("parseSaveProjectRequest", () => {
  it("accepts a well-formed request, with or without a path", () => {
    expect(parseSaveProjectRequest({ contents: "{}", suggestedName: "tree" })).toEqual({ contents: "{}", suggestedName: "tree", filePath: undefined });
    expect(parseSaveProjectRequest({ contents: "{}", suggestedName: "tree", filePath: "/a/b.ftree" }).filePath).toBe("/a/b.ftree");
  });

  it("treats an empty path as no path", () => {
    expect(parseSaveProjectRequest({ contents: "{}", suggestedName: "tree", filePath: "" }).filePath).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "text"],
    ["missing contents", { suggestedName: "tree" }],
    ["non-text contents", { contents: 5, suggestedName: "tree" }],
    ["missing name", { contents: "{}" }],
    ["an empty name", { contents: "{}", suggestedName: "" }],
    ["a non-string path", { contents: "{}", suggestedName: "t", filePath: 4 }],
  ])("rejects %s", (_label, payload) => {
    expect(() => parseSaveProjectRequest(payload)).toThrow(InvalidRequestError);
  });
});

describe("parseExportRequest", () => {
  it("accepts text and byte data for each known format", () => {
    expect(parseExportRequest({ data: "<svg/>", format: "svg", suggestedName: "t" }).format).toBe("svg");
    expect(parseExportRequest({ data: new Uint8Array([1, 2]), format: "png", suggestedName: "t" }).format).toBe("png");
    expect(parseExportRequest({ data: new Uint8Array(1), format: "pdf", suggestedName: "t" }).format).toBe("pdf");
  });

  it("rejects an unknown format, so it cannot pick an arbitrary extension", () => {
    expect(() => parseExportRequest({ data: "x", format: "exe", suggestedName: "t" })).toThrow(/format/);
    expect(() => parseExportRequest({ data: "x", format: 1, suggestedName: "t" })).toThrow(InvalidRequestError);
  });

  it("rejects data that is neither text nor bytes", () => {
    expect(() => parseExportRequest({ data: { length: 3 }, format: "png", suggestedName: "t" })).toThrow(/text or bytes/);
    expect(() => parseExportRequest({ data: undefined, format: "png", suggestedName: "t" })).toThrow(InvalidRequestError);
  });

  it("rejects an export beyond the size ceiling", () => {
    expect(() => parseExportRequest({ data: { toString: () => "" }, format: "png", suggestedName: "t" })).toThrow(InvalidRequestError);
    const oversized = { data: new Uint8Array(8), format: "png", suggestedName: "t" };
    Object.defineProperty(oversized.data, "byteLength", { value: MAX_EXPORT_BYTES + 1 });
    expect(() => parseExportRequest(oversized)).toThrow(/too large/);
  });
});

describe("parseConfirmRequest", () => {
  it("requires all four labels", () => {
    const valid = { title: "T", message: "M", confirmLabel: "Yes", cancelLabel: "No" };
    expect(parseConfirmRequest(valid)).toEqual(valid);
    for (const key of Object.keys(valid)) expect(() => parseConfirmRequest({ ...valid, [key]: undefined })).toThrow(InvalidRequestError);
  });
});

describe("parseDocumentState", () => {
  it("normalises a partial or hostile payload instead of trusting it", () => {
    expect(parseDocumentState({ dirty: true, name: "Tree", filePath: "/a.ftree" })).toEqual({ dirty: true, name: "Tree", filePath: "/a.ftree" });
    expect(parseDocumentState({ dirty: "yes", name: 5, filePath: "" })).toEqual({ dirty: false, name: "", filePath: undefined });
    expect(parseDocumentState({ name: "x".repeat(5000) }).name).toHaveLength(1024);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => parseDocumentState(undefined)).toThrow(InvalidRequestError);
  });
});

describe("parseShellStrings", () => {
  it("takes known string keys and keeps the fallback for the rest", () => {
    const merged = parseShellStrings({ menuFile: "ملف", menuSave: 5, unknown: "x", menuEdit: "" }, DEFAULT_SHELL_STRINGS);
    expect(merged.menuFile).toBe("ملف");
    expect(merged.menuSave).toBe(DEFAULT_SHELL_STRINGS.menuSave);
    expect(merged.menuEdit).toBe(DEFAULT_SHELL_STRINGS.menuEdit);
    expect(Object.keys(merged).sort()).toEqual([...SHELL_STRING_KEYS].sort());
  });

  it("ignores anything that is not an object", () => {
    expect(parseShellStrings(null, DEFAULT_SHELL_STRINGS)).toBe(DEFAULT_SHELL_STRINGS);
    expect(parseShellStrings("nope", DEFAULT_SHELL_STRINGS)).toBe(DEFAULT_SHELL_STRINGS);
  });

  it("does not mutate the fallback", () => {
    const fallback = { ...DEFAULT_SHELL_STRINGS };
    parseShellStrings({ menuFile: "Other" }, fallback);
    expect(fallback).toEqual(DEFAULT_SHELL_STRINGS);
  });
});
