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

// `apply`'s equivalent of addWorktree, on a real (non-detached) branch - and
// the mechanism behind SPEC S6 idempotency without ever force-pushing (S3):
// if branchName already exists (a previous apply already pushed it), check
// it out as-is rather than re-branching from baseBranch, so an unchanged
// re-apply (identical, deterministic template rendering) produces an empty
// diff and apply_policy.ts reports no-op before any commit/push is even
// attempted. Only a brand-new branch name branches fresh from baseBranch.
// Known limitation, not handled this slice: if baseBranch has moved on since
// the tool branch was created, this does not rebase onto it - the branch
// just re-applies against its own existing tip.
async function addWorktreeOnBranch(mirrorPath: string, baseBranch: string, branchName: string, worktreeDir: string): Promise<void> {
  // worktreeDir is deterministic per (repo, branch) in apply_policy.ts, not
  // per-run like plan's --detach worktrees - git refuses to check out the
  // same real (non-detached) branch into a second worktree directory at
  // once, so a second apply reuses the exact worktree the first one made,
  // already sitting at the branch's current tip, rather than erroring.
  if (Fs.existsSync(worktreeDir)) {
    return
  }
  Fs.mkdirSync(Path.dirname(worktreeDir), { recursive: true })
  try {
    await execFileP('git', ['-C', mirrorPath, 'rev-parse', '--verify', 'refs/heads/' + branchName])
    await execFileP('git', ['-C', mirrorPath, 'worktree', 'add', worktreeDir, branchName])
  }
  catch {
    await execFileP('git', ['-C', mirrorPath, 'worktree', 'add', '-b', branchName, worktreeDir, baseBranch])
  }
}

// Fixed, not a persisted git config - keeps every tool commit attributable
// without touching the worktree's own user.name/email (same non-persisting
// discipline as authFlag()).
const BOT_AUTHOR_NAME = 'repo-manager-bot'
const BOT_AUTHOR_EMAIL = 'repo-manager-bot@users.noreply.github.com'

function botIdentityFlags(): string[] {
  return ['-c', 'user.name=' + BOT_AUTHOR_NAME, '-c', 'user.email=' + BOT_AUTHOR_EMAIL]
}

async function commitAll(worktreeDir: string, message: string): Promise<void> {
  await execFileP('git', ['-C', worktreeDir, 'add', '-A'])
  await execFileP('git', [...botIdentityFlags(), '-C', worktreeDir, 'commit', '-m', message])
}

async function pushBranch(worktreeDir: string, url: string, token: string, branch: string): Promise<void> {
  // Never --force (S3) - every push here is either a brand-new branch or
  // one only this tool has ever committed to (S10 already gated the
  // alternative out before this is called), so a plain push always works.
  await execFileP('git', [...authFlag(token), '-C', worktreeDir, 'push', url, branch])
}

// SPEC S10: "a tool-branch carrying commits it did not author means that
// repo is skipped." ensureMirror's own fetch/clone already lands the
// remote's current refs/heads/* directly into the mirror (a bare clone's
// default refspec), so no separate fetch is needed here - just read what's
// already there. A branch that doesn't exist yet has nothing foreign by
// definition (it's about to be created fresh from baseBranch).
//
// `baseBranch..branch`, not a plain log of branch - branch was created FROM
// baseBranch, so a plain log also walks baseBranch's own pre-existing
// history (its initial commit, authored by whoever owns the repo, not the
// bot) and would misreport every repo as foreign. The range restricts this
// to commits unique to the tool branch, which is the only thing S10 means.
async function hasForeignCommits(mirrorPath: string, baseBranch: string, branch: string): Promise<boolean> {
  try {
    await execFileP('git', ['-C', mirrorPath, 'rev-parse', '--verify', 'refs/heads/' + branch])
  }
  catch {
    return false
  }
  const { stdout } = await execFileP('git', ['-C', mirrorPath, 'log', `refs/heads/${baseBranch}..refs/heads/${branch}`, '--format=%ae'])
  return stdout.split('\n').filter(Boolean).some((email) => email !== BOT_AUTHOR_EMAIL)
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
  addWorktreeOnBranch,
  commitAll,
  pushBranch,
  hasForeignCommits,
  statusPorcelain,
  diffFor,
  BOT_AUTHOR_EMAIL,
}
