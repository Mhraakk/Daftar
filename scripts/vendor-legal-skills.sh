#!/usr/bin/env bash
# به‌روزرسانی نسخه محلی دو مخزن مهارت حقوقی در vendor/legal-skills (نیازمند دسترسی به github.com).
# پس از اجرا: npm run skills:sync
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone --depth 1 https://github.com/evolsb/claude-legal-skill.git "$TMP/claude-legal-skill"
git clone --depth 1 https://github.com/anthropics/claude-for-legal.git "$TMP/claude-for-legal"
V="$ROOT/vendor/legal-skills"
rm -rf "$V" && mkdir -p "$V/contract-review" "$V/claude-for-legal"
cp "$TMP/claude-legal-skill/skill.md" "$V/contract-review/SKILL.md"
cp "$TMP/claude-legal-skill/LICENSE" "$TMP/claude-legal-skill/README.md" "$V/contract-review/"
cp "$TMP/claude-for-legal/LICENSE" "$TMP/claude-for-legal/README.md" "$TMP/claude-for-legal/CLAUDE.md" "$V/claude-for-legal/"
for d in "$TMP"/claude-for-legal/*/skills "$TMP"/claude-for-legal/external_plugins/*/skills; do
  plug="$(basename "$(dirname "$d")")"
  mkdir -p "$V/claude-for-legal/$plug"
  cp -r "$d" "$V/claude-for-legal/$plug/"
  [ -f "$(dirname "$d")/CLAUDE.md" ] && cp "$(dirname "$d")/CLAUDE.md" "$V/claude-for-legal/$plug/PRACTICE-PROFILE-TEMPLATE.md"
  [ -f "$(dirname "$d")/README.md" ] && cp "$(dirname "$d")/README.md" "$V/claude-for-legal/$plug/"
done
cat > "$V/SOURCES.json" <<JSON
{
  "note": "Vendored legal skills used verbatim by the Daftar app. Refresh with scripts/vendor-legal-skills.sh, then run npm run skills:sync.",
  "sources": [
    { "id": "contract-review", "repo": "https://github.com/evolsb/claude-legal-skill", "commit": "$(git -C "$TMP/claude-legal-skill" rev-parse HEAD)", "license": "MIT", "licenseFile": "contract-review/LICENSE" },
    { "id": "claude-for-legal", "repo": "https://github.com/anthropics/claude-for-legal", "commit": "$(git -C "$TMP/claude-for-legal" rev-parse HEAD)", "license": "Apache-2.0", "licenseFile": "claude-for-legal/LICENSE" }
  ]
}
JSON
echo "vendored $(find "$V" -name SKILL.md | wc -l) skills into $V"
