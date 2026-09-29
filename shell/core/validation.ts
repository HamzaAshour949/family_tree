import {
  EXPORT_FORMATS,
  SHELL_STRING_KEYS,
  type ConfirmRequest,
  type DocumentState,
  type ExportFileRequest,
  type ExportFormat,
  type SaveProjectRequest,
  type ShellStrings,
} from "../../shared/desktop";

/** A generous ceiling for an exported image or PDF, well above a real family tree. */
export const MAX_EXPORT_BYTES = 256 * 1024 * 1024;
const MAX_TEXT_LENGTH = 1024;
const MAX_PROJECT_CONTENT_CHARS = 128 * 1024 * 1024;

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

/**
 * Everything arriving over the bridge is untrusted: the renderer is a web page.
 * Each handler parses its payload here instead of casting it, so a malformed
 * call is rejected with a clear error rather than reaching the file system.
 */
export function parseSaveProjectRequest(value: unknown): SaveProjectRequest {
  const record = asRecord(value);
  const contents = record.contents;
  if (typeof contents !== "string" || contents.length > MAX_PROJECT_CONTENT_CHARS) throw new InvalidRequestError("Project contents must be text.");
  return {
    contents,
    suggestedName: shortText(record.suggestedName, "suggestedName"),
    filePath: record.filePath === undefined || record.filePath === "" ? undefined : shortText(record.filePath, "filePath"),
  };
}

export function parseExportRequest(value: unknown): ExportFileRequest {
  const record = asRecord(value);
  const format = record.format;
  if (typeof format !== "string" || !EXPORT_FORMATS.includes(format as ExportFormat)) throw new InvalidRequestError("Unknown export format.");

  const data = record.data;
  const size = typeof data === "string" ? data.length : data instanceof Uint8Array ? data.byteLength : -1;
  if (size < 0) throw new InvalidRequestError("Export data must be text or bytes.");
  if (size > MAX_EXPORT_BYTES) throw new InvalidRequestError("The export is too large to save.");
  return { data: data as string | Uint8Array, format: format as ExportFormat, suggestedName: shortText(record.suggestedName, "suggestedName") };
}

export function parseConfirmRequest(value: unknown): ConfirmRequest {
  const record = asRecord(value);
  return {
    title: shortText(record.title, "title"),
    message: shortText(record.message, "message"),
    confirmLabel: shortText(record.confirmLabel, "confirmLabel"),
    cancelLabel: shortText(record.cancelLabel, "cancelLabel"),
  };
}

export function parseDocumentState(value: unknown): DocumentState {
  const record = asRecord(value);
  return {
    dirty: record.dirty === true,
    name: typeof record.name === "string" ? record.name.slice(0, MAX_TEXT_LENGTH) : "",
    filePath: typeof record.filePath === "string" && record.filePath.length > 0 ? record.filePath.slice(0, 4096) : undefined,
  };
}

/** Accepts only known keys with string values; anything else keeps its fallback. */
export function parseShellStrings(value: unknown, fallback: ShellStrings): ShellStrings {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Record<string, unknown>;
  const merged = { ...fallback };
  for (const key of SHELL_STRING_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0 && candidate.length <= MAX_TEXT_LENGTH) merged[key] = candidate;
  }
  return merged;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidRequestError("Malformed request.");
  return value as Record<string, unknown>;
}

function shortText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT_LENGTH) throw new InvalidRequestError(`${name} must be a short, non-empty string.`);
  return value;
}
