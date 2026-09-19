// The drift matrix (SPEC §14.3): every (repo, policy) cell, not just the
// non-compliant ones sync_item.ts turns into rpm/item rows - the full grid,
// read-only, straight from check_policy's own runPolicy.

const { SEED_POLICIES, runPolicy } = require('./check_policy')

module.exports = function make_list_drift() {
  return async function list_drift(this: any, msg: any) {
    const seneca = this
    const repo_ids: string[] = msg.repo_ids || []
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'

    const cells: any[] = []
    for (const repo_id of repo_ids) {
      for (const policy of SEED_POLICIES) {
        const result = await runPolicy(seneca, forge, repo_id, policy)
        cells.push({ repo: repo_id, policy_id: policy.id, compliant: result.compliant, why: result.why })
      }
    }

    return {
      ok: true,
      policies: SEED_POLICIES.map((p: any) => ({ id: p.id, description: p.description })),
      cells,
    }
  }
}
