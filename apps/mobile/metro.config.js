const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro in a pnpm workspace.
 *
 * Three things have to be true for `@ct/shared` and `@ct/api-client` to resolve
 * from here, and none of them is Metro's default when the project is a
 * subdirectory:
 *
 *   1. The repo root has to be watched, or an edit in `packages/` never
 *      triggers a reload — and the files are not even readable.
 *   2. `nodeModulesPaths` has to include the root store, because pnpm leaves
 *      most of a package's dependencies outside the app's own `node_modules`.
 *   3. Hierarchical lookup has to stay on. pnpm's isolated layout *is* the
 *      hierarchy: `zod` lives in `packages/shared/node_modules`, and turning
 *      the walk off strands it.
 *
 * The workspace packages are consumed as TypeScript source (`main` points at
 * `src/index.ts`) and their internal imports carry the `.ts` extension, which
 * Metro resolves literally and Babel strips — the same arrangement that lets
 * the API import them without a build step.
 */
const workspaceRoot = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
