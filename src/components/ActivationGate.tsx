import { useEffect, useRef, useState } from "react";
import { KeyRound, Moon, Sun, UsersRound } from "lucide-react";
import { useI18n } from "../i18n";
import { installFullVersionUpdate } from "../lib/fullUpdate";
import { activateLicense, verifyLicense } from "../lib/license";
import { useFamilyStore } from "../store/familyStore";
import type { LanguageCode } from "../types";

interface ActivationGateProps {
  downloadAfterActivation?: boolean;
  onStatus: (message: string) => void;
}

export function ActivationGate({ downloadAfterActivation = false, onStatus }: ActivationGateProps) {
  const { language, languageOptions, setLanguage, t } = useI18n();
  const license = useFamilyStore((state) => state.license);
  const setLicense = useFamilyStore((state) => state.setLicense);
  const setTheme = useFamilyStore((state) => state.setTheme);
  const theme = useFamilyStore((state) => state.theme);
  const [customerEmail, setCustomerEmail] = useState(license.customerEmail ?? "");
  const [serialKey, setSerialKey] = useState(license.serialKey ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleActivation() {
    setBusy(true);
    setMessage("");
    try {
      const activated = await activateLicense(serialKey, customerEmail);
      setLicense(activated);
      const nextMessage = downloadAfterActivation ? t("installingFullVersion") : t("licenseActivated");
      setMessage(nextMessage);
      onStatus(nextMessage);
      if (downloadAfterActivation) await installFullVersionUpdate(activated, fullUpdateMessages(t), onStatus);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("activationFailed");
      setMessage(errorMessage);
      onStatus(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="activation-shell">
      <section className="activation-card">
        <div className="activation-card-head">
          <div className="brand-mark"><UsersRound size={22} /></div>
          <div>
            <h1>{t("activationRequiredTitle")}</h1>
            <p>{t("activationRequiredBody")}</p>
          </div>
        </div>
        <div className="activation-toolbar">
          <select className="language-select" aria-label={t("language")} onChange={(event) => setLanguage(event.currentTarget.value as LanguageCode)} value={language}>
            {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeLabel}</option>)}
          </select>
          <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={t("toggleTheme")} type="button">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <div className="field-stack">
          <label className="field-label">{t("customerEmail")}<input onChange={(event) => setCustomerEmail(event.currentTarget.value)} value={customerEmail} /></label>
          <label className="field-label">{t("serialKey")}<input onChange={(event) => setSerialKey(event.currentTarget.value)} value={serialKey} /></label>
          <button className="text-button primary-button activation-button" disabled={busy || serialKey.trim() === ""} onClick={() => void handleActivation()} type="button"><KeyRound size={16} />{t("activate")}</button>
          {message ? <p className="form-note">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}

interface FullVersionGateProps {
  onStatus: (message: string) => void;
}

export function FullVersionGate({ onStatus }: FullVersionGateProps) {
  const { language, languageOptions, setLanguage, t } = useI18n();
  const license = useFamilyStore((state) => state.license);
  const setLicense = useFamilyStore((state) => state.setLicense);
  const setTheme = useFamilyStore((state) => state.setTheme);
  const theme = useFamilyStore((state) => state.theme);
  const refreshed = useRef(false);

  useEffect(() => {
    if (refreshed.current || !license.serialKey) return;
    refreshed.current = true;
    verifyLicense(license).then(setLicense).catch(() => undefined);
  }, [license, setLicense]);

  async function handleInstall() {
    try {
      await installFullVersionUpdate(license, fullUpdateMessages(t), onStatus);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : t("fullVersionInstallFailed"));
    }
  }

  return (
    <main className="activation-shell">
      <section className="activation-card">
        <div className="activation-card-head">
          <div className="brand-mark"><UsersRound size={22} /></div>
          <div>
            <h1>{t("shellModeTitle")}</h1>
            <p>{t("shellModeBody")}</p>
          </div>
        </div>
        <div className="activation-toolbar">
          <select className="language-select" aria-label={t("language")} onChange={(event) => setLanguage(event.currentTarget.value as LanguageCode)} value={language}>
            {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeLabel}</option>)}
          </select>
          <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={t("toggleTheme")} type="button">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <button className="text-button primary-button activation-button" onClick={() => void handleInstall()} type="button">{t("installFullVersion")}</button>
        {license.artifactSha256 ? <p className="form-note">{t("sha256")}: {license.artifactSha256}</p> : null}
      </section>
    </main>
  );
}

function fullUpdateMessages(t: (key: "checkingFullVersionUpdate" | "noFullVersionUpdate" | "downloadingFullVersion" | "installingFullVersion" | "fullVersionInstalled") => string) {
  return {
    checking: t("checkingFullVersionUpdate"),
    noUpdate: t("noFullVersionUpdate"),
    downloading: t("downloadingFullVersion"),
    installing: t("installingFullVersion"),
    installed: t("fullVersionInstalled"),
  };
}