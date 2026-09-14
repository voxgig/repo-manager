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
      body: 'Fixes the thing.', head_ref: 'fix-thing', base_ref: 'main',
      additions: 12, deletions: 3, changed_files: 2, commits: 2,
      mergeable: true, mergeable_state: 'clean', draft: false, merged: false,
    },
    // r2's PRs are kept out of r1 so existing single-repo sync tests are
    // unaffected - only tests that explicitly sync r2 see pr.inbound/stale.
    'p2': {
      id: 'p2', repo_id: 'r2', title: 'Contributor fix', state: 'open',
      url: 'https://example.com/r2/pull/2', author: 'contributor2',
      requested_reviewers: [], updated_at: Date.now(),
    },
    'p3': {
      id: 'p3', repo_id: 'r2', title: 'My stale PR', state: 'open',
      url: 'https://example.com/r2/pull/3', author: 'maintainer1',
      requested_reviewers: [], updated_at: Date.now() - 20 * 86400000,
    },

    // Demo-only repos (REPO_MANAGER_FORGE=mem) - new repo_ids so none of
    // the exact-count assertions above (r1/r2) are affected.
    'p4': {
      id: 'p4', repo_id: 'senecajs/seneca-redis-store', title: 'Add cluster mode support', state: 'open',
      url: 'https://example.com/senecajs/seneca-redis-store/pull/4', author: 'lena-r',
      requested_reviewers: ['maintainer1'], updated_at: Date.now() - 2 * 3600000,
      body: 'Adds Redis Cluster support behind a `cluster: true` option - single-node behaviour is unchanged.',
      head_ref: 'cluster-mode', base_ref: 'main',
      additions: 214, deletions: 38, changed_files: 6, commits: 4,
      mergeable: true, mergeable_state: 'clean', draft: false, merged: false,
    },
    'p5': {
      id: 'p5', repo_id: 'voxgig-sdk/stripe-sdk', title: 'fix: retry webhook signature validation', state: 'open',
      url: 'https://example.com/voxgig-sdk/stripe-sdk/pull/5', author: 'contributor3',
      requested_reviewers: [], updated_at: Date.now() - 6 * 3600000,
      body: 'Webhook validation was failing on retried deliveries with a stale timestamp - widens the tolerance window.',
      head_ref: 'fix-webhook-retry', base_ref: 'main',
      additions: 18, deletions: 4, changed_files: 2, commits: 1,
      mergeable: true, mergeable_state: 'clean', draft: false, merged: false,
    },
    'p6': {
      id: 'p6', repo_id: 'tabnas/jsonic', title: 'Support nested anchors in comments', state: 'open',
      url: 'https://example.com/tabnas/jsonic/pull/6', author: 'dev4',
      requested_reviewers: ['maintainer1'], updated_at: Date.now() - 45 * 60000,
      body: 'Anchors inside comments were being dropped by the parser - adds coverage for the nested case.',
      head_ref: 'nested-anchor-comments', base_ref: 'main',
      additions: 56, deletions: 11, changed_files: 3, commits: 2,
      mergeable: false, mergeable_state: 'dirty', draft: false, merged: false,
    },
    'p7': {
      id: 'p7', repo_id: 'voxgig/sdkgen', title: 'Regenerate types for v2 schema', state: 'open',
      url: 'https://example.com/voxgig/sdkgen/pull/7', author: 'maintainer1',
      requested_reviewers: [], updated_at: Date.now() - 26 * 86400000,
      body: 'Regenerates the SDK types against the v2 OpenAPI schema - no manual edits since.',
      head_ref: 'regen-v2-types', base_ref: 'main',
      additions: 1204, deletions: 890, changed_files: 31, commits: 1,
      mergeable: true, mergeable_state: 'clean', draft: false, merged: false,
    },
    'p8': {
      id: 'p8', repo_id: 'voxgig-sdk/stripe-sdk', title: 'Bump lodash to patch CVE-2027-1123', state: 'open',
      url: 'https://example.com/voxgig-sdk/stripe-sdk/pull/8', author: 'security-bot',
      requested_reviewers: ['maintainer1'], updated_at: Date.now() - 15 * 60000,
      body: 'Bumps lodash past the advisory range. No other changes.',
      head_ref: 'bump-lodash-cve', base_ref: 'main',
      additions: 4, deletions: 4, changed_files: 1, commits: 1,
      mergeable: true, mergeable_state: 'clean', draft: false, merged: false,
    },
  }

  const issues: any = {
    'i1': { id: 'i1', repo_id: 'r1', title: 'A real issue', state: 'open', url: 'https://example.com/r1/issues/1', author: 'someone', assignees: [], updated_at: Date.now() },

    'i2': {
      id: 'i2', repo_id: 'tabnas/jsonic', title: 'Anchors drop trailing comments', state: 'open',
      url: 'https://example.com/tabnas/jsonic/issues/2', author: 'user5', assignees: [],
      updated_at: Date.now() - 9 * 3600000,
    },
    'i3': {
      id: 'i3', repo_id: 'voxgig/sdkgen', title: 'npm publish token rotates in 6 days', state: 'open',
      url: 'https://example.com/voxgig/sdkgen/issues/3', author: 'maintainer1', assignees: ['maintainer1'],
      updated_at: Date.now() - 2 * 86400000,
    },
    'i4': {
      id: 'i4', repo_id: 'senecajs/seneca-redis-store', title: 'Flaky test: cluster reconnect', state: 'open',
      url: 'https://example.com/senecajs/seneca-redis-store/issues/4', author: 'contributor6', assignees: [],
      updated_at: Date.now() - 4 * 86400000,
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

  seneca.message('aim:forge,list:issue,forge:mem', async function (msg: any) {
    return {
      ok: true,
      issues: Object.values(issues).filter((i: any) => i.repo_id === msg.repo_id && 'open' === i.state),
    }
  })

  seneca.message('aim:forge,load:pr,forge:mem', async function (msg: any) {
    const pr = prs[msg.pr_id]
    if (!pr) return { ok: false, why: 'not-found' }
    return { ok: true, pr }
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
