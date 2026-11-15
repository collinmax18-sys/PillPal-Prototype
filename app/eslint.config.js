// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// import/namespace cannot resolve expo-notifications' TypeScript re-exports (tsc checks these).
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: { 'import/namespace': 'off' },
  },
]);
