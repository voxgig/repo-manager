// PR detail view: the single-PR load, not the list-endpoint shape - the
// description, diff stats and mergeability list:pr's response doesn't
// carry. Works for both a WorkItem-backed row (subject_id) and a raw
// Pull requests browse row (same field) - there's no rpm/item here either
// way, just repo_id + the forge-native PR number.

module.exports = function make_load_pr() {
  return async function load_pr(this: any, msg: any) {
    const seneca = this
    const res = await seneca.post({
      aim: 'forge', load: 'pr', forge: msg.forge || process.env.REPO_MANAGER_FORGE || 'github',
      repo_id: msg.repo_id, pr_id: msg.pr_id,
    })
    return res.ok ? { ok: true, pr: res.pr } : { ok: false, why: res.why || 'load-failed' }
  }
}
