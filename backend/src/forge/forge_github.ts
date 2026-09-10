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
      const res = await sdk.Pull().update({ owner, repo, pull_number: Number(msg.pr_id), merge_method: msg.merge_method })
      const data = res.data ? res.data() : res
      return { ok: true, pr: { repo_id: msg.repo_id, id: msg.pr_id, state: data.merged ? 'merged' : 'open' } }
    }
    catch (e: any) {
      return { ok: false, why: 404 === e?.status ? 'not-found' : 'merge-failed' }
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
  }
}
