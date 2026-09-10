// Real GitHub forge, specializing the same aim:forge,* contract forge:mem
// answers from fixtures. repo_id is the GitHub "owner/repo" full name.

const { GithubSDK } = require('@voxgig-sdk/github')

module.exports = function forge_github(this: any, options: any) {
  const seneca = this

  // Built directly rather than via this.export('GithubProvider/sdk') -
  // Seneca reassigns plugin.shared to whichever plugin owns the currently
  // executing action, so that export closure resolves to the wrong (or no)
  // state once called from outside github-provider's own action context.
  const sdk = new GithubSDK(options.provider?.sdk || {})

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

  // pr_id is the PR NUMBER (not GitHub's internal id) - it's what merge/open
  // and every other follow-up action actually need on the wire, and it's
  // the same number a human sees in the PR's URL.
  seneca.message('aim:forge,open:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const pr = await sdk.Pull().create({ owner, repo, title: msg.title, head: msg.head, base: msg.base, body: msg.body })
    return { ok: true, pr: normalizePr(pr.data ? pr.data() : pr, msg.repo_id) }
  })

  seneca.message('aim:forge,merge:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    try {
      // $action:'merge' picks the merge point over Pull's plain field-update
      // point - both share the "update" op since merge has no slot of its own.
      const res = await sdk.Pull().update({ owner, repo, id: Number(msg.pr_id), $action: 'merge', merge_method: msg.merge_method } as any)
      const data = res.data ? res.data() : res
      return { ok: true, pr: { repo_id: msg.repo_id, id: msg.pr_id, state: data.merged ? 'merged' : 'open' } }
    }
    catch (e: any) {
      return { ok: false, why: 404 === e?.status ? 'not-found' : 'merge-failed' }
    }
  })

  // issue_id is the issue/PR NUMBER, same convention as pr_id - GitHub
  // treats every PR as an issue for comments/labels/assignees/state. The
  // guide folds comment/label/assignee into Issue as $action variants
  // (apidef only resolves 6 bare CRUD op names per entity).
  seneca.message('aim:forge,comment:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    const res = await sdk.Issue().create({ owner, repo, id: Number(msg.issue_id), $action: 'comment', body: msg.body } as any)
    const data = res.data ? res.data() : res
    return { ok: true, comment: { id: String(data.id), issue_id: msg.issue_id, body: data.body } }
  })

  seneca.message('aim:forge,label:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await sdk.Issue().create({ owner, repo, id: Number(msg.issue_id), $action: 'label', labels: msg.labels } as any)
    return { ok: true }
  })

  seneca.message('aim:forge,assign:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await sdk.Issue().create({ owner, repo, id: Number(msg.issue_id), $action: 'assignee', assignees: msg.assignees } as any)
    return { ok: true }
  })

  seneca.message('aim:forge,close:issue,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await sdk.Issue().update({ owner, repo, id: Number(msg.issue_id), state: 'closed' } as any)
    return { ok: true }
  })

  // The guide names these by response shape, not by what they do:
  // PullRequestReview.create() posts an actual review (approve/comment/
  // request-changes); PullRequestSimple.create() posts a review REQUEST.
  seneca.message('aim:forge,approve:pr,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await sdk.PullRequestReview().create({ owner, repo, pull_number: Number(msg.pr_id), event: 'APPROVE', body: msg.body || '' } as any)
    return { ok: true }
  })

  seneca.message('aim:forge,request:review,forge:github', async function (this: any, msg: any) {
    const [owner, repo] = String(msg.repo_id).split('/')
    await sdk.PullRequestSimple().create({ owner, repo, pull_number: Number(msg.pr_id), reviewers: msg.reviewers } as any)
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
