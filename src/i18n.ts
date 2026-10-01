import { useCallback, useMemo } from "react";
import { familyTextByLanguage, isRtl, languageOptions, translate, type TranslationKey } from "./messages";
import { useFamilyStore } from "./store/familyStore";

export { isRtl, languageOptions, translate, type TranslationKey };

/**
 * For a field holding the user's own text: its direction follows what was
 * typed, so an English description in the Arabic interface keeps its full stop
 * at the end. An empty field keeps the interface's direction for the caret.
 */
export function contentDirection(value: string | undefined): "auto" | undefined {
  return value ? "auto" : undefined;
}

export function useI18n() {
  const language = useFamilyStore((state) => state.language);
  const setLanguage = useFamilyStore((state) => state.setLanguage);
  // `t` keeps its identity until the language changes. A fresh function per
  // render would invalidate every hook that lists it as a dependency and make
  // effects such as the menu subscription re-run on each render.
  const t = useCallback((key: TranslationKey) => translate(language, key), [language]);
  return useMemo(
    () => ({
      direction: isRtl(language) ? ("rtl" as const) : ("ltr" as const),
      familyText: familyTextByLanguage[language],
      language,
      languageOptions,
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );
}
