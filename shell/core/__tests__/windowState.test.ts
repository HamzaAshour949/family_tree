import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOW_STATE, loadWindowState, MIN_WINDOW_SIZE, parseWindowState, saveWindowState } from "../windowState";

describe("parseWindowState", () => {
  it("reads a saved size and maximised flag", () => {
    expect(parseWindowState('{"width":1200,"height":800,"maximized":true}')).toEqual({ width: 1200, height: 800, maximized: true });
  });

  it("falls back to the default for missing or corrupt data", () => {
    expect(parseWindowState(undefined)).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState("{ not json")).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState("null")).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('"text"')).toEqual(DEFAULT_WINDOW_STATE);
  });

  it("clamps sizes that would make the window unusable or absurd", () => {
    const tiny = parseWindowState('{"width":10,"height":5}');
    expect(tiny.width).toBe(MIN_WINDOW_SIZE.width);
    expect(tiny.height).toBe(MIN_WINDOW_SIZE.height);
    expect(parseWindowState('{"width":99999999,"height":99999999}')).toMatchObject({ width: 10_000, height: 10_000 });
  });

  it("ignores values of the wrong type", () => {
    expect(parseWindowState('{"width":"wide","height":null,"maximized":"yes"}')).toEqual(DEFAULT_WINDOW_STATE);
  });
});

describe("saveWindowState / loadWindowState", () => {
  it("round-trips through a file, creating the directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "ftree-ws-"));
    try {
      const path = join(root, "nested", "window.json");
      saveWindowState(path, { width: 1300, height: 900, maximized: false });
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ width: 1300, height: 900, maximized: false });
      expect(loadWindowState(path)).toEqual({ width: 1300, height: 900, maximized: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the default when nothing has been saved", () => {
    expect(loadWindowState(join(tmpdir(), "definitely-not-here", "window.json"))).toEqual(DEFAULT_WINDOW_STATE);
  });

  it("never throws when the location cannot be written", async () => {
    const root = await mkdtemp(join(tmpdir(), "ftree-ws-"));
    try {
      // A directory cannot be created underneath a regular file.
      const blocker = join(root, "blocker");
      await writeFile(blocker, "x");
      expect(() => saveWindowState(join(blocker, "child", "window.json"), DEFAULT_WINDOW_STATE)).not.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
