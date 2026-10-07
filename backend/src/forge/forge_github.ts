// Real GitHub forge, specializing the same aim:forge,* contract forge:mem
// answers from fixtures. repo_id is the GitHub "owner/repo" full name.

// require(), not import - see basic.ts's own comment on this same fix.
const SenecaPromisify = require('seneca-promisify')
const SenecaEntity = require('seneca-entity')
const SenecaProvider = require('@seneca/provider')
const SenecaGithubProvider = require('@seneca/github-provider')

module.exports = function forge_github(this: any, options: any) {
  const seneca = this

  // Direct references, not string names - see basic.ts's own comment on
  // this same fix.
  seneca
    .use(SenecaPromisify)
    .use(SenecaEntity)
    .use(SenecaProvider)
    .use(SenecaGithubProvider, options.provider || {})

  seneca.message('aim:forge,list:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const list = await this.entity('provider/github/pull').list$({ owner, repo })
    return {
      ok: true,
      prs: list.map((pr: any) => normalizePr(pr, msg.repo_id)),
    }
  })

  // GitHub's bare issues list includes pull requests (each carries a
  // pull_request field when it's really one) - filtered out here so callers
  // only ever see true issues, matching list:pr's own scope.
  seneca.message('aim:forge,list:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const list = await this.entity('provider/github/issue').list$({ owner, repo })
    return {
      ok: true,
      issues: list.filter((it: any) => !it.pull_request).map((it: any) => normalizeIssue(it, msg.repo_id)),
    }
  })

  // The detail view - list:pr's response is the list-endpoint shape, which
  // GitHub doesn't carry body/diff-stats/mergeable on; this is the same
  // Pull entity but loaded singly, where those fields actually show up.
  seneca.message('aim:forge,load:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const pr = await this.entity('provider/github/pull').load$({ id: Number(msg.pr_id), owner, repo })
    if (!pr) {
      return { ok: false, why: 'not-found' }
    }
    return { ok: true, pr: normalizePrDetail(pr, msg.repo_id) }
  })

  // pr_id is the PR NUMBER (not GitHub's internal id) - it's what merge/open
  // and every other follow-up action actually need on the wire, and it's
  // the same number a human sees in the PR's URL.
  seneca.message('aim:forge,open:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const pr = await this.entity('provider/github/pull')
      .make$({ owner, repo, title: msg.title, head: msg.head, base: msg.base, body: msg.body })
      .save$()
    return { ok: true, pr: normalizePr(pr, msg.repo_id) }
  })

  seneca.message('aim:forge,merge:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    try {
      // action$:'merge' picks the merge point over Pull's plain field-update
      // point - both share the save cmd since merge has no slot of its own.
      const ent = this.entity('provider/github/pull').make$({ id: Number(msg.pr_id), owner, repo, merge_method: msg.merge_method })
      ent.action$ = 'merge'
      const merged = await ent.save$()
      return { ok: true, pr: { repo_id: msg.repo_id, id: msg.pr_id, state: merged.merged ? 'merged' : 'open' } }
    }
    catch (e: any) {
      return { ok: false, why: 404 === e?.status ? 'not-found' : 'merge-failed' }
    }
  })

  // issue_id is the issue/PR NUMBER, same convention as pr_id - GitHub
  // treats every PR as an issue for comments/labels/assignees/state. The
  // provider folds comment/label/assignee into Issue as action$ variants.
  seneca.message('aim:forge,comment:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const ent = this.entity('provider/github/issue').make$({ id: Number(msg.issue_id), owner, repo, body: msg.body })
    ent.action$ = 'comment'
    const comment = await ent.save$()
    return { ok: true, comment: { id: String(comment.id), issue_id: msg.issue_id, body: comment.body } }
  })

  seneca.message('aim:forge,label:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const ent = this.entity('provider/github/issue').make$({ id: Number(msg.issue_id), owner, repo, labels: msg.labels })
    ent.action$ = 'label'
    await ent.save$()
    return { ok: true }
  })

  seneca.message('aim:forge,assign:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const ent = this.entity('provider/github/issue').make$({ id: Number(msg.issue_id), owner, repo, assignees: msg.assignees })
    ent.action$ = 'assignee'
    await ent.save$()
    return { ok: true }
  })

  seneca.message('aim:forge,close:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await this.entity('provider/github/issue').make$({ id: Number(msg.issue_id), owner, repo, state: 'closed' }).save$()
    return { ok: true }
  })

  // PullRequestReview.save$() posts an actual review (approve/comment/
  // request-changes); PullRequestSimple.save$() posts a review REQUEST -
  // the provider names these by response shape, not by what they do.
  seneca.message('aim:forge,approve:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await this.entity('provider/github/pull_request_review')
      .make$({ owner, repo, pull_number: Number(msg.pr_id), event: 'APPROVE', body: msg.body || '' })
      .save$()
    return { ok: true }
  })

  seneca.message('aim:forge,request:review,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await this.entity('provider/github/pull_request_simple')
      .make$({ owner, repo, pull_number: Number(msg.pr_id), reviewers: msg.reviewers })
      .save$()
    return { ok: true }
  })

  // The policy engine's file.exists/file.matches checks (SPEC §14.1) -
  // single-file case only (see the Content entity's own doc). Decoded to
  // plain text here so a check never has to know the encoding came back
  // base64 - that's a wire detail of this one forge, not the check's concern.
  seneca.message('aim:forge,get:file,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const file = await this.entity('provider/github/content').load$({ id: msg.path, owner, repo })
    if (!file) {
      return { ok: true, exists: false }
    }
    return {
      ok: true, exists: true,
      content: 'base64' === file.encoding ? Buffer.from(file.content, 'base64').toString('utf8') : file.content,
    }
  })

  // The fleet's external-contributor filter - only public org members are
  // visible unless the authenticated user is itself a member of the org
  // (GitHub's own rule, not ours); an org with fully concealed membership
  // and no membership of our own reads as zero members, not zero
  // contributors - the caller surfaces that distinction, this action just
  // reports what GitHub actually returned.
  seneca.message('aim:forge,get:members,forge:github', async function (this: any, msg: any) {
    const list = await this.entity('provider/github/member').list$({ org: msg.org })
    return { ok: true, logins: list.map((m: any) => m.login) }
  })

  // doctor's credential-validity + rate-limit-headroom check (SPEC §17).
  // rate_limit has no id at all, and seneca-entity's own load$() shorthand
  // requires an identifying value - called with none, it resolves to null
  // entirely client-side without ever reaching this provider, verified by
  // tracing it (load$() / load$(null) / load$({}) all short-circuit the
  // same way). The raw entity message doesn't have that requirement.
  // SPEC S2's own named concern: a wildcard ruleset (e.g. repo-manager/*)
  // protects branches this tool is about to create, not just existing
  // protected ones. RepositoryRuleDetailed is GitHub's "rules for a branch"
  // endpoint - it evaluates every applicable branch-protection rule AND
  // repo/org ruleset for a branch BY NAME, even one that doesn't exist yet,
  // which plain branch-protection lookups can't do.
  seneca.message('aim:forge,get:branch_rules,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const res = await this.entity('provider/github/repository_rule_detailed')
      .load$({ id: msg.branch, owner, repo })
    const rules = Array.isArray(res) ? res : (res ? [res] : [])
    return { ok: true, rules }
  })

  seneca.message('aim:forge,get:rate,forge:github', async function (this: any, msg: any) {
    try {
      const res = await this.post({ role: 'entity', cmd: 'load', zone: 'provider', base: 'github', name: 'rate_limit', q: {} })
      if (!res) {
        return { ok: false, why: 'credential rejected' }
      }
      return { ok: true, limit: res.limit, remaining: res.remaining, reset: res.reset, used: res.used }
    }
    catch (err: any) {
      return { ok: false, why: 401 === err.status ? 'credential rejected' : (err.message || 'forge call failed') }
    }
  })

  return { name: 'forge_github' }
}


function normalizePr(pr: any, repo_id: string) {
  return {
    id: String(pr.number),
    repo_id,
    title: pr.title,
    state: pr.state,
    url: pr.html_url,
    author: pr.user?.login,
    requested_reviewers: (pr.requested_reviewers || []).map((r: any) => r.login),
    updated_at: pr.updated_at ? Date.parse(pr.updated_at) : undefined,
    // head_ref is how apply_policy.ts finds "is there already an open PR
    // for the branch I'm about to push" (SPEC S6) without a second forge
    // action - list:pr already carries enough to filter by head branch.
    head_ref: pr.head?.ref,
    base_ref: pr.base?.ref,
  }
}

// Everything normalizePr has, plus the fields only the single-PR load
// carries - description, diff shape, mergeability. Checks and real review
// approval counts aren't included: neither is modeled in the SDK yet
// (Checks API isn't wired; the review-list point currently resolves to
// requested_reviewers, not actual reviews - see the loose-ends memory note).
function normalizePrDetail(pr: any, repo_id: string) {
  return {
    ...normalizePr(pr, repo_id),
    body: pr.body || '',
    draft: !!pr.draft,
    merged: !!pr.merged,
    mergeable: pr.mergeable,
    mergeable_state: pr.mergeable_state,
    additions: pr.additions,
    deletions: pr.deletions,
    changed_files: pr.changed_files,
    commits: pr.commits,
  }
}

function normalizeIssue(issue: any, repo_id: string) {
  return {
    id: String(issue.number),
    repo_id,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    author: issue.user?.login,
    assignees: (issue.assignees || []).map((a: any) => a.login),
    // GitHub's list endpoint returns label objects, not bare strings.
    labels: (issue.labels || []).map((l: any) => ('string' === typeof l ? l : l.name)),
    body: issue.body || '',
    updated_at: issue.updated_at ? Date.parse(issue.updated_at) : undefined,
  }
}
