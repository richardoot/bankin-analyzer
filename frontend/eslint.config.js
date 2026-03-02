import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import * as parserVue from 'vue-eslint-parser'
import eslintConfigPrettier from 'eslint-config-prettier'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import {
  sharedIgnores,
  sharedJavaScriptConfig,
  prettierConfig,
} from '../eslint.config.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default [
  // Ignore config files for TypeScript parsing
  {
    ignores: ['eslint.config.js', 'vite.config.ts'],
  },

  // Import shared configurations
  sharedIgnores,
  js.configs.recommended,

  // Vue-specific configurations
  ...pluginVue.configs['flat/recommended'],
  ...vueTsEslintConfig({ rootDir: __dirname }),

  // Shared rules
  sharedJavaScriptConfig,

  // Override TypeScript config for Vue
  {
    name: 'frontend/typescript',
    files: ['**/*.{ts,tsx,vue}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        extraFileExtensions: ['.vue'],
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
    },
  },

  // Vue-specific rules
  {
    name: 'frontend/vue-rules',
    files: ['**/*.vue'],
    languageOptions: {
      parser: parserVue,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    rules: {
      // Interdire les blocs <style> (forcer Tailwind CSS)
      'vue/block-order': [
        'error',
        {
          order: ['script', 'template'], // Pas de style autorisé
        },
      ],
      'vue/multi-word-component-names': 'off',
      'vue/component-definition-name-casing': ['error', 'PascalCase'],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/define-macros-order': [
        'error',
        {
          order: ['defineOptions', 'defineProps', 'defineEmits', 'defineSlots'],
        },
      ],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/no-empty-component-block': 'error',
      'vue/no-undef-components': [
        'error',
        {
          ignorePatterns: ['RouterLink', 'RouterView'],
        },
      ],
      'vue/no-unused-emit-declarations': 'error',
      'vue/no-unused-refs': 'error',
      'vue/block-lang': [
        'error',
        {
          script: { lang: 'ts' },
        },
      ],
      'vue/no-template-target-blank': 'error',
    },
  },

  eslintConfigPrettier,
  prettierConfig,
]
