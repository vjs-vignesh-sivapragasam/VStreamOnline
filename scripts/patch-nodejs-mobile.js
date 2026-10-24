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
  if (content.includes('!= "${_nodeVersionRequired}"')) {
    content = content.replace(
      '!= "${_nodeVersionRequired}"',
      '< "${_nodeVersionRequired}"'
    );
    fs.writeFileSync(androidGradlePath, content, 'utf8');
    console.log('✅ Patched nodejs-mobile-react-native android build.gradle');
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
