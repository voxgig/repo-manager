// Stage 1's one item kind: pr.review_requested. Polls the given repos via
// aim:forge,list:pr and stores one rpm/item per open PR that requests
// for_user as a reviewer - condition -> item, per SPEC §12.1:
//   no item, condition present  -> create
//   item exists, digest same    -> no-op
//   item exists, digest changed -> update (reopen if it was done)
//   item exists, condition gone -> auto-resolve (remove; "no undo" yet)

import * as crypto from 'crypto'

module.exports = function make_sync_item() {
  return async function sync_item(this: any, msg: any) {
    const seneca = this

    const repo_ids: string[] = msg.repo_ids || []
    const forge: string = msg.forge || 'github'
    const for_user: string = msg.for_user
    const kind = 'pr.review_requested'

    const seen = new Set<string>()
    let created = 0
    let updated = 0

    for (const repo_id of repo_ids) {
      const res = await seneca.post({ aim: 'forge', list: 'pr', forge, repo_id })
      if (!res.ok) continue

      const org_id = repo_id.split('/')[0]

      for (const pr of res.prs) {
        const reviewers: string[] = pr.requested_reviewers || []
        if (!reviewers.includes(for_user)) continue

        const subject_id = pr.id
        seen.add([org_id, forge, kind, repo_id, subject_id].join('|'))

        const digest = crypto.createHash('sha256')
          .update(JSON.stringify({ title: pr.title, state: pr.state, reviewers }))
          .digest('hex')

        const now = Date.now()
        const existing = (await seneca.entity('rpm/item').list$({
          org_id, source: forge, kind, repo: repo_id, subject_id,
        }))[0]

        if (!existing) {
          await seneca.entity('rpm/item').data$({
            org_id, source: forge, repo: repo_id, kind,
            title: pr.title, url: pr.url, actor: pr.author, subject_id,
            priority: 'now', state: 'open',
            first_seen: now, updated_at: pr.updated_at || now,
            digest, payload: { requested_reviewers: reviewers },
          }).save$()
          created++
        }
        else if (existing.digest !== digest) {
          existing.title = pr.title
          existing.updated_at = pr.updated_at || now
          existing.digest = digest
          if ('done' === existing.state) {
            existing.state = 'open'
          }
          await existing.save$()
          updated++
        }
      }
    }

    // Auto-resolve: open items in this sync's scope whose condition wasn't
    // seen this pass - the PR merged, closed, or the review was withdrawn.
    const open_items = await seneca.entity('rpm/item').list$({ state: 'open' })
    let resolved = 0
    for (const item of open_items) {
      if (!repo_ids.includes(item.repo)) continue
      const key = [item.org_id, item.source, item.kind, item.repo, item.subject_id].join('|')
      if (!seen.has(key)) {
        await seneca.entity('rpm/item').remove$(item.id)
        resolved++
      }
    }

    return { ok: true, created, updated, resolved, seen: seen.size }
  }
}
