// External-contributor filter (Fleet sidebar, click an org): every open PR
// in that org's configured repos whose author isn't a real GitHub member of
// the org. One aim:forge,get:members call per invocation (not per repo),
// then the same aim:forge,list:pr sweep list_pr.ts already does, filtered.
//
// member_count comes back too - GitHub only returns PUBLIC members unless
// the authenticated user is itself a member of the org, so an org with
// fully concealed membership (and we aren't in it) reads as zero members.
// That is a real "we can't tell" case, not "everyone is external" - the
// caller (web_list_external.ts's response, rendered by the frontend)
// surfaces the distinction rather than silently mislabeling every author.

module.exports = function make_list_external() {
  return async function list_external(this: any, msg: any) {
    const seneca = this
    const org: string = msg.org
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'
    const repo_ids: string[] = (msg.repo_ids || []).filter((r: string) => r.split('/')[0] === org)

    const membersRes = await seneca.post({ aim: 'forge', get: 'members', forge, org })
    const members = new Set(membersRes.ok ? membersRes.logins : [])

    const prs: any[] = []
    for (const repo_id of repo_ids) {
      const res = await seneca.post({ aim: 'forge', list: 'pr', forge, repo_id })
      if (!res.ok) continue

      for (const pr of res.prs) {
        if (pr.author && !members.has(pr.author)) {
          prs.push({
            id: `${repo_id}#${pr.id}`, subject_id: pr.id, repo: repo_id, source: forge, kind: 'pr.open',
            title: pr.title, url: pr.url, actor: pr.author, updated_at: pr.updated_at,
          })
        }
      }
    }
    prs.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))

    return { ok: true, org, prs, member_count: members.size }
  }
}
