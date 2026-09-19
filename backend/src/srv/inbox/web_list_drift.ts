// The Drift matrix nav view - repo_ids sourced from env, same as sync and
// the other browse views (SPEC §13.4: the browser triggers, it never
// chooses what).

module.exports = function make_web_list_drift() {
  return async function web_list_drift(this: any, _msg: any) {
    const repos = process.env.REPO_MANAGER_REPOS
    if (!repos) {
      return { ok: false, why: 'not-configured' }
    }
    const res = await this.post({ aim: 'inbox', list: 'drift', repo_ids: repos.split(',') })
    return res.ok ? { ok: true, policies: res.policies, cells: res.cells } : { ok: false }
  }
}
