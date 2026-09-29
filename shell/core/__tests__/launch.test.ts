import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { projectPathFromArgv } from "../launch";

describe("projectPathFromArgv", () => {
  it("returns an absolute path unchanged", () => {
    const absolute = resolve("/home/me/tree.ftree");
    expect(projectPathFromArgv(["app", absolute], "/elsewhere")).toBe(absolute);
  });

  it("resolves a relative path against the directory the launch came from", () => {
    expect(projectPathFromArgv(["app", "tree.ftree"], "/home/me/docs")).toBe(resolve("/home/me/docs", "tree.ftree"));
    expect(projectPathFromArgv(["app", "../up.ftree"], "/home/me/docs")).toBe(resolve("/home/me", "up.ftree"));
  });

  it("skips runtime switches and the executable", () => {
    expect(projectPathFromArgv(["/usr/bin/app", "--no-sandbox", "--flag=x.ftree", resolve("/t/a.ftree")], "/")).toBe(resolve("/t/a.ftree"));
  });

  it("ignores arguments that are not project files", () => {
    expect(projectPathFromArgv(["app", "notes.txt", "."], "/")).toBeUndefined();
    expect(projectPathFromArgv(["app"], "/")).toBeUndefined();
    expect(projectPathFromArgv([], "/")).toBeUndefined();
  });

  it("matches the extension case-insensitively", () => {
    expect(projectPathFromArgv(["app", "TREE.FTREE"], "/d")).toBe(resolve("/d", "TREE.FTREE"));
  });
});
