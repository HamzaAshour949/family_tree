import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileGrants, isProjectPath, readProjectFile, safeSuggestedName, withExtension, writeFileAtomic } from "../projectFiles";

let directory: string;
const onWindows = process.platform === "win32";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ftree-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("creates a new file", async () => {
    const path = join(directory, "new.ftree");
    await writeFileAtomic(path, "hello");
    expect(await readFile(path, "utf8")).toBe("hello");
  });

  it("replaces an existing file and leaves no temporary files behind", async () => {
    const path = join(directory, "tree.ftree");
    await writeFile(path, "old");
    await writeFileAtomic(path, "new contents");

    expect(await readFile(path, "utf8")).toBe("new contents");
    expect(await readdir(directory)).toEqual(["tree.ftree"]);
  });

  it("writes binary data unchanged", async () => {
    const path = join(directory, "image.png");
    const bytes = Uint8Array.from([0, 255, 128, 7, 0, 1]);
    await writeFileAtomic(path, bytes);
    expect(new Uint8Array(await readFile(path))).toEqual(bytes);
  });

  it("keeps the previous version when the write cannot complete", async () => {
    // Renaming a file over a directory is refused, which stands in for any
    // failure between "temporary file written" and "target replaced".
    const target = join(directory, "occupied");
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "still here");

    await expect(writeFileAtomic(target, "data")).rejects.toThrow();
    expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("still here");
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("fails cleanly when the directory does not exist", async () => {
    await expect(writeFileAtomic(join(directory, "missing", "tree.ftree"), "x")).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });

  it.skipIf(onWindows)("preserves the permissions of the file it replaces", async () => {
    const path = join(directory, "private.ftree");
    await writeFile(path, "old");
    await chmod(path, 0o600);
    await writeFileAtomic(path, "new");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it.skipIf(onWindows)("writes through a symlink instead of replacing it", async () => {
    const real = join(directory, "real.ftree");
    const link = join(directory, "link.ftree");
    await writeFile(real, "old");
    await symlink(real, link);

    await writeFileAtomic(link, "updated");
    expect(await readFile(real, "utf8")).toBe("updated");
    expect((await stat(link)).isFile()).toBe(true);
    expect(await readFile(link, "utf8")).toBe("updated");
  });
});

describe("readProjectFile", () => {
  it("reads UTF-8 text, including non-Latin scripts", async () => {
    const path = join(directory, "arabic.ftree");
    await writeFile(path, "شجرة العائلة", "utf8");
    expect(await readProjectFile(path)).toBe("شجرة العائلة");
  });

  it("refuses a file larger than the limit", async () => {
    const path = join(directory, "big.ftree");
    await writeFile(path, "x".repeat(100));
    await expect(readProjectFile(path, 50)).rejects.toThrow(/too large/);
    expect(await readProjectFile(path, 100)).toHaveLength(100);
  });

  it("rejects a missing file", async () => {
    await expect(readProjectFile(join(directory, "nope.ftree"))).rejects.toThrow();
  });
});

describe("FileGrants", () => {
  it("only recognises paths that were granted", () => {
    const grants = new FileGrants();
    grants.grant(join(directory, "a.ftree"));
    expect(grants.has(join(directory, "a.ftree"))).toBe(true);
    expect(grants.has(join(directory, "b.ftree"))).toBe(false);
  });

  it("does not let a path traversal reach a file that was never granted", () => {
    const grants = new FileGrants();
    grants.grant(join(directory, "sub", "a.ftree"));
    expect(grants.has(join(directory, "sub", "..", "..", "etc", "passwd"))).toBe(false);
    // ...but an equivalent spelling of a granted path is the same path.
    expect(grants.has(join(directory, "sub", "..", "sub", "a.ftree"))).toBe(true);
  });
});

describe("path helpers", () => {
  it("appends the extension only when it is missing, ignoring case", () => {
    expect(withExtension("/tmp/tree", "ftree")).toBe("/tmp/tree.ftree");
    expect(withExtension("/tmp/tree.ftree", "ftree")).toBe("/tmp/tree.ftree");
    expect(withExtension("/tmp/tree.FTREE", "ftree")).toBe("/tmp/tree.FTREE");
    expect(withExtension("/tmp/tree.txt", "ftree")).toBe("/tmp/tree.txt.ftree");
  });

  it("recognises project files by extension", () => {
    expect(isProjectPath("/a/b.ftree")).toBe(true);
    expect(isProjectPath("/a/b.FTREE")).toBe(true);
    expect(isProjectPath("/a/b.txt")).toBe(false);
    expect(isProjectPath("/a/ftree")).toBe(false);
  });

  it("makes a suggested name safe to embed in a dialog path", () => {
    expect(safeSuggestedName("Nasser Family", "x")).toBe("Nasser Family");
    expect(safeSuggestedName("../../etc/passwd", "x")).toBe("etc-passwd");
    expect(safeSuggestedName("a/b\\c", "x")).toBe("a-b-c");
    expect(safeSuggestedName('bad<>:"|?*name', "x")).toBe("badname");
    expect(safeSuggestedName("   ", "fallback")).toBe("fallback");
    expect(safeSuggestedName("..", "fallback")).toBe("fallback");
    expect(safeSuggestedName("a".repeat(500), "x")).toHaveLength(120);
  });
});
