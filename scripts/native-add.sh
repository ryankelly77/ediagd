#!/usr/bin/env bash
# ============================================================================
# EDIAGD — generate whichever native projects are missing, then sync them
#
# This used to be `npx cap add ios && npx cap add android && native-sync`, and
# it could not succeed in any checkout of this repository. `cap add` calls
# fatal() when the platform directory already exists, and ios/ IS COMMITTED
# (capacitor.config.ts says why: the signing team, the version numbers and
# ITSAppUsesNonExemptEncryption live nowhere else). So the chain died on the
# first command and never reached android — the one platform that genuinely is
# generated. The documented way to get a buildable android/ did not work.
#
# Adding a platform that is already there is not a failure and must not be
# reported as one; a platform that is genuinely missing and fails to generate
# must not be passed over. Both of those are the same rule: the exit code is a
# function of what happened.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf "  %s\n" "$*"; }

for platform in ios android; do
  if [ -d "$platform" ]; then
    say "$platform: already present, left alone (remove the directory to re-add)"
  else
    say "$platform: generating"
    npx cap add "$platform"
  fi
done

bash scripts/native-sync.sh
