import { useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { useI18n } from "../i18n";
import { activateLicense, verifyLicense } from "../lib/license";
import { useFamilyStore } from "../store/familyStore";

interface LicensePanelProps {
  onStatus: (message: string) => void;
}

export function LicensePanel({ onStatus }: LicensePanelProps) {
  const { licenseText, t } = useI18n();
  const license = useFamilyStore((state) => state.license);
  const setLicense = useFamilyStore((state) => state.setLicense);
  const [customerEmail, setCustomerEmail] = useState(license.customerEmail ?? "");
  const [serialKey, setSerialKey] = useState(license.serialKey ?? "");
  const [busy, setBusy] = useState(false);

  async function handleActivation() {
    setBusy(true);
    try {
      const activated = await activateLicense(serialKey, customerEmail);
      setLicense(activated);
      onStatus(t("licenseActivated"));
    } catch (error) {
      onStatus(error instanceof Error ? error.message : t("activationFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    try {
      const verified = await verifyLicense(license);
      setLicense(verified);
      onStatus(verified.message ?? t("licenseVerified"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-section">
      <div className="panel-title-row">
        <h2 className="panel-title">{t("license")}</h2>
        <span className={`status-chip ${license.tier}`}>{licenseText(license)}</span>
      </div>
      <div className="field-stack">
        <label className="field-label">{t("customerEmail")}<input onChange={(event) => setCustomerEmail(event.currentTarget.value)} value={customerEmail} /></label>
        <label className="field-label">{t("serialKey")}<input onChange={(event) => setSerialKey(event.currentTarget.value)} value={serialKey} /></label>
        <div className="toolbar-group">
          <button className="text-button primary-button" disabled={busy} onClick={() => void handleActivation()} type="button"><KeyRound size={16} />{t("activate")}</button>
          <button className="icon-button" disabled={busy || !license.serialKey} onClick={() => void handleVerify()} title={t("verifyLicense")} type="button"><RefreshCw size={16} /></button>
        </div>
        <p className="muted-text">{license.tier === "empty" ? t("freeWorkspaceMessage") : license.message ?? t("freeWorkspaceMessage")}</p>
        {license.artifactSha256 ? <p className="muted-text">{t("sha256")}: {license.artifactSha256}</p> : null}
      </div>
    </section>
  );
}