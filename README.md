<p align="center">
  <img src="public/images/logo.png" alt="Snibox logo" width="120" />
</p>

<h1 align="center">Snibox</h1>

<p align="center">
  <strong>Local-first, keyboard-first snippet launcher for Windows, macOS, and Linux.</strong><br />
  Capture once. Find instantly. Paste in one keystroke.
</p>

<p align="center">
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.77%2B-000000?style=for-the-badge&logo=rust&logoColor=white" />
  <img alt="SQLite FTS5" src="https://img.shields.io/badge/SQLite-FTS5-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-1f8b4c?style=for-the-badge" />
</p>

## Why Snibox

Snibox is built for people who paste the same things all day: prompts, replies, SQL, shell snippets, ticket templates, links, and notes.

- Open instantly with a global hotkey: `CmdOrCtrl+Shift+Space`
- Search across title, content, and tags with SQLite FTS5
- Paste selected snippet immediately with `Enter`
- Pin important snippets to keep them at the top
- Recover draft edits if the app closes unexpectedly
- Keep data local-first, then sync to Google Drive when needed

## Feature Highlights

### Fast launcher workflow

- Keyboard-first list navigation (`Up/Down`, `Enter`, `Esc`)
- Create, edit, duplicate, delete, and undo delete from one surface
- Quick preview modal for long snippets

### Smart search and filters

Use normal text search plus operators:

| Pattern | Result |
|---|---|
| `#api` | Filter by tag |
| `tag:billing` | Filter by tag (explicit) |
| `is:pinned` | Show only pinned snippets |
| `used:recent` | Show recently used snippets |
| `updated:today` | Show snippets updated today |

### Sync, safety, and portability

- Google Drive sync with offline queueing
- Conflict inbox for safe conflict resolution
- Optional backup folder export/import flow
- Built-in updater with in-place app updates

### Personalization

- Light, dark, or system theme
- Accent color palettes
- Customizable keyboard shortcuts

## Keyboard Shortcuts

### Launcher

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + N` | New snippet |
| `Up / Down` | Move selection |
| `Enter` | Paste selected snippet |
| `Cmd/Ctrl + E` | Edit selected |
| `Cmd/Ctrl + P` | Pin/unpin selected |
| `Delete` | Delete selected (with undo) |
| `Esc` | Close launcher |

### Editor

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Enter` | Save |
| `Esc` | Cancel |

## Demo Video Script

A ready-to-read script is included here:

- [docs/video-script.md](docs/video-script.md)

Use it to record a short promo or a full walkthrough.

## Run Locally

### Prerequisites

- [Rust](https://rustup.rs/) (1.77+)
- [Node.js](https://nodejs.org/) (20+)
- [pnpm](https://pnpm.io/)
- Tauri system dependencies: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
pnpm install
cp .env.example .env
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## Release

```bash
./scripts/bump-version.sh 0.2.0
git add -A && git commit -m "chore: bump version to v0.2.0"
git tag v0.2.0
git push && git push --tags
```

Pushing a `v*` tag triggers the GitHub Actions release workflow.

Updater environment variables used in CI:

- `SNIBOX_UPDATER_REPOSITORY` (from `github.repository`)
- `SNIBOX_UPDATER_PUBKEY` (from GitHub secret `TAURI_PUBLIC_KEY`)

## Architecture

- Frontend: React 19, TypeScript, Zustand, Tailwind CSS, Vite
- Desktop runtime: Tauri v2 + Rust
- Storage: SQLite (`rusqlite`) + FTS5 search
- Sync: Google Drive auth + sync conflict handling
- Updates: `tauri-plugin-updater`

## License

MIT
