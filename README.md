# Snibox

A fast, keyboard-first snippet bank and paste launcher for Windows, macOS, and Linux.

Built with [Tauri v2](https://v2.tauri.app/) + React + TypeScript.

## Features

- **Global hotkey** (`Ctrl+Shift+Space`) opens a floating search window
- **Instant search** with FTS5 full-text search across titles, content, and tags
- **One-keystroke copy** — press Enter to copy and auto-close
- **Snippet editor** with title, multiline content, and tags
- **Pin** frequently used snippets to the top
- **Draft recovery** — never lose work on crash or accidental close
- **In-app updates** — update without reinstalling
- **Keyboard-first** — every action has a shortcut

## Keyboard Shortcuts

### Launcher

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + N` | New snippet |
| `↑ / ↓` | Navigate list |
| `Enter` | Copy selected + close |
| `Ctrl/⌘ + E` | Edit selected |
| `Ctrl/⌘ + P` | Pin/unpin |
| `Delete` | Delete (with undo) |
| `Escape` | Close window |

### Editor

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + Enter` | Save |
| `Escape` | Cancel (confirms if unsaved) |

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (1.77+)
- [Node.js](https://nodejs.org/) (20+)
- [pnpm](https://pnpm.io/)
- System dependencies for Tauri (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

### Setup

```bash
pnpm install
pnpm tauri dev
```

Create local env file before first run:

```bash
cp .env.example .env
```

### Build

```bash
pnpm tauri build
```

### Release

```bash
./scripts/bump-version.sh 0.2.0
git add -A && git commit -m "chore: bump version to v0.2.0"
git tag v0.2.0
git push && git push --tags
```

Pushing a `v*` tag triggers the release workflow on GitHub Actions.

Versioning follows SemVer (`MAJOR.MINOR.PATCH`). Use `scripts/bump-version.sh` so all version fields stay in sync.

The release workflow also injects updater settings at build time:

- `SNIBOX_UPDATER_REPOSITORY` (from `github.repository`)
- `SNIBOX_UPDATER_PUBKEY` (from GitHub secret `TAURI_PUBLIC_KEY`)

This ensures installed users can receive in-app updates from GitHub Releases without reinstalling.

## Architecture

- **Frontend**: React 19, Zustand, Tailwind CSS, Vite
- **Backend**: Tauri v2, Rust, SQLite (rusqlite) with FTS5
- **Updates**: tauri-plugin-updater with GitHub Releases
- **Shortcuts**: tauri-plugin-global-shortcut (system-wide), React keybind hooks (in-app)

## License

MIT
