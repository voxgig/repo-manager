// Raw fleet browse, not the derived queue: every open issue across the given
// repos, with no rpm/item behind any of them. Same normalized shape as
// list_pr.ts's PRs.
//
// Reads rpm/issue from the store rather than polling aim:forge,list:issue per
// repo - see list_pr.ts's own comment for why.

module.exports = function make_list_issue() {
  return async function list_issue(this: any, msg: any) {
    const seneca = this
    const repo_ids: string[] = msg.repo_ids || []

    const rows = await seneca.entity('rpm/issue').list$()

    const issues = rows
      .filter((row: any) => repo_ids.includes(row.repo))
      .map((row: any) => ({
        id: `${row.repo}#${row.subject_id}`, repo: row.repo, source: row.source,
        kind: 'issue.open', title: row.title, url: row.url,
        actor: row.actor, updated_at: row.updated_at,
      }))
    issues.sort((a: any, b: any) => (b.updated_at || 0) - (a.updated_at || 0))

    return { ok: true, issues }
  }
}
