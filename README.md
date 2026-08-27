# Family Tree Studio

Family Tree Studio is a Tauri 2 desktop application for building, editing, saving, loading, and exporting shareable `.ftree` family tree projects. It uses React, TypeScript, TailwindCSS, React Flow, ELK layout, and a PHP/SQLite licensing backend scaffold.

## Development

```sh
npm install
npm run tauri dev
```

## Build

```sh
npm run tauri build
```

On macOS the generated app bundle is created under `src-tauri/target/release/bundle/macos/Family Tree Studio.app`. Copy it into `~/Applications` for quick testing:

```sh
mkdir -p ~/Applications
rm -rf ~/Applications/Family\ Tree\ Studio.app
cp -R "src-tauri/target/release/bundle/macos/Family Tree Studio.app" ~/Applications/
```

Windows builds produce installers under `src-tauri/target/release/bundle/msi` or `nsis`. Linux builds produce packages under `src-tauri/target/release/bundle/deb`, `rpm`, or `appimage`, depending on the host setup.

## Included Features

- Person profiles with photos, dates, places, notes, tags, gender, and occupation.
- Relationship editing for parents, spouses, and children.
- Automatic date-aware tree layout with ELK-assisted ordering.
- Search, gender filtering, tree view, and timeline view.
- `.ftree` project open/save using native Tauri dialogs.
- PNG, SVG, and PDF export from the current tree surface.
- Dark theme by default with a polished light theme.
- Licensing activation panel wired to PHP endpoints.
- PHP admin/control-panel scaffold in `backend/` for serial keys, customers, activations, usage, revocation, and support notes.

## Licensing Backend

Copy `backend/config.example.php` to `backend/config.php`, set the admin credentials and secret, then initialize SQLite:

```sh
cd backend
php migrate.php
php -S 127.0.0.1:8080
```

Open `http://127.0.0.1:8080/admin/` for the admin panel. In the desktop app, set the license server to `http://127.0.0.1:8080/api` while testing locally.