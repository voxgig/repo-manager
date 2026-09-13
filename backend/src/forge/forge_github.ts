// Real GitHub forge, specializing the same aim:forge,* contract forge:mem
// answers from fixtures. repo_id is the GitHub "owner/repo" full name.

module.exports = function forge_github(this: any, options: any) {
  const seneca = this

  seneca
    .use('promisify')
    .use('entity')
    .use('provider')
    .use('github-provider', options.provider || {})

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
    head_ref: pr.head?.ref,
    base_ref: pr.base?.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    changed_files: pr.changed_files,
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
    updated_at: issue.updated_at ? Date.parse(issue.updated_at) : undefined,
  }
}
