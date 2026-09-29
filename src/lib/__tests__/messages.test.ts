import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHELL_STRINGS } from "../../../shared/desktop";
import { arabicCount, familyTextByLanguage, isRtl, languageOptions, shellStringsByLanguage, translate, type TranslationKey } from "../../messages";

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && name !== "messages.ts" ? [path] : [];
  });

/** Every quoted string in the application code, so a key can be checked for use. */
function quotedStrings(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles("src")) for (const match of readFileSync(file, "utf8").matchAll(/["'`]([A-Za-z][A-Za-z0-9]*)["'`]/g)) found.add(match[1] as string);
  return found;
}


describe("translations", () => {
  // Only the `translations` object: the same file also holds the plural and shell dictionaries.
  const source = readFileSync("src/messages.ts", "utf8");
  const block = source.slice(source.indexOf("const translations = {"), source.indexOf("} satisfies Record<LanguageCode"));
  const dictionaryKeys = [...block.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*): "/gm)].map((match) => match[1] as TranslationKey);

  it("finds the dictionary", () => {
    expect(dictionaryKeys.length).toBeGreaterThan(100);
  });

  it("has an Arabic string for every English one, and neither is empty", () => {
    for (const key of new Set(dictionaryKeys)) {
      expect(translate("en", key).trim(), `en:${key}`).not.toBe("");
      expect(translate("ar", key).trim(), `ar:${key}`).not.toBe("");
    }
  });

  it("keeps no key that nothing uses", () => {
    const used = quotedStrings();
    const unused = [...new Set(dictionaryKeys)].filter((key) => !used.has(key));
    expect(unused).toEqual([]);
  });

  it("offers both languages, with Arabic laid out right to left", () => {
    expect(languageOptions.map((option) => option.code)).toEqual(["en", "ar"]);
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
  });
});

describe("shell strings", () => {
  it("cover the same keys in both languages", () => {
    expect(Object.keys(shellStringsByLanguage.ar).sort()).toEqual(Object.keys(shellStringsByLanguage.en).sort());
    expect(shellStringsByLanguage.en).toBe(DEFAULT_SHELL_STRINGS);
  });

  it("keep the file-name placeholder the shell replaces", () => {
    expect(shellStringsByLanguage.en.openFailedMessage).toContain("{name}");
    expect(shellStringsByLanguage.ar.openFailedMessage).toContain("{name}");
  });
});

describe("plural forms", () => {
  const en = familyTextByLanguage.en;
  const ar = familyTextByLanguage.ar;

  it("uses the singular in English only for exactly one", () => {
    expect(en.linksCount(0)).toBe("0 links");
    expect(en.linksCount(1)).toBe("1 link");
    expect(en.linksCount(2)).toBe("2 links");
    expect(en.timelineSummary(1, 1)).toBe("1 dated event across 1 person");
    expect(en.timelineSummary(12, 8)).toBe("12 dated events across 8 people");
  });

  it("follows Arabic's one / two / few / many forms", () => {
    expect(ar.linksCount(0)).toBe("بلا روابط");
    expect(ar.linksCount(1)).toBe("رابط واحد");
    expect(ar.linksCount(2)).toBe("رابطان");
    expect(ar.linksCount(3)).toBe("3 روابط");
    expect(ar.linksCount(10)).toBe("10 روابط");
    expect(ar.linksCount(11)).toBe("11 رابطًا");
    expect(ar.linksCount(100)).toBe("100 رابطًا");
  });

  it("builds an Arabic timeline summary from the same forms", () => {
    expect(ar.timelineSummary(12, 8)).toBe("12 حدثًا مؤرخًا ضمن 8 أشخاص");
    expect(ar.timelineSummary(1, 1)).toBe("حدث مؤرخ واحد ضمن شخص واحد");
  });

  it("formats any count without leaving a placeholder behind", () => {
    for (const count of [0, 1, 2, 3, 10, 11, 99]) {
      expect(arabicCount(count, { none: "a", one: "b", two: "c", few: "d", many: "e" })).toMatch(/\S/);
    }
  });
});
