// The Issues nav view - repo_ids sourced from env, same pattern as sync
// and the Pull requests view.

module.exports = function make_web_list_issue() {
  return async function web_list_issue(this: any, _msg: any) {
    const repos = process.env.REPO_MANAGER_REPOS
    if (!repos) {
      return { ok: false, why: 'not-configured' }
    }
    const res = await this.post({ aim: 'inbox', list: 'issue', repo_ids: repos.split(',') })
    return res.ok ? { ok: true, issues: res.issues } : { ok: false }
  }
}
