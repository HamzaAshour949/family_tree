import { desktop } from "./desktop";
import { parseProject, safeFileName, serializeProject } from "./projectFile";
import type { FamilyTreeProject } from "../types";

export interface ProjectFile {
  filePath: string;
  project: FamilyTreeProject;
}

export async function openProjectFile(): Promise<ProjectFile | null> {
  const opened = await desktop().openProject();
  return opened ? { filePath: opened.filePath, project: parseProject(opened.contents) } : null;
}

export async function saveProjectFile(project: FamilyTreeProject, filePath?: string): Promise<string | null> {
  return desktop().saveProject({ filePath, contents: serializeProject(project), suggestedName: safeFileName(project.name) });
}
