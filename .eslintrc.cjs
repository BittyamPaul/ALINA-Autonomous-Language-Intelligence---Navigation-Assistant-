module.exports = {
  root: true,
  extends: [require.resolve('./packages/config/eslint/index.js')],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'out/',
    'target/',
    '.turbo/',
    '*.config.js',
    '*.config.mjs'
  ]
};
