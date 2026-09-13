module.exports = function make_web_load_pr() {
  return async function web_load_pr(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', load: 'pr', repo_id: msg.repo_id, pr_id: msg.pr_id })
    return res.ok ? { ok: true, pr: res.pr } : { ok: false, why: res.why }
  }
}
