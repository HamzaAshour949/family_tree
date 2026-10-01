import { Menu, type MenuItemConstructorOptions } from "electron";
import type { MenuAction } from "../../shared/desktop";
import type { MenuItem } from "../core/menuModel";

/** Turns the toolkit-independent menu definition into an Electron menu. */
export function toElectronMenu(items: MenuItem[], onAction: (action: MenuAction) => void): Menu {
  return Menu.buildFromTemplate(items.map((item) => convert(item, onAction)));
}

function convert(item: MenuItem, onAction: (action: MenuAction) => void): MenuItemConstructorOptions {
  switch (item.kind) {
    case "separator":
      return { type: "separator" };
    case "role":
      // The role names in the model are Electron's own; the label overrides its English default.
      return { role: item.role, label: item.label };
    case "action":
      return { label: item.label, accelerator: item.accelerator, click: () => onAction(item.action) };
    case "submenu":
      return { label: item.label, role: item.role, submenu: item.items.map((child) => convert(child, onAction)) };
  }
}
