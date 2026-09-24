// The Fleet sidebar's external-contributor filter - repo_ids sourced from
// env like every other browse view; org comes from the click itself (the
// one thing the browser does choose, same as which item is focused).

module.exports = function make_web_list_external() {
  return async function web_list_external(this: any, msg: any) {
    const repos = process.env.REPO_MANAGER_REPOS
    if (!repos || !msg.org) {
      return { ok: false, why: 'not-configured' }
    }
    const res = await this.post({ aim: 'inbox', list: 'external', org: msg.org, repo_ids: repos.split(',') })
    return res.ok ? { ok: true, org: res.org, prs: res.prs, member_count: res.member_count } : { ok: false }
  }
}
