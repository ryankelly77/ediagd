#!/usr/bin/env python3
"""Android 12+ splash colours.

`npx cap add android` writes a launch theme that sets `android:background` to
the splash drawable. That is the pre-Android-12 mechanism. From 12 onward the
system draws the splash itself and reads windowSplashScreenBackground and
windowSplashScreenAnimatedIcon — so an unpatched project shows the app icon on
the platform's default near-white, which for a navy-branded app looks like a
bug. Observed on a Pixel emulator before this patch existed.

android/ is generated and gitignored, so this runs from scripts/native-sync.sh
after every regeneration rather than being hand-edited once and lost.
"""
import re, sys, pathlib

styles = pathlib.Path("android/app/src/main/res/values/styles.xml")
if not styles.exists():
    print("  android: styles.xml not present, skipping theme patch"); sys.exit(0)

s = styles.read_text()
NAVY = "#0C1C2C"

if "windowSplashScreenBackground" in s:
    print("  android: splash theme already patched"); sys.exit(0)

s = s.replace(
    '''    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>''',
    f'''    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <!-- Pre-12 devices still read this. -->
        <item name="android:background">@drawable/splash</item>
        <!-- Android 12+ draws its own splash and ignores the above. -->
        <item name="windowSplashScreenBackground">{NAVY}</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>''')

styles.write_text(s)
print(f"  android: splash background pinned to {NAVY}")
