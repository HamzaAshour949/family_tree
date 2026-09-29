import { randomBytes } from "node:crypto";
import { chmod, open, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { PROJECT_EXTENSION } from "../../shared/desktop";

/** A project is a few hundred kilobytes at most; anything this large is not one. */
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;

const RETRYABLE_RENAME_ERRORS = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 6;

/**
 * Paths the user has explicitly chosen - through a dialog, a double-click or
 * the command line. The renderer may ask to save "back to" a path, but only one
 * that appears here; a compromised page therefore cannot use the bridge to
 * overwrite arbitrary files.
 */
export class FileGrants {
  private readonly paths = new Set<string>();

  grant(path: string): string {
    const resolved = resolve(path);
    this.paths.add(resolved);
    return resolved;
  }

  has(path: string): boolean {
    return this.paths.has(resolve(path));
  }
}

export async function readProjectFile(path: string, maxBytes: number = MAX_PROJECT_BYTES): Promise<string> {
  const { size } = await stat(path);
  if (size > maxBytes) throw new Error("This file is too large to be a Family Tree Studio project.");
  return readFile(path, "utf8");
}

/**
 * Replaces `path` without ever leaving it half-written.
 *
 * The data goes to a temporary file in the same directory, is flushed to disk,
 * and only then renamed over the target. A crash, a full disk or a power cut
 * during the write leaves the previous version intact - a plain `writeFile`
 * would have truncated the user's only copy first.
 */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const target = await resolveTarget(path);
  const existing = await stat(target).catch(() => undefined);
  const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);

  try {
    const handle = await open(temporary, "w", existing ? existing.mode & 0o777 : 0o666);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (existing) await chmod(temporary, existing.mode & 0o777).catch(() => undefined);
    await renameWithRetry(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** Writing through a symlink should update what it points to, not replace the link. */
async function resolveTarget(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

/**
 * On Windows another process - an indexer, a cloud-sync client - may hold the
 * target open for a moment, which makes the rename fail transiently.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt >= RENAME_ATTEMPTS || !RETRYABLE_RENAME_ERRORS.has(code)) throw error;
      await new Promise((done) => setTimeout(done, 40 * attempt));
    }
  }
}

/** Save dialogs on some platforms do not append the extension the filter implies. */
export function withExtension(path: string, extension: string): string {
  return extname(path).toLowerCase() === `.${extension.toLowerCase()}` ? path : `${path}.${extension}`;
}

export function isProjectPath(path: string): boolean {
  return extname(path).toLowerCase() === `.${PROJECT_EXTENSION}`;
}

/** A suggested file name is used inside a dialog path, so it must not carry separators or control characters. */
export function safeSuggestedName(value: string, fallback: string): string {
  const cleaned = value
    .split(/[\\/]+/)
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("-")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]+/g, "")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : fallback;
}
