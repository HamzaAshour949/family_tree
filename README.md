# Family Tree Studio

A desktop workspace for building family trees: structured profiles, real
relationship rules, automatic layout, and clean PNG / SVG / PDF exports.
Projects are plain `.ftree` files that live on your own machine.

Built with Electron, React, TypeScript, React Flow and ELK.

> No account, no license key, no network calls. Install it and start editing.

---

## Quick start

```sh
npm install
npm run dev
```

`npm run dev` starts Vite, waits for it, then launches Electron against it with
the renderer devtools open. Edits to `src/` hot-reload; edits to `electron/`
need a restart.

Open `examples/sample-family.ftree` to see a populated tree straight away.

## Building installers

```sh
npm run build          # typecheck, bundle the renderer, build the Electron entries
npm run package:mac    # macOS   -> dmg + zip (x64 and arm64)
npm run package:win    # Windows -> NSIS installer (x64, arm64) + portable exe
npm run package        # every target configured for the current platform
```

Artifacts land in `release/`.

**Each installer format has to be built on its own platform.** A macOS `.dmg`
needs macOS, and a Windows NSIS installer needs Windows (or Wine). Pushing a
`v*` tag runs `.github/workflows/release.yml`, which builds both on
`macos-latest` and `windows-latest` in parallel and uploads the installers as
workflow artifacts. `workflow_dispatch` runs it on demand.

Builds are unsigned by default, so macOS Gatekeeper and Windows SmartScreen
will warn on first launch. To sign, set the `CSC_LINK` and `CSC_KEY_PASSWORD`
repository secrets; add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
`APPLE_TEAM_ID` to notarize on macOS.

## Checks

```sh
npm run typecheck   # renderer, Node and Electron projects
npm test            # unit tests (Vitest)
npm run smoke       # boots the real app and drives it over the DevTools protocol
```

`npm run smoke` needs a built app (`npm run build`) and a display. On a
headless machine run it as `xvfb-run -a npm run smoke -- --no-sandbox`. It
exists because a broken preload is invisible from the outside: the window still
renders, it has just silently lost every file operation.

## Features

- **Profiles** — names, gender, dates, places, occupation, photo URL, tags and
  free-text notes.
- **Relationships** — parents, spouses and children, added from the inspector
  or by right-clicking a card on the canvas.
- **Rules that hold the tree together** — a person cannot be their own
  ancestor, cannot have two parents of the same gender, cannot marry a close
  relative, and cannot be both spouse and parent of the same profile.
- **Automatic layout** — generations resolve into rows, spouses sit together,
  siblings order by birth date, and unconnected families are laid out side by
  side.
- **Two views** — the tree canvas and a chronological timeline of births,
  deaths and marriages. Clicking a timeline entry jumps to that person.
- **Search and filter** across every text field, plus a gender filter.
- **Export** the whole tree - not just what is on screen - to PNG, SVG or PDF.
- **English and Arabic**, with full right-to-left layout.
- **Dark and light themes**, following the system preference on first launch.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| New project | `⌘N` | `Ctrl+N` |
| Open project | `⌘O` | `Ctrl+O` |
| Save | `⌘S` | `Ctrl+S` |
| Save as | `⇧⌘S` | `Ctrl+Shift+S` |
| Export as PDF | `⌘E` | `Ctrl+E` |
| Add person | `⇧⌘N` | `Ctrl+Shift+N` |
| Tree view | `⌘1` | `Ctrl+1` |
| Timeline view | `⌘2` | `Ctrl+2` |
| Toggle theme | `⇧⌘L` | `Ctrl+Shift+L` |

## Project files

A `.ftree` file is formatted JSON — diffable, greppable and safe to keep in
version control. Files are parsed defensively: unknown or malformed fields are
coerced, duplicate ids are dropped, and relationships pointing at people the
file does not contain are discarded rather than rendered as dangling edges.

Double-clicking a `.ftree` opens it in the app once installed, and passing one
on the command line works too:

```sh
"Family Tree Studio" path/to/tree.ftree
```

## How it is put together

```
electron/     main process, preload bridge and the IPC contract they share
src/          React renderer
  components/ UI
  lib/        domain logic - family helpers, layout, rules, file IO, exporters
  store/      Zustand store; the single source of truth for the open document
scripts/      dev runner, Electron build, smoke test
examples/     a sample project to open
```

The renderer holds no privileges. Every file dialog, read, write and native
confirmation happens in the main process and is reached through a preload
bridge exposed with `contextBridge`. Windows run with context isolation and the
Chromium sandbox on, node integration off, a strict Content-Security-Policy,
and navigation redirected to the system browser.

Because Vite inlines every renderer library into `dist`, the packaged app ships
only `dist` and `dist-electron` — no `node_modules` tree. That is why the
libraries live in `devDependencies`.

## Notes

- Photos are referenced by URL and fetched over HTTPS at display time; they are
  not copied into the project file. A broken URL falls back to initials.
- The app makes no other network requests.
- Earlier versions shipped a Tauri shell, a per-device license gate and a PHP
  storefront that sold keys for USDT/USDC. All of it has been removed. It
  remains in the git history if it is ever needed again.
