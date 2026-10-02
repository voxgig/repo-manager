// SPEC §14.1's apply action executors, against a real worktree on disk
// (plan_policy.ts has already cloned + checked one out by the time these
// run). One action kind for this slice: file.write. json.merge/yaml.merge/
// text.replace/exec/repo.settings each need their own executor and aren't
// modeled yet.

import Fs from 'node:fs'
import Path from 'node:path'

// Literal substring replace, not a {{\w+}} regex scanner - the standard-ci
// template itself contains GitHub Actions' own ${{ matrix.node-version }}
// syntax, and a generic token regex risks colliding with that. A single
// known literal has zero collision risk and still extends trivially (one
// more .split().join() per token) if more are ever needed.
function renderTemplate(template: string, context: { repo: string }): string {
  return template.split('{{repo}}').join(context.repo)
}

function runApply(worktreeDir: string, repo_id: string, policy: any): void {
  for (const action of policy.apply || []) {
    if ('file.write' === action.action) {
      const target = Path.join(worktreeDir, action.path)
      Fs.mkdirSync(Path.dirname(target), { recursive: true })
      Fs.writeFileSync(target, renderTemplate(action.template, { repo: repo_id }))
    }
    else {
      // Same "unknown action" idiom as check_policy.ts's runCheck.
      throw new Error(`unknown apply action: ${action.action}`)
    }
  }
}

// The filesystem-local equivalent of check_policy.ts's applies.hasFile gate.
// Deliberately NOT check_policy.ts's own readFile()/aim:forge,get:file - the
// worktree is already on disk by the time this runs, so an API round-trip
// for a file sitting right there would be redundant.
function appliesLocally(worktreeDir: string, policy: any): boolean {
  if (!policy.applies || !policy.applies.hasFile) {
    return true
  }
  return Fs.existsSync(Path.join(worktreeDir, policy.applies.hasFile))
}

module.exports = { renderTemplate, runApply, appliesLocally }
