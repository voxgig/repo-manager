// Raw fleet browse, not the derived queue: every open PR across the given
// repos, straight from aim:forge,list:pr, with no rpm/item behind any of
// them. Normalized into the same shape the inbox list renders (repo/actor/
// kind/priority) so the frontend's existing row/focus rendering needs no
// special-casing - priority is left unset (nothing to derive for a plain
// browse list) and kind is a fixed 'pr.open' label.

module.exports = function make_list_pr() {
  return async function list_pr(this: any, msg: any) {
    const seneca = this
    const repo_ids: string[] = msg.repo_ids || []
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'

    const prs: any[] = []
    for (const repo_id of repo_ids) {
      const res = await seneca.post({ aim: 'forge', list: 'pr', forge, repo_id })
      if (!res.ok) continue

      for (const pr of res.prs) {
        prs.push({
          id: `${repo_id}#${pr.id}`, subject_id: pr.id, repo: repo_id, source: forge, kind: 'pr.open',
          title: pr.title, url: pr.url, actor: pr.author, updated_at: pr.updated_at,
        })
      }
    }
    prs.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))

    return { ok: true, prs }
  }
}
