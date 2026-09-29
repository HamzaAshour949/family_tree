import { desktop, hasDesktopBridge } from "./desktop";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** A native confirmation in the app; the browser's own dialog when running in a plain tab. */
export async function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (!hasDesktopBridge()) return window.confirm(options.message);
  return desktop().confirm(options);
}
