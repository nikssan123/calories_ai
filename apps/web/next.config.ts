import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // The shared packages ship TypeScript source rather than build output.
  transpilePackages: ['@ct/shared', '@ct/api-client'],
  // Self-contained server bundle for the container image.
  output: 'standalone',
  // pnpm workspaces symlink into the repo root, so tracing has to start there
  // or the standalone build misses @ct/shared and @ct/api-client.
  outputFileTracingRoot: path.join(here, '../..'),
};

export default config;
