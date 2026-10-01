import type { DesktopPlatform, MenuAction, ShellStrings } from "../../shared/desktop";

/**
 * The application menu as data. A shell turns it into native menu items; the
 * definition itself - which commands exist, their shortcuts, their order - is
 * independent of any toolkit and can be tested as plain values.
 */
export type MenuRole =
  | "about"
  | "services"
  | "hide"
  | "hideOthers"
  | "unhide"
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
  | "toggleDevTools"
  | "minimize"
  | "zoom"
  | "front";

/**
 * Built-in commands keep their native behaviour through `role`, but always
 * carry a label: left to the toolkit, they stay in English whatever the
 * interface language, which left the Arabic menu half translated.
 */
export type MenuItem =
  | { kind: "action"; action: MenuAction; label: string; accelerator?: string }
  | { kind: "role"; role: MenuRole; label: string }
  | { kind: "separator" }
  /** `role: "window"` marks the menu macOS lists open windows in. */
  | { kind: "submenu"; label: string; items: MenuItem[]; role?: "window" };

interface MenuOptions {
  platform: DesktopPlatform;
  /** Developer tools are only offered in unpackaged builds. */
  devTools: boolean;
  /** Replaces `{name}` in labels such as "Quit {name}". */
  appName: string;
}

export function buildMenuModel(strings: ShellStrings, { platform, devTools, appName }: MenuOptions): MenuItem[] {
  const isMac = platform === "darwin";
  const action = (name: MenuAction, label: string, accelerator?: string): MenuItem => ({ kind: "action", action: name, label, accelerator });
  const role = (name: MenuRole, label: string): MenuItem => ({ kind: "role", role: name, label: label.replaceAll("{name}", appName) });
  const separator: MenuItem = { kind: "separator" };

  const view: MenuItem[] = [
    action("view-tree", strings.menuTree, "CmdOrCtrl+1"),
    action("view-timeline", strings.menuTimeline, "CmdOrCtrl+2"),
    separator,
    action("toggle-theme", strings.menuToggleTheme, "CmdOrCtrl+Shift+L"),
    separator,
    role("resetZoom", strings.menuActualSize),
    role("zoomIn", strings.menuZoomIn),
    role("zoomOut", strings.menuZoomOut),
    separator,
    role("togglefullscreen", strings.menuFullScreen),
    ...(devTools ? [role("toggleDevTools", strings.menuDevTools)] : []),
  ];

  // macOS titles this menu with the app's name whatever label it is given.
  const appMenu: MenuItem = {
    kind: "submenu",
    label: appName,
    items: [
      role("about", strings.menuAbout),
      separator,
      role("services", strings.menuServices),
      separator,
      role("hide", strings.menuHide),
      role("hideOthers", strings.menuHideOthers),
      role("unhide", strings.menuShowAll),
      separator,
      role("quit", strings.menuQuit),
    ],
  };

  const windowMenu: MenuItem = {
    kind: "submenu",
    label: strings.menuWindow,
    role: "window",
    items: isMac
      ? [role("minimize", strings.menuMinimize), role("zoom", strings.menuZoomWindow), separator, role("front", strings.menuBringAllToFront)]
      : [role("minimize", strings.menuMinimize), role("close", strings.menuCloseWindow)],
  };

  return [
    ...(isMac ? [appMenu] : []),
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
        isMac ? role("close", strings.menuCloseWindow) : role("quit", strings.menuExit),
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
        role("cut", strings.menuCut),
        role("copy", strings.menuCopy),
        role("paste", strings.menuPaste),
        role("selectAll", strings.menuSelectAll),
      ],
    },
    { kind: "submenu", label: strings.menuView, items: view },
    {
      kind: "submenu",
      label: strings.menuFamily,
      items: [action("add-person", strings.menuAddPerson, "CmdOrCtrl+Shift+N")],
    },
    windowMenu,
  ];
}
