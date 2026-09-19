import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // A lockfile exists in the parent directory, so pin the workspace root explicitly
  // rather than letting it be inferred.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
