import { create } from "zustand";
import { normalizeSettings } from "../lib/projectFile";
import { validateRelationship, type RelationshipRuleCode, type RelationshipValidationResult } from "../lib/relationshipRules";
import { translate } from "../messages";
import { FTREE_SCHEMA, type ActiveView, type FamilyTreeProject, type Gender, type LanguageCode, type Person, type Relationship, type ThemeMode } from "../types";

const LANGUAGE_KEY = "family-tree-studio.language";
const THEME_KEY = "family-tree-studio.theme";

/** How many edits can be undone. Snapshots share structure, so this is cheap. */
const HISTORY_LIMIT = 200;
/** Consecutive edits to the same field within this window count as one undo step. */
const COALESCE_WINDOW_MS = 1000;

export type AddRelationshipResult = RelationshipValidationResult;
export type RelativeKind = "father" | "mother" | "son" | "daughter" | "spouse";
export type AddRelativeResult = { ok: true; personId: string } | { ok: false; reason: RelationshipRuleCode };

/** Fields that can be edited freely. Gender is excluded: changing it can break links, see `changeGender`. */
export type PersonPatch = Partial<Omit<Person, "id" | "gender">>;

interface FamilyStore {
  activeView: ActiveView;
  /** Path the current project was opened from or last saved to. */
  filePath?: string;
  genderFilter: Gender | "all";
  /** True when the project differs from what is on disk. Undoing back to the saved state clears it. */
  isDirty: boolean;
  language: LanguageCode;
  project: FamilyTreeProject;
  /** The project object as last opened or saved; compared by reference to derive `isDirty`. */
  savedProject: FamilyTreeProject;
  searchQuery: string;
  selectedPersonId?: string;
  theme: ThemeMode;
  /** Set while a person has just been created, so the canvas reveals them and the inspector focuses their name. */
  newPersonId?: string;
  /** Changes whenever a different project is opened, so the canvas knows to fit it in view. */
  loadSerial: number;
  past: FamilyTreeProject[];
  future: FamilyTreeProject[];
  lastEdit?: { key: string; at: number };

  addPerson: (initial?: Partial<Person>) => string;
  addRelationship: (relationship: Omit<Relationship, "id">) => AddRelationshipResult;
  addRelative: (personId: string, kind: RelativeKind) => AddRelativeResult;
  changeGender: (personId: string, gender: Gender) => AddRelationshipResult;
  createProject: () => void;
  loadProject: (project: FamilyTreeProject, filePath?: string) => void;
  /** `saved` is the snapshot that was written; edits made while writing stay unsaved. */
  markSaved: (filePath: string, saved?: FamilyTreeProject) => void;
  redo: () => void;
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
  undo: () => void;
  updatePerson: (personId: string, patch: PersonPatch) => void;
  updateProjectMeta: (patch: Partial<Pick<FamilyTreeProject, "name" | "description">>) => void;
  updateRelationship: (relationshipId: string, patch: Partial<Pick<Relationship, "date" | "notes">>) => void;
}

const initialProject = createBlankProject();

export const useFamilyStore = create<FamilyStore>((set, get) => ({
  activeView: "tree",
  filePath: undefined,
  future: [],
  genderFilter: "all",
  isDirty: false,
  language: initialLanguage(),
  lastEdit: undefined,
  loadSerial: 0,
  newPersonId: undefined,
  past: [],
  project: initialProject,
  savedProject: initialProject,
  searchQuery: "",
  selectedPersonId: undefined,
  theme: initialTheme(),

  addPerson: (initial = {}) => {
    const id = makeId("person");
    set((state) => {
      const created = createPerson(id, { ...defaultNames(state.language), ...initial });
      return commit(state, { people: [...state.project.people, created] }, { selectedPersonId: id, newPersonId: id });
    });
    return id;
  },

  addRelationship: (relationship) => {
    const { project } = get();
    const normalized = normalizeRelationshipDirection(project, relationship);
    const result = validateRelationship(project, normalized);
    if (result.ok) {
      set((state) => commit(state, { relationships: [...state.project.relationships, { ...normalized, id: makeId("relationship") }] }));
    }
    return result;
  },

  /**
   * Creates a relative and links them in one step. The rules are checked
   * against the tree as it would look afterwards, so a refused link leaves
   * nothing behind - no orphan profile, no stray "unsaved" mark, no lost selection.
   */
  addRelative: (personId, kind) => {
    const { language, project } = get();
    const source = project.people.find((person) => person.id === personId);
    if (!source) return { ok: false, reason: "relationshipNotAllowedSelf" };

    const id = makeId("person");
    const created = createPerson(id, {
      ...defaultNames(language),
      gender: genderForRelative(kind, source.gender),
      ...inheritedName(kind, source),
    });
    const trial = { ...project, people: [...project.people, created] };
    const link = normalizeRelationshipDirection(trial, relationshipForRelative(kind, source.id, id, source.gender));
    const result = validateRelationship(trial, link);
    if (!result.ok) return result;

    set((state) =>
      commit(
        state,
        { people: [...state.project.people, created], relationships: [...state.project.relationships, { ...link, id: makeId("relationship") }] },
        { selectedPersonId: id, newPersonId: id },
      ),
    );
    return { ok: true, personId: id };
  },

  /**
   * Gender decides which parent slot a person fills and who they may marry, so
   * it can only change if every existing link would still be allowed.
   */
  changeGender: (personId, gender) => {
    const { project } = get();
    const target = project.people.find((person) => person.id === personId);
    if (!target || target.gender === gender) return { ok: true };

    const people = project.people.map((person) => (person.id === personId ? { ...person, gender } : person));
    const trial = { ...project, people };
    for (const relationship of project.relationships) {
      if (relationship.from !== personId && relationship.to !== personId) continue;
      const others = project.relationships.filter((other) => other.id !== relationship.id);
      const result = validateRelationship({ ...trial, relationships: others }, relationship);
      if (!result.ok) return result;
    }

    set((state) => commit(state, { people, relationships: state.project.relationships.map((link) => normalizeRelationshipDirection(trial, link)) }));
    return { ok: true };
  },

  createProject: () => {
    const project = createBlankProject();
    set((state) => ({ ...fresh(project, state.loadSerial), filePath: undefined, searchQuery: "", genderFilter: "all" }));
  },

  loadProject: (incoming, filePath) => {
    const project = normalizeProject(incoming);
    set((state) => ({ ...fresh(project, state.loadSerial), filePath, searchQuery: "", genderFilter: "all" }));
  },

  markSaved: (filePath, saved) =>
    set((state) => {
      const snapshot = saved ?? state.project;
      return { filePath, savedProject: snapshot, isDirty: state.project !== snapshot };
    }),

  redo: () =>
    set((state) => {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: rest,
        isDirty: next !== state.savedProject,
        lastEdit: undefined,
        selectedPersonId: stillPresent(next, state.selectedPersonId),
        newPersonId: undefined,
      };
    }),

  removePerson: (personId) =>
    set((state) =>
      commit(
        state,
        {
          people: state.project.people.filter((person) => person.id !== personId),
          relationships: state.project.relationships.filter((relationship) => relationship.from !== personId && relationship.to !== personId),
        },
        { selectedPersonId: state.selectedPersonId === personId ? undefined : state.selectedPersonId, newPersonId: undefined },
      ),
    ),

  removeRelationship: (relationshipId) =>
    set((state) => commit(state, { relationships: state.project.relationships.filter((relationship) => relationship.id !== relationshipId) })),

  selectPerson: (selectedPersonId) =>
    set((state) => ({ selectedPersonId, newPersonId: selectedPersonId === state.newPersonId ? state.newPersonId : undefined })),
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

  toggleCompactNodes: () => set((state) => commit(state, { settings: { ...state.project.settings, compactNodes: !state.project.settings.compactNodes } }, {}, "setting:compact")),
  toggleShowLinkCounts: () => set((state) => commit(state, { settings: { ...state.project.settings, showLinkCounts: !state.project.settings.showLinkCounts } }, {}, "setting:links")),
  toggleShowPhotos: () => set((state) => commit(state, { settings: { ...state.project.settings, showPhotos: !state.project.settings.showPhotos } }, {}, "setting:photos")),
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        isDirty: previous !== state.savedProject,
        lastEdit: undefined,
        selectedPersonId: stillPresent(previous, state.selectedPersonId),
        newPersonId: undefined,
      };
    }),

  updatePerson: (personId, patch) =>
    set((state) =>
      commit(
        state,
        { people: state.project.people.map((person) => (person.id === personId ? { ...person, ...patch } : person)) },
        {},
        `person:${personId}:${Object.keys(patch).sort().join(",")}`,
      ),
    ),

  updateProjectMeta: (patch) => set((state) => commit(state, patch, {}, `project:${Object.keys(patch).sort().join(",")}`)),

  updateRelationship: (relationshipId, patch) =>
    set((state) =>
      commit(
        state,
        { relationships: state.project.relationships.map((relationship) => (relationship.id === relationshipId ? { ...relationship, ...patch } : relationship)) },
        {},
        `relationship:${relationshipId}:${Object.keys(patch).sort().join(",")}`,
      ),
    ),
}));

/** State for a project that has just been created or opened: clean, with no history. */
function fresh(project: FamilyTreeProject, serial: number) {
  return {
    project,
    savedProject: project,
    isDirty: false,
    past: [],
    future: [],
    lastEdit: undefined,
    selectedPersonId: undefined,
    newPersonId: undefined,
    loadSerial: serial + 1,
  };
}

/**
 * Applies a project patch as one undo step and refreshes `updatedAt`. Passing a
 * `coalesceKey` folds repeated edits of the same thing - typing in one field -
 * into a single step instead of one per keystroke.
 */
function commit(
  state: Pick<FamilyStore, "project" | "past" | "savedProject" | "lastEdit">,
  patch: Partial<FamilyTreeProject>,
  extra: Partial<FamilyStore> = {},
  coalesceKey?: string,
) {
  const now = Date.now();
  const merge = coalesceKey !== undefined && state.lastEdit?.key === coalesceKey && now - state.lastEdit.at < COALESCE_WINDOW_MS;
  const project = { ...state.project, ...patch, updatedAt: new Date(now).toISOString() };
  return {
    project,
    past: merge ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT),
    future: [],
    isDirty: project !== state.savedProject,
    lastEdit: coalesceKey === undefined ? undefined : { key: coalesceKey, at: now },
    ...extra,
  };
}

function stillPresent(project: FamilyTreeProject, personId: string | undefined): string | undefined {
  return personId && project.people.some((person) => person.id === personId) ? personId : undefined;
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function defaultNames(language: LanguageCode): Pick<Person, "firstName" | "lastName"> {
  return { firstName: translate(language, "newPersonFirstName"), lastName: translate(language, "newPersonLastName") };
}

function createPerson(id: string, initial: Partial<Person>): Person {
  return {
    id,
    firstName: "",
    lastName: "",
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

function genderForRelative(kind: RelativeKind, sourceGender: Gender): Gender {
  if (kind === "spouse") return sourceGender === "male" ? "female" : "male";
  return kind === "mother" || kind === "daughter" ? "female" : "male";
}

function relationshipForRelative(kind: RelativeKind, sourceId: string, newId: string, sourceGender: Gender): Omit<Relationship, "id"> {
  if (kind === "father" || kind === "mother") return { type: "parent-child", from: newId, to: sourceId };
  if (kind === "son" || kind === "daughter") return { type: "parent-child", from: sourceId, to: newId };
  return sourceGender === "male" ? { type: "spouse", from: sourceId, to: newId } : { type: "spouse", from: newId, to: sourceId };
}

/**
 * Names are patrilineal in the traditions this app mainly serves, so a new
 * child of a man - and a new father of anyone - starts with the family name
 * already filled in.
 */
function inheritedName(kind: RelativeKind, source: Person): Partial<Pick<Person, "lastName">> {
  if (!source.lastName) return {};
  if (kind === "father") return { lastName: source.lastName };
  if ((kind === "son" || kind === "daughter") && source.gender === "male") return { lastName: source.lastName };
  return {};
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
  return globalThis.navigator?.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
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
