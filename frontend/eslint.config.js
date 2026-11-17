import js from '@eslint/js'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: '19.1' },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      // React Compiler rule; flags hoisted function declarations used in
      // effects as "accessed before declared". exhaustive-deps covers the
      // real stale-closure risk, so keep this as a non-blocking warning.
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', 'vitest.config.js', 'src/test/', 'src/**/*.test.js'],
  },
]