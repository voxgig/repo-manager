const { loadItemForge, markResponded } = require('./item_forge')

module.exports = function make_close_item() {
  return async function close_item(this: any, msg: any) {
    const seneca = this
    if (!msg.reason) return { ok: false, why: 'reason-required' }

    const found = await loadItemForge(seneca, msg.id)
    if (!found) return { ok: false, why: 'not-found' }
    const { item, repo_id, pr_id, forge } = found

    // SPEC §13.2: "Close with reason - always through a saved reply, never a
    // bare close." The reason always posts as a comment before closing -
    // the frontend composer can pre-fill it from a saved reply (rpm/reply,
    // §12.4), but this action only ever sees the resolved text either way.
    const commented = await seneca.post({ aim: 'forge', comment: 'issue', forge, repo_id, issue_id: pr_id, body: msg.reason })
    if (!commented.ok) return { ok: false, why: commented.why || 'forge-failed' }

    const closed = await seneca.post({ aim: 'forge', close: 'issue', forge, repo_id, issue_id: pr_id })
    if (!closed.ok) return { ok: false, why: closed.why || 'forge-failed' }

    item.state = 'done'
    item.last_action = 'close'
    markResponded(item)
    await item.save$()

    return { ok: true, item }
  }
}
