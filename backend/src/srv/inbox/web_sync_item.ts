// "sync now" (command bar, MOCKUPS.md/SPEC §13.4). The browser triggers a
// sync but never chooses what to sync - repo_ids/for_user are server config,
// same as the CLI's --repos/--user but sourced from env for the UI path.

module.exports = function make_web_sync_item() {
  return async function web_sync_item(this: any, _msg: any) {
    const repos = process.env.REPO_MANAGER_REPOS
    const user = process.env.REPO_MANAGER_GITHUB_USER

    if (!repos || !user) {
      return { ok: false, why: 'not-configured' }
    }

    const res = await this.post({
      aim: 'inbox', sync: 'item',
      repo_ids: repos.split(','),
      for_user: user,
    })

    return res.ok ? { ok: true, created: res.created, updated: res.updated, resolved: res.resolved } : { ok: false }
  }
}
