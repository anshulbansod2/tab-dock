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
    // The team's size limits (functions under 50 lines, files under 400). Content scripts are
    // IIFE-wrapped, so the wrapper itself is exempt.
    files: ['background/**/*.js', 'content/**/*.js', 'popup/**/*.js', 'scripts/**/*.js'],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: false },
      ],
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
    files: ['popup/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ['content/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions, TabDock: 'readonly' },
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
