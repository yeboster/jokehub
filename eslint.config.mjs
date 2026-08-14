// Flat ESLint config for the Next.js 16 app.
// Uses the official `eslint-config-next` v16 flat export directly —
// no FlatCompat shim needed (the package ships a flat array-of-objects
// config in its `core-web-vitals` and `typescript` entry points).

import nextConfig from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'next-env.d.ts',
      // Local automation scratchpad — not part of the source tree.
      '.hermes/**',
      // Firebase CLI + migration outputs.
      'migrations/**',
      'firebase-debug.log',
      'firebase-debug.*.log',
    ],
  },
  ...nextConfig,
  ...nextTs,
  {
    rules: {
      // Enforce trailing newlines project-wide.
      'eol-last': ['error', 'always'],
      // Keep React hook dependency warnings actionable (default is 'warn'
      // upstream; promote so missing-deps bugs surface in CI).
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

export default config;
