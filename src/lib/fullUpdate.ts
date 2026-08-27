import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import type { LicenseState } from "../types";

interface FullUpdateMessages {
  checking: string;
  noUpdate: string;
  downloading: string;
  installing: string;
  installed: string;
}

export async function installFullVersionUpdate(license: LicenseState, messages: FullUpdateMessages, onStatus: (message: string) => void): Promise<void> {
  if (!license.serialKey || !license.deviceId) {
    throw new Error("An activated license is required before installing the full version.");
  }

  const headers = {
    "X-Fts-Serial": license.serialKey,
    "X-Fts-Device": license.deviceId,
  };

  onStatus(messages.checking);
  const update = await check({ headers, timeout: 120_000 });
  if (!update) {
    throw new Error(messages.noUpdate);
  }

  let downloaded = 0;
  onStatus(messages.downloading);
  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onStatus(`${messages.downloading} ${formatBytes(downloaded)}`);
      return;
    }
    if (event.event === "Finished") {
      onStatus(messages.installing);
    }
  }, { headers, timeout: 600_000 });

  onStatus(messages.installed);
  await relaunch();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}