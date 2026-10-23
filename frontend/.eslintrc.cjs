module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  ignorePatterns: ['dist/', 'node_modules/'],
  plugins: ['@typescript-eslint', 'react-hooks'],
  reportUnusedDisableDirectives: true,
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
    'react-hooks/rules-of-hooks': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-debugger': 'error',
  },
};
