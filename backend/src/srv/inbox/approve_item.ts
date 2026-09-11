const loadItemForge = require('./item_forge')

module.exports = function make_approve_item() {
  return async function approve_item(this: any, msg: any) {
    const seneca = this
    const found = await loadItemForge(seneca, msg.id)
    if (!found) return { ok: false, why: 'not-found' }
    const { item, repo_id, pr_id, forge } = found

    const res = await seneca.post({ aim: 'forge', approve: 'pr', forge, repo_id, pr_id, body: msg.body })
    if (!res.ok) return { ok: false, why: res.why || 'forge-failed' }

    return { ok: true, item }
  }
}
