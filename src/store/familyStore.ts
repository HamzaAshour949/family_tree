import { create } from "zustand";
import { emptyLicense } from "../lib/license";
import { validateRelationship, type RelationshipValidationResult } from "../lib/relationshipRules";
import { FTREE_SCHEMA, type ActiveView, type FamilyTreeProject, type Gender, type LanguageCode, type LicenseState, type Person, type Relationship, type ThemeMode } from "../types";

const LANGUAGE_KEY = "family-tree-studio.language";
const THEME_KEY = "family-tree-studio.theme";

export type AddRelationshipResult = RelationshipValidationResult;

interface FamilyStore {
  activeView: ActiveView;
  genderFilter: Gender | "all";
  license: LicenseState;
  language: LanguageCode;
  project: FamilyTreeProject;
  searchQuery: string;
  selectedPersonId?: string;
  theme: ThemeMode;
  addPerson: (initial?: Partial<Person>) => string;
  addRelationship: (relationship: Omit<Relationship, "id">) => AddRelationshipResult;
  createProject: () => void;
  loadProject: (project: FamilyTreeProject) => void;
  removePerson: (personId: string) => void;
  removeRelationship: (relationshipId: string) => void;
  selectPerson: (personId?: string) => void;
  setActiveView: (view: ActiveView) => void;
  setGenderFilter: (gender: Gender | "all") => void;
  setLanguage: (language: LanguageCode) => void;
  setLicense: (license: LicenseState) => void;
  setSearchQuery: (query: string) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleCompactNodes: () => void;
  toggleShowLinkCounts: () => void;
  toggleShowPhotos: () => void;
  updatePerson: (personId: string, patch: Partial<Person>) => void;
  updateProjectMeta: (patch: Pick<FamilyTreeProject, "name" | "description">) => void;
}

export const useFamilyStore = create<FamilyStore>((set) => ({
  activeView: "tree",
  genderFilter: "all",
  license: emptyLicense,
  language: initialLanguage(),
  project: createBlankProject(),
  searchQuery: "",
  selectedPersonId: undefined,
  theme: initialTheme(),
  addPerson: (initial = {}) => {
    const id = makeId("person");
    set((state) => ({
      project: touchProject({
        ...state.project,
        people: [...state.project.people, createPerson(id, initial)],
      }),
      selectedPersonId: id,
    }));
    return id;
  },
  addRelationship: (relationship) => {
    let result: AddRelationshipResult = { ok: true };
    set((state) => {
      const normalizedRelationship = normalizeRelationshipDirection(state.project, relationship);
      result = validateRelationship(state.project, normalizedRelationship);
      if (!result.ok) return state;
      return { project: touchProject({ ...state.project, relationships: [...state.project.relationships, { ...normalizedRelationship, id: makeId("relationship") }] }) };
    });
    return result;
  },
  createProject: () => {
    set({ project: createBlankProject(), selectedPersonId: undefined, searchQuery: "" });
  },
  loadProject: (project) => set({ project: normalizeProject(project), selectedPersonId: undefined, searchQuery: "" }),
  removePerson: (personId) => {
    set((state) => ({
      project: touchProject({ ...state.project, people: state.project.people.filter((person) => person.id !== personId), relationships: state.project.relationships.filter((relationship) => relationship.from !== personId && relationship.to !== personId) }),
      selectedPersonId: state.selectedPersonId === personId ? undefined : state.selectedPersonId,
    }));
  },
  removeRelationship: (relationshipId) => set((state) => ({ project: touchProject({ ...state.project, relationships: state.project.relationships.filter((relationship) => relationship.id !== relationshipId) }) })),
  selectPerson: (personId) => set({ selectedPersonId: personId }),
  setActiveView: (activeView) => set({ activeView }),
  setGenderFilter: (genderFilter) => set({ genderFilter }),
  setLanguage: (language) => {
    persistPreference(LANGUAGE_KEY, language);
    set({ language });
  },
  setLicense: (license) => set({ license }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setTheme: (theme) => {
    persistPreference(THEME_KEY, theme);
    set({ theme });
  },
  toggleCompactNodes: () => set((state) => ({ project: touchProject({ ...state.project, settings: { ...state.project.settings, compactNodes: !state.project.settings.compactNodes } }) })),
  toggleShowLinkCounts: () => set((state) => ({ project: touchProject({ ...state.project, settings: { ...state.project.settings, showLinkCounts: !state.project.settings.showLinkCounts } }) })),
  toggleShowPhotos: () => set((state) => ({ project: touchProject({ ...state.project, settings: { ...state.project.settings, showPhotos: !state.project.settings.showPhotos } }) })),
  updatePerson: (personId, patch) => set((state) => ({ project: touchProject({ ...state.project, people: state.project.people.map((person) => (person.id === personId ? { ...person, ...patch } : person)) }) })),
  updateProjectMeta: (patch) => set((state) => ({ project: touchProject({ ...state.project, ...patch }) })),
}));

function touchProject(project: FamilyTreeProject): FamilyTreeProject {
  return { ...project, updatedAt: new Date().toISOString() };
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
    settings: normalizeProjectSettings(project.settings),
    relationships: project.relationships.map((relationship) => normalizeRelationshipDirection(project, relationship)),
  };
}

function normalizeProjectSettings(settings: Partial<FamilyTreeProject["settings"]> | undefined): FamilyTreeProject["settings"] {
  return {
    compactNodes: Boolean(settings?.compactNodes),
    showLinkCounts: settings?.showLinkCounts ?? true,
    showPhotos: settings?.showPhotos ?? true,
    sortByDates: settings?.sortByDates ?? true,
  };
}

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

function createBlankProject(): FamilyTreeProject {
  const now = new Date().toISOString();
  return { schema: FTREE_SCHEMA, version: 1, id: makeId("project"), name: "Untitled Family Tree", description: "", people: [], relationships: [], settings: { compactNodes: false, showLinkCounts: true, showPhotos: true, sortByDates: true }, createdAt: now, updatedAt: now };
}

function initialLanguage(): LanguageCode {
  const stored = readPreference(LANGUAGE_KEY);
  if (stored === "en" || stored === "ar") return stored;
  return navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function initialTheme(): ThemeMode {
  const stored = readPreference(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "dark";
}

function readPreference(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function persistPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage can be unavailable in hardened webview contexts.
  }
}