const loadItemForge = require('./item_forge')

module.exports = function make_label_item() {
  return async function label_item(this: any, msg: any) {
    const seneca = this
    const found = await loadItemForge(seneca, msg.id)
    if (!found) return { ok: false, why: 'not-found' }
    const { item, repo_id, pr_id, forge } = found

    const res = await seneca.post({ aim: 'forge', label: 'issue', forge, repo_id, issue_id: pr_id, labels: msg.labels })
    if (!res.ok) return { ok: false, why: res.why || 'forge-failed' }

    return { ok: true, item }
  }
}
