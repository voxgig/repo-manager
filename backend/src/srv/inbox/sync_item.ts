// Polls the given repos via aim:forge,list:pr / list:issue, runs every
// detector (./detect.ts) over each subject, and stores one rpm/item per
// condition found - condition -> item, per SPEC §12.1:
//   no item, condition present  -> create
//   item exists, digest same    -> no-op
//   item exists, digest changed -> update (reopen if it was done)
//   item exists, condition gone -> auto-resolve (remove; "no undo" yet)

import * as crypto from 'crypto'

const { PR_DETECTORS, ISSUE_DETECTORS, priorityFor } = require('./detect')

// Same shape for both subject kinds: which aim:forge,list:* answers it,
// which field of the response carries the list, which detectors run over it.
const SOURCES = [
  { list: 'pr', items_key: 'prs', detectors: PR_DETECTORS },
  { list: 'issue', items_key: 'issues', detectors: ISSUE_DETECTORS },
]

module.exports = function make_sync_item() {
  return async function sync_item(this: any, msg: any) {
    const seneca = this

    const repo_ids: string[] = msg.repo_ids || []
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'
    const for_user: string = msg.for_user

    const seen = new Set<string>()
    let created = 0
    let updated = 0

    for (const repo_id of repo_ids) {
      const org_id = repo_id.split('/')[0]

      for (const source of SOURCES) {
        const res = await seneca.post({ aim: 'forge', list: source.list, forge, repo_id })
        if (!res.ok) continue

        for (const subject of res[source.items_key]) {
          for (const detect of source.detectors) {
            const cond = detect(subject, for_user)
            if (!cond) continue

            seen.add([org_id, forge, cond.kind, repo_id, cond.subject_id].join('|'))

            const digest = crypto.createHash('sha256').update(JSON.stringify(cond.facts)).digest('hex')
            const now = Date.now()
            const existing = (await seneca.entity('rpm/item').list$({
              org_id, source: forge, kind: cond.kind, repo: repo_id, subject_id: cond.subject_id,
            }))[0]

            if (!existing) {
              await seneca.entity('rpm/item').data$({
                org_id, source: forge, repo: repo_id, kind: cond.kind,
                title: cond.title, url: cond.url, actor: cond.actor, subject_id: cond.subject_id,
                priority: priorityFor(cond.kind), state: 'open',
                first_seen: now, updated_at: cond.updated_at || now,
                digest, payload: cond.payload,
              }).save$()
              created++
            }
            else {
              let dirty = false

              if (existing.digest !== digest) {
                existing.title = cond.title
                existing.updated_at = cond.updated_at || now
                existing.digest = digest
                dirty = true
                if ('done' === existing.state) {
                  existing.state = 'open'
                }
              }

              // Snoozed -> Open once `until` passes, regardless of digest -
              // the condition is still true, so the wake is unconditional.
              if ('snoozed' === existing.state && now >= (existing.snooze_until || 0)) {
                existing.state = 'open'
                existing.snooze_until = undefined
                dirty = true
              }

              if (dirty) {
                await existing.save$()
                updated++
              }
            }
          }
        }
      }
    }

    // Auto-resolve: open OR snoozed items in this sync's scope whose
    // condition wasn't seen this pass - the PR merged, closed, went
    // stale->fresh, or the review request was withdrawn. Snoozed items
    // resolve just as silently (SPEC §12.1's state machine): a snooze is a
    // "not now", not a promise the condition survives until it wakes.
    const open_items = await seneca.entity('rpm/item').list$({ state: 'open' })
    const snoozed_items = await seneca.entity('rpm/item').list$({ state: 'snoozed' })
    let resolved = 0
    for (const item of [...open_items, ...snoozed_items]) {
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
