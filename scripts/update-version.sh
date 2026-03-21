#!/bin/bash
# Version update script for homepinas-v3-app
# Usage: ./scripts/update-version.sh [patch|minor|major] "Description of changes"
set -euo pipefail

VERSION_TYPE=${1:-patch}
DESCRIPTION="${2:-}"

if [ -z "$DESCRIPTION" ]; then
  echo "Usage: ./scripts/update-version.sh [patch|minor|major] \"Description of changes\""
  echo ""
  echo "Examples:"
  echo "  ./scripts/update-version.sh patch \"Fixed glassmorphism transparency\""
  echo "  ./scripts/update-version.sh minor \"Added real-time monitoring\""
  echo "  ./scripts/update-version.sh major \"Complete UI redesign\""
  exit 1
fi

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "❌ Invalid version type: $VERSION_TYPE"
  echo "   Must be: patch, minor, or major"
  exit 1
fi

# Ensure we're in the project root
if [ ! -f "package.json" ]; then
  echo "❌ package.json not found. Run from project root."
  exit 1
fi

OLD_VERSION=$(node -p "require('./package.json').version")

# Bump version
npm version "$VERSION_TYPE" --no-git-tag-version >/dev/null

NEW_VERSION=$(node -p "require('./package.json').version")
TODAY=$(date +"%d %B %Y")

# Build changelog entry
ENTRY="### v${NEW_VERSION} (${TODAY})\n- ✅ ${DESCRIPTION}\n"

# Insert entry after the "## 📋 Changelog" header
if grep -q "^## 📋 Changelog" README.md 2>/dev/null; then
  sed -i "/^## 📋 Changelog$/a\\\\n${ENTRY}" README.md
else
  echo "⚠️  No '## 📋 Changelog' section found in README.md — appending."
  printf "\n## 📋 Changelog\n\n${ENTRY}\n" >> README.md
fi

# Stage and commit
git add package.json README.md
git commit -m "chore(release): v${NEW_VERSION} — ${DESCRIPTION}"

echo ""
echo "✅ Version bumped: v${OLD_VERSION} → v${NEW_VERSION}"
echo "✅ README.md changelog updated"
echo "✅ Committed"
echo ""
echo "👉 Next: git push origin main"
