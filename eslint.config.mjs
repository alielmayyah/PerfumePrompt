import next from 'eslint-config-next';
import coreWebVitals from 'eslint-config-next/core-web-vitals';

// eslint-config-next declares the @typescript-eslint plugin inside its own
// TypeScript config object. Reuse that instance so the extra rules below can
// reference it without adding a duplicate dependency.
const typescriptPlugins = next.find((entry) => entry.plugins?.['@typescript-eslint'])?.plugins ?? {};

const config = [
  { ignores: ['.next/**', 'node_modules/**', '.data/**', 'public/**'] },
  ...next,
  ...coreWebVitals,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: typescriptPlugins,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
