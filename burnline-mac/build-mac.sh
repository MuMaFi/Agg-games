#!/usr/bin/env bash
# Baut Burnline.app für Apple Silicon (arm64) und Intel (x64) und packt beide als ZIP nach dist/.
# Läuft auf macOS und Linux. Auf Linux wird mit rcodesign ad-hoc signiert, falls vorhanden.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf out dist && mkdir -p dist
for ARCH in arm64 x64; do
  npx @electron/packager . Burnline --platform=darwin --arch=$ARCH --out=out --overwrite \
    --icon=icon/Burnline.icns --app-bundle-id=de.mumafi.burnline --app-version=1.0.0 \
    --app-category-type=public.app-category.music --ignore='^/(out|dist|icon|node_modules|build-mac\.sh|prepare\.js|README\.md|extend-info\.plist|\.gitignore|package-lock\.json)' \
    --extend-info=extend-info.plist
  APPDIR="out/Burnline-darwin-$ARCH/Burnline.app"
  if [[ "$(uname)" == "Darwin" ]]; then codesign --force --deep -s - "$APPDIR"
  elif command -v rcodesign >/dev/null; then rcodesign sign "$APPDIR" >/dev/null; fi
  (cd "out/Burnline-darwin-$ARCH" && zip -qry "../../dist/Burnline-mac-$ARCH.zip" Burnline.app)
done
ls -lh dist
