const { loadItemForge, markResponded } = require('./item_forge')

module.exports = function make_merge_item() {
  return async function merge_item(this: any, msg: any) {
    const seneca = this
    const found = await loadItemForge(seneca, msg.id)
    if (!found) return { ok: false, why: 'not-found' }
    const { item, repo_id, pr_id, forge } = found

    const res = await seneca.post({ aim: 'forge', merge: 'pr', forge, repo_id, pr_id, merge_method: msg.merge_method })
    if (!res.ok) return { ok: false, why: res.why || 'forge-failed' }

    // Merging always resolves the review-needed condition; no undo (SPEC S13).
    item.state = 'done'
    item.last_action = 'merge'
    markResponded(item)
    await item.save$()

    return { ok: true, item }
  }
}
