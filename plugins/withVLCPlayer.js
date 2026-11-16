const { withDangerousMod, withAppBuildGradle, withMainApplication } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Expo Config Plugin for standalone Android LibVLC player.
 * Configures Android only. Does not touch or alter iOS.
 */

// ─── 1. Copy VLC Java bridge files into android/app/src/main/java/com/vijayyuvi/vstreamonline/vlc/ ────

const withVLCBridgeFiles = (config) => {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const vlcSourceDir = path.join(
        projectRoot,
        'plugins',
        'vlc-bridge',
        'android',
        'src',
        'main',
        'java',
        'com',
        'vijayyuvi',
        'vstreamonline',
        'vlc'
      );

      const targetDir = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'vijayyuvi',
        'vstreamonline',
        'vlc'
      );

      if (!fs.existsSync(vlcSourceDir)) {
        console.warn('[withVLCPlayer] VLC source bridge directory not found:', vlcSourceDir);
        return mod;
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const files = fs.readdirSync(vlcSourceDir);
      files.forEach((file) => {
        const src = path.join(vlcSourceDir, file);
        const dest = path.join(targetDir, file);
        fs.copyFileSync(src, dest);
        console.log(`[withVLCPlayer] Copied ${file} → android/app/src/main/java/com/vijayyuvi/vstreamonline/vlc/${file}`);
      });

      return mod;
    },
  ]);
};

// ─── 2. Add LibVLC dependency & libc++_shared pickFirst in android/app/build.gradle ──────

const withVLCAppBuildGradle = (config) => {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // 1. Add LibVLC Maven dependency
    const vlcDep = "implementation 'org.videolan.android:libvlc-all:3.6.0'";
    if (!contents.includes('org.videolan.android:libvlc-all')) {
      if (contents.includes('dependencies {')) {
        contents = contents.replace(
          'dependencies {',
          `dependencies {\n    ${vlcDep}`
        );
        console.log('[withVLCPlayer] Added LibVLC dependency to app/build.gradle');
      }
    }

    // 2. Add packagingOptions to prevent libc++_shared.so duplicates
    if (!contents.includes("pickFirst '**/libc++_shared.so'") && !contents.includes('pickFirst "**/libc++_shared.so"')) {
      if (contents.includes('packagingOptions {')) {
        contents = contents.replace(
          'packagingOptions {',
          `packagingOptions {\n        pickFirst '**/libc++_shared.so'`
        );
      } else if (contents.includes('android {')) {
        contents = contents.replace(
          'android {',
          `android {\n    packagingOptions {\n        pickFirst '**/libc++_shared.so'\n    }`
        );
      }
      console.log('[withVLCPlayer] Configured packagingOptions pickFirst for libc++_shared.so');
    }

    mod.modResults.contents = contents;
    return mod;
  });
};

// ─── 3. Register VLCPlayerPackage in MainApplication (Kotlin or Java) ─────────────────

const withVLCMainApplication = (config) => {
  return withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;
    const isKotlin = mod.modResults.language === 'kt';

    // 1. Add import
    const importStatement = isKotlin
      ? 'import com.vijayyuvi.vstreamonline.vlc.VLCPlayerPackage'
      : 'import com.vijayyuvi.vstreamonline.vlc.VLCPlayerPackage;';

    if (!contents.includes('com.vijayyuvi.vstreamonline.vlc.VLCPlayerPackage')) {
      contents = contents.replace(
        /package com\.vijayyuvi\.vstreamonline/,
        `package com.vijayyuvi.vstreamonline\n\n${importStatement}`
      );
    }

    // 2. Add to getPackages()
    if (isKotlin) {
      if (!contents.includes('VLCPlayerPackage()')) {
        if (contents.includes('PackageList(this).packages.apply {')) {
          contents = contents.replace(
            'PackageList(this).packages.apply {',
            'PackageList(this).packages.apply {\n              add(VLCPlayerPackage())'
          );
        } else if (contents.includes('PackageList(this).packages')) {
          contents = contents.replace(
            'PackageList(this).packages',
            'PackageList(this).packages.apply {\n              add(VLCPlayerPackage())\n            }'
          );
        }
        console.log('[withVLCPlayer] Registered VLCPlayerPackage in MainApplication.kt');
      }
    } else {
      if (!contents.includes('new VLCPlayerPackage()')) {
        if (contents.includes('new PackageList(this).getPackages()')) {
          contents = contents.replace(
            'List<ReactPackage> packages = new PackageList(this).getPackages();',
            'List<ReactPackage> packages = new PackageList(this).getPackages();\n      packages.add(new VLCPlayerPackage());'
          );
        }
        console.log('[withVLCPlayer] Registered VLCPlayerPackage in MainApplication.java');
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });
};

// ─── Compose ──────────────────────────────────────────────────────────────────

module.exports = (config) => {
  config = withVLCBridgeFiles(config);
  config = withVLCAppBuildGradle(config);
  config = withVLCMainApplication(config);
  return config;
};
