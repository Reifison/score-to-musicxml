const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileNodeModules = path.resolve(projectRoot, "node_modules");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  workspaceNodeModules,
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(mobileNodeModules, "react"),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return {
      type: "sourceFile",
      filePath: require.resolve(moduleName, { paths: [mobileNodeModules] }),
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
