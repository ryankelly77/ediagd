#!/usr/bin/env python3
"""Make the generated Android project releasable.

`npx cap add android` writes a project that can only produce a debug APK: the
release build type has no signing config, the version is the template's
`1.0`/`1`, and the merged manifest inherits whatever permissions the Firebase
libraries feel like contributing. None of that is hand-editable, because
android/ is generated and gitignored — so it is re-applied here, from
scripts/native-sync.sh, after every regeneration.

Three things, and each one is a property of the project rather than a step
somebody has to remember:

  1. versionName is READ FROM ios/App/App.xcodeproj/project.pbxproj, so the two
     stores cannot drift. There is no Android copy of the number to forget.
     versionCode stays 1 but becomes overridable on the gradle command line
     (-PediagdVersionCode=2), because Play needs it to climb per upload and a
     generated file is the wrong place to keep a counter.

  2. Release signing reads gradle properties. The keystore lives outside every
     checkout and the password is supplied as ORG_GRADLE_PROJECT_* from the
     environment, so nothing secret is written into android/ or visible in a
     process listing. And a release task with no signing properties FAILS at
     configuration time rather than producing an unsigned bundle and printing
     SUCCESS — see AGENTS.md, "a summary is not an observation".

  3. com.google.android.gms.permission.AD_ID is removed by the merger.
     The Play listing declares no advertising ID. firebase-messaging does not
     contribute AD_ID today; a future bump of it, or anything that drags in
     play-services-measurement, would, and would do it silently. The remove is
     unconditional so that cannot happen — an exclusion that only fires when
     somebody notices the problem is not an exclusion.
     POST_NOTIFICATIONS is declared here too rather than inherited, because a
     permission the app genuinely needs should not depend on a transitive
     library manifest continuing to ask for it.

Exits non-zero if anything it expects to find has changed shape. A patcher that
silently matches nothing is the "check that is silent by default" this codebase
has already been bitten by three times.
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
GRADLE = ROOT / "android" / "app" / "build.gradle"
MANIFEST = ROOT / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
PBXPROJ = ROOT / "ios" / "App" / "App.xcodeproj" / "project.pbxproj"

MARKER = "EDIAGD RELEASE PATCH"


def fail(msg):
    print(f"  android: {msg}")
    sys.exit(1)


def ios_marketing_version():
    """The one version number. Ambiguity is an error, not a guess."""
    if not PBXPROJ.exists():
        fail(f"{PBXPROJ.relative_to(ROOT)} missing — cannot derive versionName")
    found = set(re.findall(r"MARKETING_VERSION = ([^;]+);", PBXPROJ.read_text()))
    found = {v.strip() for v in found}
    if len(found) != 1:
        fail(
            "expected exactly one MARKETING_VERSION in the iOS project, found "
            f"{sorted(found) or 'none'} — fix the iOS project before building Android"
        )
    return found.pop()


# --------------------------------------------------------------------------
# app/build.gradle
# --------------------------------------------------------------------------
if not GRADLE.exists():
    print("  android: app/build.gradle not present, skipping release patch")
    sys.exit(0)

version_name = ios_marketing_version()
gradle = GRADLE.read_text()

if MARKER in gradle:
    print("  android: build.gradle already patched")
else:
    TEMPLATE_VERSION = '        versionCode 1\n        versionName "1.0"\n'
    if TEMPLATE_VERSION not in gradle:
        fail(
            "app/build.gradle does not carry the expected template version block — "
            "the Capacitor template changed; re-read it before trusting this patch"
        )
    gradle = gradle.replace(
        TEMPLATE_VERSION,
        "        // "
        + MARKER
        + """ — versionCode climbs per Play upload and is
        // passed on the command line; versionName is the iOS MARKETING_VERSION,
        // written here by scripts/patch-android-release.py so it cannot drift.
        versionCode (project.findProperty("ediagdVersionCode") ?: 1) as Integer
        versionName "{version_name}"
""".replace(
            "{version_name}", version_name
        ),
    )

    TEMPLATE_RELEASE = """    buildTypes {
        release {
            minifyEnabled false
"""
    if TEMPLATE_RELEASE not in gradle:
        fail("app/build.gradle does not carry the expected release buildType block")
    gradle = gradle.replace(
        TEMPLATE_RELEASE,
        """    // """
        + MARKER
        + """ — the keystore lives outside every checkout
    // (~/ediagd-keys) and these four values arrive as gradle properties, set
    // from ORG_GRADLE_PROJECT_* in the environment. Nothing secret is written
    // into android/, which is just as well: android/ is regenerated.
    signingConfigs {
        release {
            if (project.hasProperty("ediagdKeystore")) {
                storeFile file(project.property("ediagdKeystore"))
                storePassword project.property("ediagdKeystorePassword")
                keyAlias project.property("ediagdKeyAlias")
                keyPassword project.property("ediagdKeyPassword")
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
""",
    )

    gradle += (
        """
// """
        + MARKER
        + """ — a release artifact that is silently unsigned is
// exactly the failure AGENTS.md calls "a summary is not an observation":
// bundleRelease would print SUCCESS and hand Play something it refuses. Refuse
// at configuration time instead, where the message can say what is missing.
gradle.taskGraph.whenReady { graph ->
    def wantsRelease = graph.allTasks.any { t ->
        t.project == project && t.name ==~ /(bundle|assemble)Release/
    }
    def required = ["ediagdKeystore", "ediagdKeystorePassword",
                    "ediagdKeyAlias", "ediagdKeyPassword"]
    def missing = required.findAll { !project.hasProperty(it) }
    if (wantsRelease && missing) {
        throw new GradleException(
            "Release build requested without signing properties: " +
            missing.join(", ") + ". Supply them as ORG_GRADLE_PROJECT_<name> " +
            "in the environment (never on the command line, never in a file).")
    }
}
"""
    )

    GRADLE.write_text(gradle)
    print(f"  android: versionName {version_name} (from iOS), versionCode 1, release signing wired")

# --------------------------------------------------------------------------
# AndroidManifest.xml
# --------------------------------------------------------------------------
if not MANIFEST.exists():
    fail("app/src/main/AndroidManifest.xml not present")

manifest = MANIFEST.read_text()

if MARKER in manifest:
    print("  android: manifest already patched")
    sys.exit(0)

TEMPLATE_PERMS = """    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
"""
if TEMPLATE_PERMS not in manifest:
    fail("AndroidManifest.xml does not carry the expected permissions block")

manifest = manifest.replace(
    """<manifest xmlns:android="http://schemas.android.com/apk/res/android">""",
    """<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">""",
    1,
)
manifest = manifest.replace(
    TEMPLATE_PERMS,
    """    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />

    <!-- """
    + MARKER
    + """ — see scripts/patch-android-release.py.
         Declared rather than inherited from firebase-messaging's manifest, so
         the permission the app needs does not depend on a library continuing
         to ask for it. -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- The Play listing declares no advertising ID. Removed unconditionally
         rather than when a dependency is noticed to add it: a bump of
         firebase-messaging, or anything that drags in play-services-measurement,
         would otherwise reintroduce it with nothing printing a word. -->
    <uses-permission android:name="com.google.android.gms.permission.AD_ID"
        tools:node="remove" />
""",
)

MANIFEST.write_text(manifest)
print("  android: POST_NOTIFICATIONS declared, AD_ID removed from the merge")
