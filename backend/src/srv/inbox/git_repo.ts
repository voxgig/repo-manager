// Low-level git helpers for `plan` (SPEC §14.2) - a bare mirror clone cache
// plus a fresh worktree per run, shelled out to the real git binary via
// execFile (argv array, no shell - never exec/execSync for anything built
// from a repo-derived string). Not a Seneca message - plain, independently
// testable functions, same style as check_policy.ts.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import Fs from 'node:fs'
import Os from 'node:os'
import Path from 'node:path'

const execFileP = promisify(execFile)

function workspaceDir(): string {
  return process.env.REPO_MANAGER_WORKSPACE || Path.join(Os.tmpdir(), 'repo-manager')
}

// 'mem' has no real git history and 'gitlab' isn't supported by this slice -
// both throw here rather than attempting a clone that can only fail.
function cloneUrlFor(forge: string, repo_id: string): string {
  if ('github' === forge) {
    return 'https://github.com/' + repo_id + '.git'
  }
  throw new Error(`plan requires forge:github (real git history) - got: ${forge}`)
}

function mirrorPathFor(workspace: string, repo_id: string): string {
  const [owner, repo] = repo_id.split('/')
  return Path.join(workspace, 'mirror', owner, repo)
}

// Auth as its own argv element, never interpolated into the URL and never
// written to any persisted git config - so `git remote -v` against the
// resulting mirror/worktree can never leak the token (SPEC S9's own named
// concern, pre-empted by construction here rather than needing a redactor).
// GitHub's git-over-HTTPS transport wants HTTP Basic (token as username, no
// password), not the Bearer scheme its REST API accepts - confirmed live,
// Bearer fails with "invalid credentials".
function authFlag(token: string): string[] {
  const basic = Buffer.from(token + ':').toString('base64')
  return ['-c', 'http.extraheader=Authorization: Basic ' + basic]
}

async function ensureMirror(mirrorPath: string, url: string, token: string): Promise<void> {
  // authFlag() (-c ...) always comes before the subcommand - confirmed
  // live that `fetch` (unlike `clone`) rejects a trailing -c outright, so
  // the global-flags-first form is used consistently rather than relying
  // on per-subcommand leniency that isn't even consistent within git itself.
  if (Fs.existsSync(mirrorPath)) {
    await execFileP('git', [...authFlag(token), '-C', mirrorPath, 'fetch', 'origin'])
  }
  else {
    Fs.mkdirSync(Path.dirname(mirrorPath), { recursive: true })
    await execFileP('git', [...authFlag(token), 'clone', '--bare', '--filter=blob:none', url, mirrorPath])
  }
}

async function resolveDefaultBranch(url: string, token: string): Promise<string> {
  // -c has to come BEFORE the subcommand here, unlike clone/fetch (which
  // both accept their own trailing -c) - ls-remote only accepts the
  // global form; confirmed live, trailing -c fails with "unknown switch".
  const { stdout } = await execFileP('git', [...authFlag(token), 'ls-remote', '--symref', url, 'HEAD'])
  const m = stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)
  if (!m) {
    throw new Error('could not resolve default branch from ls-remote output')
  }
  return m[1]
}

async function addWorktree(mirrorPath: string, branch: string, worktreeDir: string): Promise<void> {
  Fs.mkdirSync(Path.dirname(worktreeDir), { recursive: true })
  await execFileP('git', ['-C', mirrorPath, 'worktree', 'add', '--detach', worktreeDir, branch])
}

async function statusPorcelain(worktreeDir: string): Promise<Array<{ status: string, path: string }>> {
  // --untracked-files=all, not the (default) 'normal' - an entirely-new
  // directory otherwise collapses to just its own path (e.g. ".github/"),
  // not the actual file inside it, which is the common case here: a
  // first-time apply almost always writes into a directory that doesn't
  // exist yet.
  const { stdout } = await execFileP('git', ['-C', worktreeDir, 'status', '--porcelain', '--untracked-files=all'])
  return stdout.split('\n').filter(Boolean).map((line) => ({
    status: line.slice(0, 2).trim(),
    path: line.slice(3),
  }))
}

async function diffFor(worktreeDir: string): Promise<string> {
  // Plain `git diff` shows nothing for untracked files - the common case
  // for a first apply (a brand-new policy file). `add -N` (intent-to-add)
  // marks them without staging their content, so they show as proper new-
  // file diffs; it only touches this throwaway worktree's own index, not
  // the real repo, so S1 still holds.
  await execFileP('git', ['-C', worktreeDir, 'add', '-N', '.'])
  const { stdout } = await execFileP('git', ['-C', worktreeDir, 'diff'])
  return stdout
}

module.exports = {
  workspaceDir,
  cloneUrlFor,
  mirrorPathFor,
  ensureMirror,
  resolveDefaultBranch,
  addWorktree,
  statusPorcelain,
  diffFor,
}
