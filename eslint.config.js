import js from '@eslint/js';
import globals from 'globals';

const noInnerHtml = {
  selector: 'AssignmentExpression > MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
  message: 'Tab data is untrusted: build DOM with createElement/textContent.',
};

export default [
  { ignores: ['coverage/', 'dist/', 'node_modules/', '.superpowers/', '.agents/', '.claude/'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error', noInnerHtml],
    },
  },
  {
    files: ['background/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.webextensions },
    },
  },
  {
    files: ['content/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions, HoverHelper: 'readonly' },
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
