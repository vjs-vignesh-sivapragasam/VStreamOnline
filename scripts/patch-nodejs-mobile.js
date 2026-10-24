const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. Patch iOS script: ios-build-native-modules.sh
const iosScriptPath = path.join(
  rootDir,
  'node_modules',
  'nodejs-mobile-react-native',
  'scripts',
  'ios-build-native-modules.sh'
);

if (fs.existsSync(iosScriptPath)) {
  let content = fs.readFileSync(iosScriptPath, 'utf8');
  // Allow Node 18 or higher (replace -ne with -lt)
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

// 2. Patch Android build.gradle
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
