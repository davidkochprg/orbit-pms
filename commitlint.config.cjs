module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['web', 'api', 'domain', 'db', 'ai', 'shared', 'docs', 'repo', 'deploy'],
    ],
  },
};
