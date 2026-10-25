const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// ── 1. Patch iOS script: ios-build-native-modules.sh ──────────────────────────
const iosScriptPath = path.join(
  rootDir,
  'node_modules',
  'nodejs-mobile-react-native',
  'scripts',
  'ios-build-native-modules.sh'
);

if (fs.existsSync(iosScriptPath)) {
  let content = fs.readFileSync(iosScriptPath, 'utf8');
  if (content.includes('"$CURRENT_NODE_VERSION" -ne "$DESIRED_NODE_VERSION"')) {
    content = content.replace(
      '"$CURRENT_NODE_VERSION" -ne "$DESIRED_NODE_VERSION"',
      '"$CURRENT_NODE_VERSION" -lt "$DESIRED_NODE_VERSION"'
    );
    fs.writeFileSync(iosScriptPath, content, 'utf8');
    console.log('✅ Patched nodejs-mobile-react-native ios-build-native-modules.sh');
  } else {
    console.log('ℹ️ nodejs-mobile-react-native ios script already patched or check not found');
  }
}

// ── 2. Patch Android build.gradle ─────────────────────────────────────────────
const androidGradlePath = path.join(
  rootDir,
  'node_modules',
  'nodejs-mobile-react-native',
  'android',
  'build.gradle'
);

if (fs.existsSync(androidGradlePath)) {
  let content = fs.readFileSync(androidGradlePath, 'utf8');
  let changed = false;

  if (content.includes('!= "${_nodeVersionRequired}"')) {
    content = content.replace(
      '!= "${_nodeVersionRequired}"',
      '< "${_nodeVersionRequired}"'
    );
    changed = true;
  }

  // Ensure ABI filters in nodejs-mobile restrict CMake to supported ABIs only (arm64-v8a, armeabi-v7a)
  // because nodejs-mobile does not provide 32-bit x86 binaries (libnode.so)
  if (!content.includes('abiFilters "arm64-v8a", "armeabi-v7a"')) {
    content = content.replace(
      /(defaultConfig\s*\{[\s\S]*?externalNativeBuild\s*\{\s*cmake\s*\{)/m,
      '$1\n                abiFilters "arm64-v8a", "armeabi-v7a"'
    );
    content = content.replace(
      /abiFilters\s*=\s*project\(":app"\)\.android\.defaultConfig\.ndk\.abiFilters\s*\?:[^\n]+/g,
      'abiFilters "arm64-v8a", "armeabi-v7a"'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(androidGradlePath, content, 'utf8');
    console.log('✅ Patched nodejs-mobile-react-native android build.gradle');
  }
}

// ── 2b. Patch Android CMakeLists.txt to skip x86 ──────────────────────────────
const cmakeListsPath = path.join(
  rootDir,
  'node_modules',
  'nodejs-mobile-react-native',
  'android',
  'CMakeLists.txt'
);

if (fs.existsSync(cmakeListsPath)) {
  let content = fs.readFileSync(cmakeListsPath, 'utf8');
  if (!content.includes('ANDROID_ABI STREQUAL "x86"')) {
    const skipX86Block = `\nif(ANDROID_ABI STREQUAL "x86")\n    message(STATUS "Skipping x86 for nodejs-mobile-react-native as libnode.so does not support 32-bit x86")\n    return()\nendif()\n`;
    content = content.replace(
      /cmake_minimum_required\([^\)]+\)/i,
      `$&${skipX86Block}`
    );
    fs.writeFileSync(cmakeListsPath, content, 'utf8');
    console.log('✅ Patched nodejs-mobile-react-native CMakeLists.txt to skip unsupported x86 ABI');
  }
}

// ── 3. Patch metro-config loadConfig.js (replace .toReversed() with safe fallback) ─
const metroConfigFiles = [
  path.join(rootDir, 'node_modules', '@expo', 'metro', 'node_modules', 'metro-config', 'src', 'loadConfig.js'),
  path.join(rootDir, 'node_modules', 'metro-config', 'src', 'loadConfig.js'),
];

for (const filePath of metroConfigFiles) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    if (content.includes('configs.toReversed()')) {
      content = content.replace(
        /configs\.toReversed\(\)/g,
        '(configs.toReversed ? configs.toReversed() : configs.slice().reverse())'
      );
      modified = true;
    }

    if (content.includes('reversedConfigs.toReversed()')) {
      content = content.replace(
        /reversedConfigs\.toReversed\(\)/g,
        '(reversedConfigs.toReversed ? reversedConfigs.toReversed() : reversedConfigs.slice().reverse())'
      );
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Patched metro-config toReversed in ${path.relative(rootDir, filePath)}`);
    }
  }
}

// ── 4. Patch expo-updates createUpdatesResources.js (polyfill toReversed) ──────
const createUpdatesPath = path.join(
  rootDir,
  'node_modules',
  'expo-updates',
  'utils',
  'build',
  'createUpdatesResources.js'
);

if (fs.existsSync(createUpdatesPath)) {
  let content = fs.readFileSync(createUpdatesPath, 'utf8');
  const polyfillCode = `if (!Array.prototype.toReversed) { Array.prototype.toReversed = function() { return this.slice().reverse(); }; }\n`;
  if (!content.includes('Array.prototype.toReversed')) {
    content = polyfillCode + content;
    fs.writeFileSync(createUpdatesPath, content, 'utf8');
    console.log('✅ Injected toReversed polyfill into expo-updates createUpdatesResources.js');
  }
}
