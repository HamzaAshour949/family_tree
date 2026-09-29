import { describe, expect, it } from "vitest";
import { windowTitle } from "../title";

const state = (overrides = {}) => ({ dirty: false, name: "Nasser Family", ...overrides });

describe("windowTitle", () => {
  it("uses the project name until the project has a file", () => {
    expect(windowTitle("Family Tree Studio", state(), "linux")).toBe("Nasser Family - Family Tree Studio");
  });

  it("prefers the file name once there is one", () => {
    expect(windowTitle("Family Tree Studio", state({ filePath: "/home/me/nasser.ftree" }), "linux")).toBe("nasser.ftree - Family Tree Studio");
  });

  it("marks unsaved changes in the title everywhere except macOS", () => {
    expect(windowTitle("App", state({ dirty: true }), "win32")).toBe("• Nasser Family - App");
    expect(windowTitle("App", state({ dirty: true }), "linux")).toBe("• Nasser Family - App");
    expect(windowTitle("App", state({ dirty: true }), "darwin")).toBe("Nasser Family - App");
  });

  it("falls back to the app name alone", () => {
    expect(windowTitle("App", state({ name: "  " }), "linux")).toBe("App");
  });
});
