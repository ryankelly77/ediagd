#!/usr/bin/env bash
# ============================================================================
# EDIAGD — put the generated native projects back in a buildable state
#
# `npx cap add ios|android` scaffolds a project from a template; anything we
# need inside it that the template does not provide has to be re-applied every
# time it is regenerated. Today that is the two Firebase configs and the icon
# set. Run this after `cap add`, and after any `cap sync` that recreated them.
#
# Safe to run repeatedly. Skips whichever platform is not present.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf "  %s\n" "$*"; }

if [ ! -f native/firebase/google-services.json ]; then
  say "native/firebase/google-services.json missing — see native/firebase/README.md"
  exit 1
fi

if [ -d android ]; then
  mkdir -p android/app
  cp native/firebase/google-services.json android/app/google-services.json
  say "android: google-services.json -> android/app/"
else
  say "android: not generated yet (npx cap add android)"
fi

if [ -d ios ]; then
  mkdir -p ios/App/App
  cp native/firebase/GoogleService-Info.plist ios/App/App/GoogleService-Info.plist
  say "ios: GoogleService-Info.plist -> ios/App/App/"
else
  say "ios: not generated yet (npx cap add ios)"
fi

# Icons and splash. @capacitor/assets reads native/assets/{icon,splash}.png and
# writes every size both platforms want.
if [ -d ios ] || [ -d android ]; then
  # @capacitor/assets writes the icon set before the splash and ABORTS if the
  # directory is missing — which it is, because AppIcon.icon replaced the
  # appiconset and the block below deletes it every run. The generator then
  # failed silently-ish ("unable to open for write") and the splash was never
  # regenerated at all, which cost an afternoon of wondering why new splash art
  # was not appearing. Give it somewhere to write; it gets removed again below.
  mkdir -p ios/App/App/Assets.xcassets/AppIcon.appiconset
  printf '{"images":[],"info":{"author":"xcode","version":1}}' \
    > ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json

  say "generating icons + splash from native/assets/"
  npx --yes @capacitor/assets generate \
    --assetPath native/assets \
    --iconBackgroundColor '#0C1C2C' \
    --iconBackgroundColorDark '#0C1C2C' \
    --splashBackgroundColor '#0C1C2C' \
    --splashBackgroundColorDark '#0C1C2C' || say "asset generation skipped"

  # @capacitor/assets also emits PWA output — a manifest and a web icon set —
  # whether or not you asked for it. README.md forbids PWA plumbing outright
  # ("no service-worker/manifest"), and a stray manifest.webmanifest in public/
  # would be picked up by browsers and quietly re-open a decision that was made
  # deliberately. Deleted every run rather than argued about later.
  rm -f public/manifest.webmanifest
  rm -rf public/icons
  # It also drops a bare icons/ at the repo root, which is neither PWA nor
  # native — just litter from the generator's web target.
  rm -rf icons
  say "removed PWA output (README: no PWA plumbing)"

  # ---- The app icon comes from AppIcon.icon, not from here ------------------
  # @capacitor/assets writes a flat AppIcon.appiconset into the catalog. Since
  # build 2 the iOS icon is a layered Icon Composer file at
  # ios/App/App/AppIcon.icon, and Apple's docs are explicit that the .icon
  # REPLACES the catalog's icon — you get one or the other, not both. Leaving
  # the generated appiconset behind would mean two things named AppIcon and an
  # icon nobody can predict.
  #
  # The splash imageset it also writes IS still wanted, so only the icon is
  # removed. To go back to a flat icon, delete AppIcon.icon and drop this block.
  if [ -d ios/App/App/Assets.xcassets/AppIcon.appiconset ] && [ -d ios/App/App/AppIcon.icon ]; then
    rm -rf ios/App/App/Assets.xcassets/AppIcon.appiconset
    say "ios: removed generated AppIcon.appiconset — AppIcon.icon owns the icon"
  fi
fi

# Android 12+ splash colours — see the docstring in the script.
if [ -d android ]; then
  python3 scripts/patch-android-theme.py
fi

say "done"
