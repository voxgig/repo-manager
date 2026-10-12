// The drift matrix (SPEC §14.3): every (repo, policy) cell, not just the
// non-compliant ones sync_item.ts turns into rpm/item rows - the full grid,
// read-only. Each cell's `status` is one of SPEC §14.3's four: compliant,
// drifted, not-applicable, error.
//
// Reads rpm/driftcell from the store rather than re-running runPolicy per
// (repo, policy) on every page load (SPEC §9, "sync, not proxy"). The live
// version was the slowest view in the app: each cell costs its own
// aim:forge,get:file calls, so 32 repos x 3 policies ran ~190 sequential
// round trips before anything rendered. syncDrift already evaluates every
// cell - it just used to discard all but the drifted ones.

const { SEED_POLICIES } = require('./check_policy')

module.exports = function make_list_drift() {
  return async function list_drift(this: any, msg: any) {
    const seneca = this
    const repo_ids: string[] = msg.repo_ids || []

    const rows = await seneca.entity('rpm/driftcell').list$()

    const cells = rows
      .filter((row: any) => repo_ids.includes(row.repo))
      .map((row: any) => ({
        repo: row.repo, policy_id: row.policy_id, status: row.status, why: row.why,
      }))

    return {
      ok: true,
      policies: SEED_POLICIES.map((p: any) => ({ id: p.id, description: p.description })),
      cells,
    }
  }
}
