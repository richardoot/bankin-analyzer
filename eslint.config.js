import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'

// Shared base configuration that workspaces can import and extend
export const sharedIgnores = {
  name: 'shared/ignores',
  ignores: [
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/.vscode/**',
    '**/.idea/**',
    '**/*.d.ts',
  ],
}

export const sharedTypeScriptConfig = {
  name: 'shared/typescript',
  files: ['**/*.{ts,tsx,mts,cts}'],
  plugins: {
    '@typescript-eslint': tseslint.plugin,
  },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-as-const': 'error',
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        disallowTypeAnnotations: false,
      },
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
  },
}

export const sharedJavaScriptConfig = {
  name: 'shared/javascript',
  files: ['**/*.{js,jsx,mjs,cjs}'],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    curly: ['error', 'all'],
  },
}

export const prettierConfig = {
  name: 'shared/prettier',
  plugins: {
    prettier: eslintPluginPrettier,
  },
  rules: {
    'prettier/prettier': 'error',
  },
}

// Root-level configuration (for config files at root)
export default [
  sharedIgnores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sharedJavaScriptConfig,
  eslintConfigPrettier,
  prettierConfig,
  {
    name: 'root/config-files',
    files: ['*.config.{js,ts,mjs}', '*.config.*.{js,ts,mjs}'],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
  },
]
