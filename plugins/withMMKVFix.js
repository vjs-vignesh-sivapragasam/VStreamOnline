const { withProjectBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to prevent Android manifest merger conflict in react-native-mmkv.
 * io.github.zhongwuzw:annotation:2.2.4 declares package="com.tencent.mmkv",
 * colliding with io.github.zhongwuzw:mmkv:2.2.4 which declares the same namespace.
 * Excluding the annotation module resolves the conflict completely.
 */
function withMMKVFix(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("module: 'annotation'")) {
      const exclusionCode = `
allprojects {
    configurations.all {
        exclude group: 'io.github.zhongwuzw', module: 'annotation'
    }
}
`;
      mod.modResults.contents += exclusionCode;
    }
    return mod;
  });
}

module.exports = createRunOncePlugin(withMMKVFix, 'withMMKVFix', '1.0.0');
