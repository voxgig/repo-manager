// `plan` (SPEC §14.2, through "detect changes" only - no commit/push/PR/run
// records yet, see this project's own plan doc). CLI-only: no aim:web proxy
// exists for this message, and none should - no filesystem on the
// Cloudflare target, and this file is deliberately absent from
// env/cloudflare/handler-map.ts so it's never bundled into that target at
// all, same mechanism that already keeps other Node-only code out of it.
//
// S1 ("plan never writes") holds here by construction, not by convention -
// nothing below calls git commit, git push, or any aim:forge write action.

const Path = require('node:path')
const { SEED_POLICIES } = require('./check_policy')
const { runApply, appliesLocally } = require('./apply_action')
const GitRepo = require('./git_repo')

module.exports = function make_plan_policy() {
  return async function plan_policy(this: any, msg: any) {
    const repo_ids: string[] = msg.repo_ids || []
    const policy_ids: string[] | undefined = msg.policy_ids
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'
    const token: string = process.env.GITHUB_TOKEN || ''
    const wantDiff = !!msg.diff

    // A config problem, not N doomed per-repo clone attempts - plan needs a
    // real git remote (mem has no history, gitlab isn't supported here).
    if ('github' !== forge) {
      return { ok: false, why: `plan requires forge:github (real git history) - got: ${forge}` }
    }

    const policies = (policy_ids
      ? policy_ids.map((id) => SEED_POLICIES.find((p: any) => p.id === id)).filter(Boolean)
      : SEED_POLICIES.filter((p: any) => p.apply))

    const workspace = GitRepo.workspaceDir()
    const runId = Date.now().toString(36)

    const repos: any[] = []
    for (const repo_id of repo_ids) {
      repos.push(await planRepo(repo_id))
    }
    return { ok: true, repos }

    // Self-contained: every failure becomes a returned {ok:false, why}, not
    // a throw - same idiom check_policy.ts's readFile() already uses. No
    // outer try/catch around the caller's loop is needed or wanted - this
    // function never throws, so one bad repo can't abort the others
    // (SPEC S7).
    async function planRepo(repo_id: string) {
      try {
        const [owner, repo] = repo_id.split('/')
        const url = GitRepo.cloneUrlFor(forge, repo_id)
        const mirror = GitRepo.mirrorPathFor(workspace, repo_id)
        await GitRepo.ensureMirror(mirror, url, token)

        const branch = await GitRepo.resolveDefaultBranch(url, token)
        const worktreeDir = Path.join(workspace, 'work', owner, repo, runId)
        await GitRepo.addWorktree(mirror, branch, worktreeDir)

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
        const diff = wantDiff ? await GitRepo.diffFor(worktreeDir) : undefined

        return {
          repo_id, ok: true, branch, worktree: worktreeDir,
          policies: applied, changed: 0 < files.length, files, diff,
        }
      }
      catch (err: any) {
        return { repo_id, ok: false, why: err.message || 'plan failed' }
      }
    }
  }
}
