import { describe, expect, it } from "vitest";
import { DEFAULT_SHELL_STRINGS, type DesktopPlatform, type MenuAction } from "../../../shared/desktop";
import { shellStringsByLanguage } from "../../../src/messages";
import { buildMenuModel, type MenuItem } from "../menuModel";

const ALL_ACTIONS: MenuAction[] = [
  "new-project",
  "open-project",
  "save-project",
  "save-project-as",
  "export-pdf",
  "export-png",
  "export-svg",
  "undo",
  "redo",
  "add-person",
  "view-timeline",
  "view-tree",
  "toggle-theme",
];

function flatten(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => (item.kind === "submenu" ? [item, ...flatten(item.items)] : [item]));
}

const model = (platform: DesktopPlatform, devTools = false, strings = DEFAULT_SHELL_STRINGS) => buildMenuModel(strings, { platform, devTools, appName: "Family Tree Studio" });
const actions = (items: MenuItem[]) => flatten(items).flatMap((item) => (item.kind === "action" ? [item] : []));

describe("buildMenuModel", () => {
  it.each(["darwin", "win32", "linux"] as const)("exposes every menu action exactly once on %s", (platform) => {
    const found = actions(model(platform)).map((item) => item.action);
    expect([...found].sort()).toEqual([...ALL_ACTIONS].sort());
  });

  it("gives every shortcut to one command only", () => {
    const accelerators = actions(model("linux")).flatMap((item) => (item.accelerator ? [item.accelerator] : []));
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  it("uses the platform's conventional redo shortcut", () => {
    const redo = (platform: DesktopPlatform) => actions(model(platform)).find((item) => item.action === "redo")?.accelerator;
    expect(redo("darwin")).toBe("Shift+Cmd+Z");
    expect(redo("win32")).toBe("Ctrl+Y");
  });

  it("adds the application menu on macOS only", () => {
    const first = model("darwin")[0];
    expect(first).toMatchObject({ kind: "submenu", label: "Family Tree Studio" });
    const roles = first?.kind === "submenu" ? first.items.flatMap((item) => (item.kind === "role" ? [item.role] : [])) : [];
    expect(roles).toEqual(["about", "services", "hide", "hideOthers", "unhide", "quit"]);
    expect(model("linux")[0]).toMatchObject({ kind: "submenu", label: DEFAULT_SHELL_STRINGS.menuFile });
  });

  it("marks the Window menu so macOS can list open windows in it", () => {
    expect(model("darwin").at(-1)).toMatchObject({ kind: "submenu", role: "window", label: DEFAULT_SHELL_STRINGS.menuWindow });
  });

  it("translates the built-in commands too, with the app's name filled in", () => {
    const roleLabels = flatten(model("darwin", true, shellStringsByLanguage.ar)).flatMap((item) => (item.kind === "role" ? [item.label] : []));
    expect(roleLabels).toContain("قص");
    expect(roleLabels).toContain("إنهاء Family Tree Studio");
    // No built-in item falls back to an English default.
    const english = new Set(Object.values(DEFAULT_SHELL_STRINGS).map((label) => label.replaceAll("{name}", "Family Tree Studio")));
    expect(roleLabels.filter((label) => english.has(label))).toEqual([]);
  });

  it("ends the File menu with quit on Windows and Linux and close on macOS", () => {
    const fileRoles = (platform: DesktopPlatform) => {
      const file = model(platform).find((item) => item.kind === "submenu" && item.label === DEFAULT_SHELL_STRINGS.menuFile);
      return file?.kind === "submenu" ? file.items.flatMap((item) => (item.kind === "role" ? [item.role] : [])) : [];
    };
    expect(fileRoles("linux")).toEqual(["quit"]);
    expect(fileRoles("win32")).toEqual(["quit"]);
    expect(fileRoles("darwin")).toEqual(["close"]);
  });

  it("only includes developer tools when asked", () => {
    const hasTools = (devTools: boolean) => flatten(model("linux", devTools)).some((item) => item.kind === "role" && item.role === "toggleDevTools");
    expect(hasTools(false)).toBe(false);
    expect(hasTools(true)).toBe(true);
  });

  it("takes its labels from the strings it is given", () => {
    const labels = actions(model("linux", false, shellStringsByLanguage.ar)).map((item) => item.label);
    expect(labels).toContain(shellStringsByLanguage.ar.menuSave);
    expect(labels).not.toContain(DEFAULT_SHELL_STRINGS.menuSave);
  });

  it("has a non-empty Arabic string for every shell string", () => {
    for (const [key, value] of Object.entries(shellStringsByLanguage.ar)) expect(value.trim(), key).not.toBe("");
    expect(Object.keys(shellStringsByLanguage.ar).sort()).toEqual(Object.keys(DEFAULT_SHELL_STRINGS).sort());
  });
});
