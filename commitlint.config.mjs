export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Subjects are written in sentence case ("feat: Add ..."), which the preset rejects by default.
    'subject-case': [0],
    // Allowed commit types; anything else fails.
    'type-enum': [
      2,
      'always',
      [
        'feat', // a new feature
        'fix', // a bug fix
        'docs', // documentation only
        'style', // formatting, no code change
        'refactor', // code change that neither fixes a bug nor adds a feature
        'perf', // performance improvement
        'test', // adding or fixing tests
        'build', // build system or dependencies (npm, Angular CLI, images)
        'ci', // CI configuration (GitHub Actions)
        'chore', // other maintenance that doesn't touch src or tests
        'revert', // reverts a previous commit
      ],
    ],
  },
};
