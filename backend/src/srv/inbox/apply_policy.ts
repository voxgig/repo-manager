// `apply` (SPEC §14.2 continuing past "detect changes": commit, push,
// open/update PR), gated by the safety checks (§15) that are cheap and
// inseparable from writing at all: S1, S2, S3, S4, S5, S6, S7, S8, S9, S10.
// S11 (rate-limit backoff/concurrency) is deferred - this slice processes
// repos sequentially, same as plan_policy.ts, so there's nothing to rate-
// limit yet. S12/S13 don't apply here (inbox merge/campaign concerns).
//
// CLI-only, same reasons as plan_policy.ts: no aim:web proxy, no filesystem
// on the Cloudflare target, deliberately absent from
// env/cloudflare/handler-map.ts.
//
// S1 ("dry-run by default") is why this message's own confirmation gate
// lives here, not only in the CLI - calling the message directly (as tests
// do) can't bypass it either.

const Path = require('node:path')
const Fs = require('node:fs')
const { SEED_POLICIES } = require('./check_policy')
const { runApply, appliesLocally } = require('./apply_action')
const { scanForSecrets } = require('./secret_scan')
const GitRepo = require('./git_repo')

const BRANCH_PREFIX = 'repo-manager/'

module.exports = function make_apply_policy() {
  return async function apply_policy(this: any, msg: any) {
    const seneca = this
    const repo_ids: string[] = msg.repo_ids || []
    const policy_ids: string[] | undefined = msg.policy_ids
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'
    const token: string = process.env.GITHUB_TOKEN || ''
    // Test-only seam: a real local bare-repo path per repo_id, so unit
    // tests can exercise the real git flow AND real forge:mem actions
    // (get:branch_rules/list:pr/open:pr) together, without forge:mem's
    // fake repo_ids needing to resolve to a real github.com URL. Never
    // set in production - cloneUrlFor's own forge:github requirement
    // stays the only path with no override present.
    const cloneUrls: Record<string, string> = msg.clone_urls || {}

    // S1: dry-run by default - apply requires explicit, specific
    // confirmation. Checked here, not only in the CLI, so the message
    // itself can't be called into writing by accident.
    if (true !== msg.confirmed) {
      return { ok: false, why: 'apply requires confirmation (S1) - pass --yes' }
    }

    if ('github' !== forge && 0 === Object.keys(cloneUrls).length) {
      return { ok: false, why: `apply requires forge:github (real git history) - got: ${forge}` }
    }

    // S5: bounded blast radius - abort before any repo is touched, not a
    // per-repo skip once over the line.
    const limit = undefined !== msg.limit ? msg.limit : 10
    if (repo_ids.length > limit) {
      return { ok: false, why: `apply would touch ${repo_ids.length} repos, over the limit of ${limit} (S5)`, repo_ids }
    }

    const policies = (policy_ids
      ? policy_ids.map((id) => SEED_POLICIES.find((p: any) => p.id === id)).filter(Boolean)
      : SEED_POLICIES.filter((p: any) => p.apply))

    // S6: a branch name derived from the policy SET, not the run - a second
    // apply against the same policies targets the exact same branch, so an
    // unchanged upstream state reuses it (addWorktreeOnBranch checks it
    // out as-is) and reports no-op, rather than drifting a new branch name
    // every run.
    const branchName = BRANCH_PREFIX + policies.map((p: any) => p.id).sort().join('-')

    const workspace = GitRepo.workspaceDir()
    const runId = Date.now().toString(36)
    const runsDir = Path.join(workspace, 'runs')
    Fs.mkdirSync(runsDir, { recursive: true })
    const runRecordPath = Path.join(runsDir, runId + '.jsonl')
    function recordLine(entry: any) {
      Fs.appendFileSync(runRecordPath, JSON.stringify(entry) + '\n')
    }

    const repos: any[] = []
    for (const repo_id of repo_ids) {
      const result = await applyRepo(repo_id)
      recordLine(result)
      repos.push(result)
    }
    recordLine({
      run_summary: true, runId,
      counts: repos.reduce((acc: any, r: any) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      }, {}),
    })

    return { ok: true, runId, runRecord: runRecordPath, repos }

    // Self-contained, one try/catch per repo (SPEC S7) - same idiom
    // plan_policy.ts's planRepo() already established. No outer try/catch
    // around the caller's loop - one bad repo never aborts the run.
    async function applyRepo(repo_id: string) {
      try {
        const [owner, repo] = repo_id.split('/')
        const url = cloneUrls[repo_id] || GitRepo.cloneUrlFor(forge, repo_id)
        const mirror = GitRepo.mirrorPathFor(workspace, repo_id)
        await GitRepo.ensureMirror(mirror, url, token)

        const baseBranch = await GitRepo.resolveDefaultBranch(url, token)

        // S10: existing work is never clobbered. Checked against the
        // MIRROR (which ensureMirror just refreshed to the remote's
        // current state), before any worktree/commit is attempted.
        if (await GitRepo.hasForeignCommits(mirror, baseBranch, branchName)) {
          return { repo_id, status: 'skipped', why: 'existing work: branch has commits not authored by this tool (S10)' }
        }

        // S2: query the EFFECTIVE branch protection/rulesets for the
        // computed branch name, by name, before it's even created -
        // catches a wildcard ruleset (e.g. repo-manager/*) that would
        // protect this branch even though it doesn't exist yet.
        const rulesRes = await seneca.post({ aim: 'forge', get: 'branch_rules', forge, repo_id, branch: branchName })
        if (!rulesRes.ok) {
          return { repo_id, status: 'failed', why: rulesRes.why || 'could not check branch rules' }
        }
        if (0 < rulesRes.rules.length) {
          return { repo_id, status: 'skipped', why: `branch ${branchName} is protected by an effective rule (S2)` }
        }

        // Deterministic per (repo, branch), not per-run like plan_policy.ts's
        // runId-keyed worktrees - see addWorktreeOnBranch's own comment.
        const worktreeDir = Path.join(workspace, 'work', owner, repo, branchName.replace(/\//g, '-'))
        await GitRepo.addWorktreeOnBranch(mirror, baseBranch, branchName, worktreeDir)

        const applied: any[] = []
        for (const policy of policies as any[]) {
          if (!policy.apply) {
            applied.push({ policy_id: policy.id, status: 'skip', why: 'policy has no apply actions' })
            continue
          }
          if (!appliesLocally(worktreeDir, policy)) {
            applied.push({ policy_id: policy.id, status: 'not-applicable' })
            continue
          }
          runApply(worktreeDir, repo_id, policy)
          applied.push({ policy_id: policy.id, status: 'applied' })
        }

        const files = await GitRepo.statusPorcelain(worktreeDir)

        // S6: idempotency. No diff means nothing to converge on - no
        // commit, no push, no PR call at all.
        if (0 === files.length) {
          return { repo_id, status: 'no-op', branch: branchName, worktree: worktreeDir, policies: applied }
        }

        // S8: no secrets written. A hit fails this repo before any commit.
        const scan = scanForSecrets(worktreeDir, files.map((f: any) => f.path))
        if (!scan.clean) {
          return { repo_id, status: 'failed', why: `secret detected in ${scan.path}: ${scan.why} (S8)`, branch: branchName, worktree: worktreeDir }
        }

        await GitRepo.commitAll(worktreeDir, `repo-manager: ${policies.map((p: any) => p.id).join(', ')}`)
        await GitRepo.pushBranch(worktreeDir, url, token, branchName)

        // S6 continued: adopt an existing open PR for this head rather
        // than ever opening a second one.
        const listRes = await seneca.post({ aim: 'forge', list: 'pr', forge, repo_id })
        const existing = listRes.ok && listRes.prs.find((pr: any) => pr.head_ref === branchName)
        if (existing) {
          return { repo_id, status: 'pr-updated', branch: branchName, worktree: worktreeDir, policies: applied, pr_url: existing.url }
        }

        const openRes = await seneca.post({
          aim: 'forge', open: 'pr', forge, repo_id,
          head: branchName, base: baseBranch,
          title: `repo-manager: ${policies.map((p: any) => p.id).join(', ')}`,
          body: `Automated by repo-manager.\n\nPolicies: ${policies.map((p: any) => p.id).join(', ')}`,
        })
        if (!openRes.ok) {
          return { repo_id, status: 'failed', why: openRes.why || 'could not open PR', branch: branchName, worktree: worktreeDir }
        }
        return { repo_id, status: 'pr-opened', branch: branchName, worktree: worktreeDir, policies: applied, pr_url: openRes.pr.url }
      }
      catch (err: any) {
        return { repo_id, status: 'failed', why: err.message || 'apply failed' }
      }
    }
  }
}
