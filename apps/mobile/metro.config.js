/**
 * Metro : résolution du paquet partagé `@memo/shared` compilé depuis le monorepo.
 * On évite ainsi toute duplication des types, schémas Zod et règles métier entre
 * le Web, l'Android et l'API (exigence d'architecture du cahier des charges).
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;
config.resolver.extraNodeModules = {
  '@memo/shared': path.resolve(workspaceRoot, 'packages/shared/dist/index.js'),
};

module.exports = config;
