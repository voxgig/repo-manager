const { loadItemForge, markResponded } = require('./item_forge')

module.exports = function make_comment_item() {
  return async function comment_item(this: any, msg: any) {
    const seneca = this
    const found = await loadItemForge(seneca, msg.id)
    if (!found) return { ok: false, why: 'not-found' }
    const { item, repo_id, pr_id, forge } = found

    const res = await seneca.post({ aim: 'forge', comment: 'issue', forge, repo_id, issue_id: pr_id, body: msg.body })
    if (!res.ok) return { ok: false, why: res.why || 'forge-failed' }

    markResponded(item)
    await item.save$()

    return { ok: true, item, comment: res.comment }
  }
}
