import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // jsdom by default so component/hook tests can be added without further
    // config; the pure-function and server-side suites opt back out with a
    // `// @vitest-environment node` docblock (next/server needs the real
    // Request/Response globals, which jsdom does not provide).
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
