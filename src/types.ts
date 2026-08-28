export const FTREE_SCHEMA = "family-tree-studio.ftree";

export type Gender = "female" | "male";
export type RelationshipKind = "parent-child" | "spouse";
export type ThemeMode = "dark" | "light";
export type LanguageCode = "en" | "ar";
export type ActiveView = "tree" | "timeline";

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  occupation?: string;
  photoUrl?: string;
  notes?: string;
  tags: string[];
}

export interface Relationship {
  id: string;
  type: RelationshipKind;
  from: string;
  to: string;
  date?: string;
  notes?: string;
}

export interface ProjectSettings {
  compactNodes: boolean;
  showLinkCounts: boolean;
  showPhotos: boolean;
  sortByDates: boolean;
}

export interface FamilyTreeProject {
  schema: typeof FTREE_SCHEMA;
  version: 1;
  id: string;
  name: string;
  description: string;
  people: Person[];
  relationships: Relationship[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  year: number;
  date?: string;
  title: string;
  personId?: string;
  kind: "birth" | "death" | "marriage";
  detail: string;
}