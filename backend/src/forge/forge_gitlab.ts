// GitLab stub (SPEC §19.5): a forge:gitlab plugin answering the same base
// aim:forge,* contract as forge:github/forge:mem, from canned data - not a
// real GitLab API client. The point isn't GitLab support yet, it's proving
// no service ever branches on which forge answers (SPEC §10.2's own rule) -
// if a gitlab repo_id flows through sync_item.ts/list_pr.ts/check_policy.ts
// unchanged, the abstraction holds. "Enough to prove that, and no more"
// (§19.5) - one repo, one PR, one issue, real GitLab URL shapes so the
// data at least looks like what it's standing in for.

module.exports = function forge_gitlab(this: any) {
  const seneca = this

  const REPO = 'demo-group/demo-project'

  const prs: any = {
    'g1': {
      id: 'g1', repo_id: REPO, title: 'Fix pipeline timeout', state: 'open',
      url: 'https://gitlab.com/demo-group/demo-project/-/merge_requests/1', author: 'glcontributor1',
      requested_reviewers: [], updated_at: Date.now() - 3 * 3600000,
    },
  }

  const issues: any = {
    'gi1': {
      id: 'gi1', repo_id: REPO, title: 'Pipeline flakes on retry', state: 'open',
      url: 'https://gitlab.com/demo-group/demo-project/-/issues/1', author: 'gluser1', assignees: [], labels: [],
      updated_at: Date.now() - 7 * 3600000,
    },
  }

  const alerts: any = {
    'ga1': { id: 'ga1', repo_id: REPO, severity: 'medium', dismissed: false },
  }

  const checks: any = {
    'gc1': { id: 'gc1', repo_id: REPO, pr_id: 'g1', name: 'pipeline', status: 'success' },
  }

  seneca.message('aim:forge,list:pr,forge:gitlab', async function (msg: any) {
    return { ok: true, prs: Object.values(prs).filter((p: any) => p.repo_id === msg.repo_id && 'open' === p.state) }
  })

  seneca.message('aim:forge,list:issue,forge:gitlab', async function (msg: any) {
    return { ok: true, issues: Object.values(issues).filter((i: any) => i.repo_id === msg.repo_id && 'open' === i.state) }
  })

  seneca.message('aim:forge,load:pr,forge:gitlab', async function (msg: any) {
    const pr = prs[msg.pr_id]
    if (!pr) return { ok: false, why: 'not-found' }
    return { ok: true, pr }
  })

  seneca.message('aim:forge,open:pr,forge:gitlab', async function (msg: any) {
    const pr = { id: 'g' + (Object.keys(prs).length + 1), repo_id: msg.repo_id, title: msg.title, state: 'open' }
    prs[pr.id] = pr
    return { ok: true, pr }
  })

  seneca.message('aim:forge,comment:issue,forge:gitlab', async function (msg: any) {
    return { ok: true, comment: { id: 'gcm1', issue_id: msg.issue_id, body: msg.body } }
  })

  seneca.message('aim:forge,label:issue,forge:gitlab', async function (msg: any) {
    const issue = issues[msg.issue_id]
    if (issue) {
      issue.labels = msg.labels
    }
    return { ok: true }
  })

  seneca.message('aim:forge,assign:issue,forge:gitlab', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,close:issue,forge:gitlab', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,approve:pr,forge:gitlab', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,request:review,forge:gitlab', async function () {
    return { ok: true }
  })

  seneca.message('aim:forge,merge:pr,forge:gitlab', async function (msg: any) {
    const pr = prs[msg.pr_id]
    if (!pr) return { ok: false, why: 'not-found' }
    pr.state = 'merged'
    return { ok: true, pr }
  })

  seneca.message('aim:forge,dismiss:alert,forge:gitlab', async function (msg: any) {
    const alert = alerts[msg.alert_id]
    if (!alert) return { ok: false, why: 'not-found' }
    alert.dismissed = true
    return { ok: true }
  })

  seneca.message('aim:forge,list:alert,forge:gitlab', async function (msg: any) {
    return { ok: true, alerts: Object.values(alerts).filter((a: any) => a.repo_id === msg.repo_id) }
  })

  seneca.message('aim:forge,list:check,forge:gitlab', async function (msg: any) {
    return { ok: true, checks: Object.values(checks).filter((c: any) => c.pr_id === msg.pr_id) }
  })

  seneca.message('aim:forge,get:info,forge:gitlab', async function () {
    return {
      ok: true,
      capabilities: [
        'list:pr', 'open:pr', 'comment:issue', 'label:issue', 'assign:issue', 'close:issue',
        'approve:pr', 'request:review', 'merge:pr', 'dismiss:alert', 'list:alert', 'list:check',
        'get:file', 'get:members',
      ],
    }
  })

  // No file/member data modeled yet - every policy check and every
  // external-contributor filter just reads "nothing here" for a GitLab
  // repo, same as a repo with nothing there. Real content is the next
  // real step once GitLab actually matters (Stage 4, §19.7).
  seneca.message('aim:forge,get:file,forge:gitlab', async function () {
    return { ok: true, exists: false }
  })

  seneca.message('aim:forge,get:members,forge:gitlab', async function () {
    return { ok: true, logins: [] }
  })

  return { name: 'forge_gitlab' }
}
