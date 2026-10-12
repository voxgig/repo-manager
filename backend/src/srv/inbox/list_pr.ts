// Raw fleet browse, not the derived queue: every open PR across the given
// repos, with no rpm/item behind any of them. Normalized into the same shape
// the inbox list renders (repo/actor/kind/priority) so the frontend's
// existing row/focus rendering needs no special-casing - priority is left
// unset (nothing to derive for a plain browse list) and kind is a fixed
// 'pr.open' label.
//
// Reads rpm/pr from the store rather than polling aim:forge,list:pr per repo
// (SPEC §9, "sync, not proxy"): the forge version cost one sequential round
// trip per configured repo on every page load - 32 of them in production,
// before a single row reached the browser. sync_item.ts already fetches this
// exact data for its detectors, so storing it there costs nothing and this
// becomes one store read. The data is therefore as fresh as the last sync,
// same as the inbox has always been.

module.exports = function make_list_pr() {
  return async function list_pr(this: any, msg: any) {
    const seneca = this
    const repo_ids: string[] = msg.repo_ids || []

    const rows = await seneca.entity('rpm/pr').list$()

    const prs = rows
      .filter((row: any) => repo_ids.includes(row.repo))
      .map((row: any) => ({
        id: `${row.repo}#${row.subject_id}`, subject_id: row.subject_id,
        repo: row.repo, source: row.source, kind: 'pr.open',
        title: row.title, url: row.url, actor: row.actor, updated_at: row.updated_at,
      }))
    prs.sort((a: any, b: any) => (b.updated_at || 0) - (a.updated_at || 0))

    return { ok: true, prs }
  }
}
