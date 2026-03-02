#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

VERSION="$1"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: Version must follow SemVer (e.g. 1.2.3 or 1.0.0-beta.1)"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping version to $VERSION..."

# package.json
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"
rm -f "$ROOT/package.json.bak"

# tauri.conf.json
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
rm -f "$ROOT/src-tauri/tauri.conf.json.bak"

# Cargo.toml
sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" "$ROOT/src-tauri/Cargo.toml"
rm -f "$ROOT/src-tauri/Cargo.toml.bak"

echo "Updated to v$VERSION in:"
echo "  - package.json"
echo "  - src-tauri/tauri.conf.json"
echo "  - src-tauri/Cargo.toml"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m \"chore: bump version to v$VERSION\""
echo "  git tag v$VERSION"
echo "  git push && git push --tags"
