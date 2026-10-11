const { withProjectBuildGradle } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// 荣耀 Honor 的 Gradle asplugin（com.hihonor.mcs.asplugin）在配置期会扫描根 build.gradle，
// 要求 buildscript 依赖里存在带**显式版本**的 AGP classpath（com.android.tools.build:gradle:<版本>）。
// 但 Expo SDK 54 模板写的是无版本的 classpath('com.android.tools.build:gradle')（版本由 settings.gradle
// 的 version catalog / expo-root-project 统一管理），于是荣耀插件抛出
// “com.android.tools.build:gradle is not set in the build.gradle file” 直接让构建失败。
// 这里在 prebuild 时把版本补成 RN version catalog 里 agp 的同一版本——纯文本补全，不改实际使用的 AGP。
function readAgpVersion(projectRoot) {
  try {
    const rnPkg = require.resolve("react-native/package.json", {
      paths: [projectRoot],
    });
    const toml = fs.readFileSync(
      path.join(path.dirname(rnPkg), "gradle", "libs.versions.toml"),
      "utf8"
    );
    const m = toml.match(/^\s*agp\s*=\s*"([^"]+)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

module.exports = function withHonorAgpClasspath(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    const agp = readAgpVersion(cfg.modRequest.projectRoot);
    if (!agp) return cfg;
    // (?!:) 跳过已带版本的 classpath，保证幂等（不带 --clean 重复 prebuild 也不会写坏）。
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /com\.android\.tools\.build:gradle(?!:)/g,
      `com.android.tools.build:gradle:${agp}`
    );
    return cfg;
  });
};
