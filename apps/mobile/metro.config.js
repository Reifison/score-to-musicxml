const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileNodeModules = path.resolve(projectRoot, "node_modules");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
// Native builds and local evidence are generated inside the monorepo. Watching
// them can reload a running player while Xcode compiles or a capture is saved.
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const generatedPaths = [
  path.join(projectRoot, "ios", "build"),
  path.join(projectRoot, "android", "build"),
  path.join(projectRoot, "android", "app", "build"),
  path.join(workspaceRoot, "apps", "web", "dist"),
  path.join(workspaceRoot, "docs", "validation"),
];
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  ...generatedPaths.map((directory) => new RegExp(`^${escapePattern(directory)}(?:[/\\\\].*)?$`)),
];
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
