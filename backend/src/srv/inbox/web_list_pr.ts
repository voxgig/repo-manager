// The Pull requests nav view - repo_ids sourced from env, same as sync
// (SPEC §13.4: the browser triggers, it never chooses what).

module.exports = function make_web_list_pr() {
  return async function web_list_pr(this: any, _msg: any) {
    const repos = process.env.REPO_MANAGER_REPOS
    if (!repos) {
      return { ok: false, why: 'not-configured' }
    }
    const res = await this.post({ aim: 'inbox', list: 'pr', repo_ids: repos.split(',') })
    return res.ok ? { ok: true, prs: res.prs } : { ok: false }
  }
}
