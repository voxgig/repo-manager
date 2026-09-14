// Raw fleet browse, not the derived queue: every open issue across the
// given repos, straight from aim:forge,list:issue, with no rpm/item behind
// any of them. Same normalized shape as list_pr.ts's PRs.

module.exports = function make_list_issue() {
  return async function list_issue(this: any, msg: any) {
    const seneca = this
    const repo_ids: string[] = msg.repo_ids || []
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'

    const issues: any[] = []
    for (const repo_id of repo_ids) {
      const res = await seneca.post({ aim: 'forge', list: 'issue', forge, repo_id })
      if (!res.ok) continue

      for (const issue of res.issues) {
        issues.push({
          id: `${repo_id}#${issue.id}`, repo: repo_id, source: forge, kind: 'issue.open',
          title: issue.title, url: issue.url, actor: issue.author, updated_at: issue.updated_at,
        })
      }
    }
    issues.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))

    return { ok: true, issues }
  }
}
