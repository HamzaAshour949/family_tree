import { create } from "zustand";
import { normalizeSettings } from "../lib/projectIO";
import { validateRelationship, type RelationshipValidationResult } from "../lib/relationshipRules";
import { FTREE_SCHEMA, type ActiveView, type FamilyTreeProject, type Gender, type LanguageCode, type Person, type Relationship, type ThemeMode } from "../types";

const LANGUAGE_KEY = "family-tree-studio.language";
const THEME_KEY = "family-tree-studio.theme";

export type AddRelationshipResult = RelationshipValidationResult;

interface FamilyStore {
  activeView: ActiveView;
  /** Path the current project was opened from or last saved to. */
  filePath?: string;
  genderFilter: Gender | "all";
  /** True when the project has edits that are not on disk. */
  isDirty: boolean;
  language: LanguageCode;
  project: FamilyTreeProject;
  searchQuery: string;
  selectedPersonId?: string;
  theme: ThemeMode;
  addPerson: (initial?: Partial<Person>) => string;
  addRelationship: (relationship: Omit<Relationship, "id">) => AddRelationshipResult;
  createProject: () => void;
  loadProject: (project: FamilyTreeProject, filePath?: string) => void;
  markSaved: (filePath: string) => void;
  removePerson: (personId: string) => void;
  removeRelationship: (relationshipId: string) => void;
  selectPerson: (personId?: string) => void;
  setActiveView: (view: ActiveView) => void;
  setGenderFilter: (gender: Gender | "all") => void;
  setLanguage: (language: LanguageCode) => void;
  setSearchQuery: (query: string) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleCompactNodes: () => void;
  toggleShowLinkCounts: () => void;
  toggleShowPhotos: () => void;
  toggleTheme: () => void;
  updatePerson: (personId: string, patch: Partial<Person>) => void;
  updateProjectMeta: (patch: Partial<Pick<FamilyTreeProject, "name" | "description">>) => void;
}

export const useFamilyStore = create<FamilyStore>((set, get) => ({
  activeView: "tree",
  filePath: undefined,
  genderFilter: "all",
  isDirty: false,
  language: initialLanguage(),
  project: createBlankProject(),
  searchQuery: "",
  selectedPersonId: undefined,
  theme: initialTheme(),

  addPerson: (initial = {}) => {
    const id = makeId("person");
    set((state) => edit(state, { people: [...state.project.people, createPerson(id, initial)] }, { selectedPersonId: id }));
    return id;
  },

  addRelationship: (relationship) => {
    const { project } = get();
    const normalized = normalizeRelationshipDirection(project, relationship);
    const result = validateRelationship(project, normalized);
    if (result.ok) {
      set((state) => edit(state, { relationships: [...state.project.relationships, { ...normalized, id: makeId("relationship") }] }));
    }
    return result;
  },

  createProject: () => set({ project: createBlankProject(), filePath: undefined, isDirty: false, selectedPersonId: undefined, searchQuery: "" }),

  loadProject: (project, filePath) =>
    set({ project: normalizeProject(project), filePath, isDirty: false, selectedPersonId: undefined, searchQuery: "" }),

  markSaved: (filePath) => set({ filePath, isDirty: false }),

  removePerson: (personId) =>
    set((state) =>
      edit(
        state,
        {
          people: state.project.people.filter((person) => person.id !== personId),
          relationships: state.project.relationships.filter((relationship) => relationship.from !== personId && relationship.to !== personId),
        },
        { selectedPersonId: state.selectedPersonId === personId ? undefined : state.selectedPersonId },
      ),
    ),

  removeRelationship: (relationshipId) =>
    set((state) => edit(state, { relationships: state.project.relationships.filter((relationship) => relationship.id !== relationshipId) })),

  selectPerson: (selectedPersonId) => set({ selectedPersonId }),
  setActiveView: (activeView) => set({ activeView }),
  setGenderFilter: (genderFilter) => set({ genderFilter }),

  setLanguage: (language) => {
    persistPreference(LANGUAGE_KEY, language);
    set({ language });
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setTheme: (theme) => {
    persistPreference(THEME_KEY, theme);
    set({ theme });
  },

  toggleCompactNodes: () => set((state) => edit(state, { settings: { ...state.project.settings, compactNodes: !state.project.settings.compactNodes } })),
  toggleShowLinkCounts: () => set((state) => edit(state, { settings: { ...state.project.settings, showLinkCounts: !state.project.settings.showLinkCounts } })),
  toggleShowPhotos: () => set((state) => edit(state, { settings: { ...state.project.settings, showPhotos: !state.project.settings.showPhotos } })),
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  updatePerson: (personId, patch) =>
    set((state) => edit(state, { people: state.project.people.map((person) => (person.id === personId ? { ...person, ...patch } : person)) })),

  updateProjectMeta: (patch) => set((state) => edit(state, patch)),
}));

/** Applies a project patch, refreshes `updatedAt` and flags unsaved changes. */
function edit(state: { project: FamilyTreeProject }, patch: Partial<FamilyTreeProject>, extra: Partial<FamilyStore> = {}) {
  return { project: { ...state.project, ...patch, updatedAt: new Date().toISOString() }, isDirty: true, ...extra };
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createPerson(id: string, initial: Partial<Person>): Person {
  return {
    id,
    firstName: "New",
    lastName: "Person",
    gender: "male",
    birthDate: "",
    deathDate: "",
    birthPlace: "",
    deathPlace: "",
    occupation: "",
    photoUrl: "",
    notes: "",
    tags: [],
    ...initial,
  };
}

function normalizeProject(project: FamilyTreeProject): FamilyTreeProject {
  return {
    ...project,
    settings: normalizeSettings(project.settings),
    relationships: project.relationships.map((relationship) => normalizeRelationshipDirection(project, relationship)),
  };
}

/** Spouse links are stored male-first so downstream rules can assume it. */
function normalizeRelationshipDirection(project: FamilyTreeProject, relationship: Relationship): Relationship;
function normalizeRelationshipDirection(project: FamilyTreeProject, relationship: Omit<Relationship, "id">): Omit<Relationship, "id">;
function normalizeRelationshipDirection(project: FamilyTreeProject, relationship: Relationship | Omit<Relationship, "id">): Relationship | Omit<Relationship, "id"> {
  if (relationship.type !== "spouse") return relationship;
  const from = project.people.find((person) => person.id === relationship.from);
  const to = project.people.find((person) => person.id === relationship.to);
  if (from?.gender === "female" && to?.gender === "male") {
    return { ...relationship, from: relationship.to, to: relationship.from };
  }
  return relationship;
}

export function createBlankProject(): FamilyTreeProject {
  const now = new Date().toISOString();
  return {
    schema: FTREE_SCHEMA,
    version: 1,
    id: makeId("project"),
    name: "Untitled Family Tree",
    description: "",
    people: [],
    relationships: [],
    settings: { compactNodes: false, showLinkCounts: true, showPhotos: true, sortByDates: true },
    createdAt: now,
    updatedAt: now,
  };
}

function initialLanguage(): LanguageCode {
  const stored = readPreference(LANGUAGE_KEY);
  if (stored === "en" || stored === "ar") return stored;
  return navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function initialTheme(): ThemeMode {
  const stored = readPreference(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return globalThis.window?.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readPreference(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function persistPreference(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage can be unavailable in hardened renderer contexts; preferences
    // simply fall back to the defaults on the next launch.
  }
}
