module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.test.json',
    tsconfigRootDir: __dirname,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: ['dist/', 'node_modules/'],
  plugins: ['@typescript-eslint'],
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
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-debugger': 'error',
  },
};
