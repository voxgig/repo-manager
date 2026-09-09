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
      prs: list.map((pr: any) => ({
        id: String(pr.id),
        repo_id: msg.repo_id,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
        author: pr.user?.login,
        requested_reviewers: (pr.requested_reviewers || []).map((r: any) => r.login),
        updated_at: pr.updated_at ? Date.parse(pr.updated_at) : undefined,
      })),
    }
  })

  return { name: 'forge_github' }
}
