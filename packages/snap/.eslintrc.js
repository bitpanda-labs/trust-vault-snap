module.exports = {
  extends: ['../../.eslintrc.js'],

  parserOptions: {
    tsconfigRootDir: __dirname,
  },

  overrides: [
    {
      files: ['snap.config*.ts'],
      extends: ['@metamask/eslint-config-nodejs'],
      rules: {
        '@typescript-eslint/naming-convention': 'off',
      },
    },
    {
      files: ['*.test.ts'],
      rules: {
        '@typescript-eslint/unbound-method': 'off',
      },
    },
  ],

  rules: {
    'import/no-nodejs-modules': 'off',
  },

  ignorePatterns: ['!.eslintrc.js', 'dist/'],
};
