// Test-only forge, answering every base aim:forge,* pattern from
// canned in-memory data. The whole engine/inbox suite runs against
// this instead of a real GitHub/GitLab account.

module.exports = function forge_mem(this: any) {
  const seneca = this

  const prs: any = {
    'p1': {
      id: 'p1', repo_id: 'r1', title: 'Fix thing', state: 'open',
      url: 'https://example.com/r1/pull/1', author: 'contributor1',
      requested_reviewers: ['maintainer1'], updated_at: 1700000000000,
    },
  }

  const alerts: any = {
    'a1': { id: 'a1', repo_id: 'r1', severity: 'high', dismissed: false },
  }

  const checks: any = {
    'c1': { id: 'c1', repo_id: 'r1', pr_id: 'p1', name: 'ci', status: 'success' },
  }

  seneca.message('aim:forge,list:pr,forge:mem', async function (msg: any) {
    // Matches the real GitHub API: list$ returns open PRs only.
    return {
      ok: true,
      prs: Object.values(prs).filter((p: any) => p.repo_id === msg.repo_id && 'open' === p.state),
    }
  })

  seneca.message('aim:forge,open:pr,forge:mem', async function (msg: any) {
    const pr = { id: 'p' + (Object.keys(prs).length + 1), repo_id: msg.repo_id, title: msg.title, state: 'open' }
    prs[pr.id] = pr
    return { ok: true, pr }
  })

  seneca.message('aim:forge,comment:issue,forge:mem', async function (msg: any) {
    return { ok: true, comment: { id: 'cm1', issue_id: msg.issue_id, body: msg.body } }
  })

  seneca.message('aim:forge,label:issue,forge:mem', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,assign:issue,forge:mem', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,close:issue,forge:mem', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,approve:pr,forge:mem', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,request:review,forge:mem', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,merge:pr,forge:mem', async function (msg: any) {
    const pr = prs[msg.pr_id]
    if (!pr) return { ok: false, why: 'not-found' }
    pr.state = 'merged'
    return { ok: true, pr }
  })

  seneca.message('aim:forge,dismiss:alert,forge:mem', async function (msg: any) {
    const alert = alerts[msg.alert_id]
    if (!alert) return { ok: false, why: 'not-found' }
    alert.dismissed = true
    return { ok: true }
  })

  seneca.message('aim:forge,list:alert,forge:mem', async function (msg: any) {
    return { ok: true, alerts: Object.values(alerts).filter((a: any) => a.repo_id === msg.repo_id) }
  })

  seneca.message('aim:forge,list:check,forge:mem', async function (msg: any) {
    return { ok: true, checks: Object.values(checks).filter((c: any) => c.pr_id === msg.pr_id) }
  })

  seneca.message('aim:forge,get:info,forge:mem', async function () {
    return { ok: true, capabilities: ['list:pr', 'open:pr', 'comment:issue', 'label:issue', 'assign:issue', 'close:issue', 'approve:pr', 'request:review', 'merge:pr', 'dismiss:alert', 'list:alert', 'list:check'] }
  })

  return { name: 'forge_mem' }
}
