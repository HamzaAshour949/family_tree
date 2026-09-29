import type { DesktopPlatform, MenuAction, ShellStrings } from "../../shared/desktop";

/**
 * The application menu as data. A shell turns it into native menu items; the
 * definition itself - which commands exist, their shortcuts, their order - is
 * independent of any toolkit and can be tested as plain values.
 */
export type MenuRole =
  | "appMenu"
  | "windowMenu"
  | "close"
  | "quit"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "togglefullscreen"
  | "toggleDevTools";

export type MenuItem =
  | { kind: "action"; action: MenuAction; label: string; accelerator?: string }
  | { kind: "role"; role: MenuRole }
  | { kind: "separator" }
  | { kind: "submenu"; label: string; items: MenuItem[] };

interface MenuOptions {
  platform: DesktopPlatform;
  /** Developer tools are only offered in unpackaged builds. */
  devTools: boolean;
}

export function buildMenuModel(strings: ShellStrings, { platform, devTools }: MenuOptions): MenuItem[] {
  const isMac = platform === "darwin";
  const action = (name: MenuAction, label: string, accelerator?: string): MenuItem => ({ kind: "action", action: name, label, accelerator });
  const role = (name: MenuRole): MenuItem => ({ kind: "role", role: name });
  const separator: MenuItem = { kind: "separator" };

  const view: MenuItem[] = [
    action("view-tree", strings.menuTree, "CmdOrCtrl+1"),
    action("view-timeline", strings.menuTimeline, "CmdOrCtrl+2"),
    separator,
    action("toggle-theme", strings.menuToggleTheme, "CmdOrCtrl+Shift+L"),
    separator,
    role("resetZoom"),
    role("zoomIn"),
    role("zoomOut"),
    separator,
    role("togglefullscreen"),
    ...(devTools ? [role("toggleDevTools")] : []),
  ];

  return [
    ...(isMac ? [role("appMenu")] : []),
    {
      kind: "submenu",
      label: strings.menuFile,
      items: [
        action("new-project", strings.menuNewProject, "CmdOrCtrl+N"),
        action("open-project", strings.menuOpenProject, "CmdOrCtrl+O"),
        separator,
        action("save-project", strings.menuSave, "CmdOrCtrl+S"),
        action("save-project-as", strings.menuSaveAs, "CmdOrCtrl+Shift+S"),
        separator,
        {
          kind: "submenu",
          label: strings.menuExport,
          items: [
            action("export-pdf", strings.menuExportPdf, "CmdOrCtrl+E"),
            action("export-png", strings.menuExportPng),
            action("export-svg", strings.menuExportSvg),
          ],
        },
        separator,
        role(isMac ? "close" : "quit"),
      ],
    },
    {
      kind: "submenu",
      label: strings.menuEdit,
      items: [
        // Undo and redo are routed to the app rather than to Chromium, so they
        // step through document edits; the page hands them back to the focused
        // text field when one is being typed in.
        action("undo", strings.menuUndo, "CmdOrCtrl+Z"),
        action("redo", strings.menuRedo, isMac ? "Shift+Cmd+Z" : "Ctrl+Y"),
        separator,
        role("cut"),
        role("copy"),
        role("paste"),
        role("selectAll"),
      ],
    },
    { kind: "submenu", label: strings.menuView, items: view },
    {
      kind: "submenu",
      label: strings.menuFamily,
      items: [action("add-person", strings.menuAddPerson, "CmdOrCtrl+Shift+N")],
    },
    role("windowMenu"),
  ];
}
