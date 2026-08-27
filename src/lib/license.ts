import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { LicenseState } from "../types";

const STORE_FILE = "family-tree-studio.settings.json";
const LICENSE_KEY = "license";
const configuredLicenseServer = import.meta.env.VITE_LICENSE_SERVER_URL as string | undefined;
export const DEFAULT_LICENSE_SERVER = configuredLicenseServer?.trim() || "http://127.0.0.1:8080/api";
const STORE_OPTIONS = { autoSave: true, defaults: {} };

interface DeviceFingerprint {
  fingerprint: string;
  cpuHash: string;
  motherboardHash: string;
  macAddressHashes: string[];
  sources: string[];
}

interface ActivationResponse {
  status: LicenseState["status"];
  tier?: LicenseState["tier"];
  serial_key?: string;
  customer_email?: string;
  expires_at?: string;
  full_version_url?: string;
  artifact_sha256?: string;
  message?: string;
}

export const emptyLicense: LicenseState = {
  tier: "empty",
  status: "inactive",
  message: "Free workspace mode is enabled. Activate a license when you want licensed distribution/download features.",
};

export async function loadLicenseSnapshot(): Promise<LicenseState> {
  try {
    const store = await Store.load(STORE_FILE, STORE_OPTIONS);
    return (await store.get<LicenseState>(LICENSE_KEY)) ?? emptyLicense;
  } catch {
    return emptyLicense;
  }
}

export async function persistLicenseSnapshot(license: LicenseState): Promise<void> {
  const store = await Store.load(STORE_FILE, STORE_OPTIONS);
  await store.set(LICENSE_KEY, license);
  await store.save();
}

export async function activateLicense(serialKey: string, customerEmail: string): Promise<LicenseState> {
  const device = await readDeviceFingerprint();
  const response = await postLicenseRequest(`${DEFAULT_LICENSE_SERVER.replace(/\/$/, "")}/activate.php`, {
    serial_key: serialKey.trim(),
    customer_email: customerEmail.trim(),
    device_id: device.fingerprint,
    device_fingerprint: device.fingerprint,
    fingerprint_cpu: device.cpuHash,
    fingerprint_motherboard: device.motherboardHash,
    fingerprint_macs: device.macAddressHashes.join(","),
    fingerprint_sources: device.sources.join(","),
    app_version: "0.1.0",
    platform: navigator.userAgent,
  });
  const license = licenseFromResponse(response, device.fingerprint, serialKey, customerEmail);
  await persistLicenseSnapshot(license);
  return license;
}

export async function verifyLicense(license: LicenseState): Promise<LicenseState> {
  if (!license.serialKey || !license.deviceId) return license;
  try {
    const device = await readDeviceFingerprint();
    const response = await postLicenseRequest(`${DEFAULT_LICENSE_SERVER.replace(/\/$/, "")}/verify.php`, {
      serial_key: license.serialKey,
      device_id: device.fingerprint,
      device_fingerprint: device.fingerprint,
      fingerprint_cpu: device.cpuHash,
      fingerprint_motherboard: device.motherboardHash,
      fingerprint_macs: device.macAddressHashes.join(","),
      fingerprint_sources: device.sources.join(","),
      app_version: "0.1.0",
      platform: navigator.userAgent,
    });
    const verified = licenseFromResponse(response, device.fingerprint, license.serialKey, license.customerEmail ?? "");
    await persistLicenseSnapshot(verified);
    return verified;
  } catch (error) {
    const offline: LicenseState = { ...license, status: "offline", message: error instanceof Error ? error.message : "Could not reach the license server." };
    await persistLicenseSnapshot(offline);
    return offline;
  }
}

async function postLicenseRequest(url: string, body: Record<string, string>): Promise<ActivationResponse> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as ActivationResponse;
  if (!response.ok || payload.status !== "active") throw new Error(payload.message ?? "The serial key could not be activated.");
  return payload;
}

function licenseFromResponse(response: ActivationResponse, deviceId: string, serialKey: string, customerEmail: string): LicenseState {
  return {
    tier: response.tier ?? "full",
    status: response.status,
    serialKey: response.serial_key ?? serialKey,
    customerEmail: response.customer_email ?? customerEmail,
    activatedAt: new Date().toISOString(),
    expiresAt: response.expires_at,
    lastVerifiedAt: new Date().toISOString(),
    deviceId,
    fullVersionUrl: response.full_version_url,
    artifactSha256: response.artifact_sha256,
    message: response.message ?? "License active.",
  };
}

async function readDeviceFingerprint(): Promise<DeviceFingerprint> {
  try {
    return await invoke<DeviceFingerprint>("get_device_fingerprint");
  } catch {
    throw new Error("Device fingerprint could not be read. Open the installed desktop app to activate.");
  }
}