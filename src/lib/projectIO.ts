import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { FTREE_SCHEMA, type FamilyTreeProject } from "../types";

export function serializeProject(project: FamilyTreeProject): string {
  return JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2);
}

export function parseProject(value: string): FamilyTreeProject {
  const parsed = JSON.parse(value) as FamilyTreeProject;
  if (parsed.schema !== FTREE_SCHEMA || parsed.version !== 1 || !Array.isArray(parsed.people)) {
    throw new Error("This file is not a valid Family Tree Studio .ftree project.");
  }
  return {
    ...parsed,
    people: parsed.people.map((person) => ({ ...person, gender: person.gender === "female" ? "female" : "male" })),
    settings: {
      compactNodes: Boolean(parsed.settings?.compactNodes),
      showLinkCounts: parsed.settings?.showLinkCounts ?? true,
      showPhotos: parsed.settings?.showPhotos ?? true,
      sortByDates: parsed.settings?.sortByDates ?? true,
    },
  };
}

export async function openProjectFile(): Promise<FamilyTreeProject | null> {
  const selected = await open({ multiple: false, filters: [{ name: "Family Tree Project", extensions: ["ftree"] }] });
  if (typeof selected !== "string") return null;
  return parseProject(await readTextFile(selected));
}

export async function saveProjectFile(project: FamilyTreeProject): Promise<string | null> {
  const selected = await save({ defaultPath: `${safeFileName(project.name)}.ftree`, filters: [{ name: "Family Tree Project", extensions: ["ftree"] }] });
  if (!selected) return null;
  await writeTextFile(selected, serializeProject(project));
  return selected;
}

export function safeFileName(value: string): string {
  const cleaned = value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "family-tree";
}