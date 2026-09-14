// Copy to env.local.js (gitignored) to stop re-exporting these every
// session - web.ts/cli.ts load it via @seneca/env's `file` option, then
// backfill process.env so every existing process.env.X read keeps working.
//
// GITHUB_TOKEN is computed live via `gh auth token` rather than stored as
// a literal secret on disk - swap for a static string if you don't use
// the gh CLI, but prefer this if you do.

const { execSync } = require('child_process')

module.exports = {
  GITHUB_TOKEN: execSync('gh auth token').toString().trim(),
  REPO_MANAGER_REPOS: 'owner/repo,owner/repo2',
  REPO_MANAGER_GITHUB_USER: 'your-github-username',
}
