import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser
    },
    rules: {
      // `any` turns the checks off: each one needs an eslint-disable comment that says why
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Types are imported as types, so Vite drops them and Node's type stripping can run the tests
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  },
  {
    // This file and the tests run on Node
    files: ['eslint.config.js', 'vite.config.ts', 'src/**/*.test.ts'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended]
  }
])
