
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import Seneca from 'seneca'

const forge_gitlab = require('../../dist/forge/forge_gitlab.js')

const REPO = 'demo-group/demo-project'


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.test()
  seneca.use(forge_gitlab)

  return seneca.ready()
}


// SPEC §19.5's GitLab stub: same base aim:forge,* contract as forge:github/
// forge:mem, canned data - enough to prove nothing dispatches on GitLab
// specifics, and no more. One test per pattern, same shape as forge-mem's
// own suite.
describe('forge-gitlab', () => {

  test('list-pr-for-repo', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,list:pr,forge:gitlab', { repo_id: REPO })
    expect(res.ok).true()
    expect(res.prs.length).equal(1)
    expect(res.prs[0].title).equal('Fix pipeline timeout')

    await seneca.close()
  })

  test('list-issue-for-repo', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,list:issue,forge:gitlab', { repo_id: REPO })
    expect(res.ok).true()
    expect(res.issues.length).equal(1)
    expect(res.issues[0].title).equal('Pipeline flakes on retry')

    await seneca.close()
  })

  test('load-pr-returns-and-reports-not-found', async () => {
    const seneca = await makeSeneca()

    const found = await seneca.post('aim:forge,load:pr,forge:gitlab', { pr_id: 'g1' })
    expect(found.ok).true()
    expect(found.pr.author).equal('glcontributor1')

    const missing = await seneca.post('aim:forge,load:pr,forge:gitlab', { pr_id: 'does-not-exist' })
    expect(missing.ok).false()
    expect(missing.why).equal('not-found')

    await seneca.close()
  })

  test('open-pr-creates-and-stores', async () => {
    const seneca = await makeSeneca()

    const opened = await seneca.post('aim:forge,open:pr,forge:gitlab', { repo_id: REPO, title: 'New feature' })
    expect(opened.ok).true()

    const listed = await seneca.post('aim:forge,list:pr,forge:gitlab', { repo_id: REPO })
    expect(listed.prs.length).equal(2)

    await seneca.close()
  })

  test('merge-pr-changes-state', async () => {
    const seneca = await makeSeneca()

    const merged = await seneca.post('aim:forge,merge:pr,forge:gitlab', { pr_id: 'g1' })
    expect(merged.ok).true()
    expect(merged.pr.state).equal('merged')

    const missing = await seneca.post('aim:forge,merge:pr,forge:gitlab', { pr_id: 'does-not-exist' })
    expect(missing.ok).false()

    await seneca.close()
  })

  test('dismiss-alert-marks-dismissed-and-list-alert-reflects-it', async () => {
    const seneca = await makeSeneca()

    const before = await seneca.post('aim:forge,list:alert,forge:gitlab', { repo_id: REPO })
    expect(before.alerts[0].dismissed).false()

    const dismissed = await seneca.post('aim:forge,dismiss:alert,forge:gitlab', { alert_id: 'ga1' })
    expect(dismissed.ok).true()

    const after = await seneca.post('aim:forge,list:alert,forge:gitlab', { repo_id: REPO })
    expect(after.alerts[0].dismissed).true()

    await seneca.close()
  })

  test('get-info-reports-capabilities', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,get:info,forge:gitlab')
    expect(res.ok).true()
    expect(res.capabilities).includes('merge:pr')

    await seneca.close()
  })

  test('get-file-reports-not-found', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,get:file,forge:gitlab', { repo_id: REPO, path: 'renovate.json' })
    expect(res.ok).true()
    expect(res.exists).false()

    await seneca.close()
  })

  test('get-members-reports-empty', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,get:members,forge:gitlab', { org: 'demo-group' })
    expect(res.ok).true()
    expect(res.logins).equal([])

    await seneca.close()
  })

  test('read-only-patterns-all-answer-ok', async () => {
    const seneca = await makeSeneca()

    const patterns = [
      'aim:forge,comment:issue,forge:gitlab',
      'aim:forge,label:issue,forge:gitlab',
      'aim:forge,assign:issue,forge:gitlab',
      'aim:forge,close:issue,forge:gitlab',
      'aim:forge,approve:pr,forge:gitlab',
      'aim:forge,request:review,forge:gitlab',
    ]

    for (const pat of patterns) {
      const res = await seneca.post(pat, { issue_id: 'gi1', pr_id: 'g1', body: 'hi' })
      expect(res.ok).true()
    }

    const checks = await seneca.post('aim:forge,list:check,forge:gitlab', { pr_id: 'g1' })
    expect(checks.ok).true()
    expect(checks.checks.length).equal(1)
    expect(checks.checks[0].status).equal('success')

    await seneca.close()
  })

  // The point of the stub (SPEC §19.5): the same service code that drives
  // forge:github/forge:mem works unchanged against forge:gitlab - proven
  // by routing a real sync through it, not just exercising the base
  // patterns directly.
  test('sync-item-derives-a-pr-inbound-item-from-forge-gitlab-data', async () => {
    const seneca = await makeFullSeneca()

    // g1 has no requested reviewer and isn't maintainer1's own PR ->
    // pr.inbound, same detector as any other forge.
    const synced = await seneca.post({
      aim: 'inbox', sync: 'item', forge: 'gitlab', for_user: 'maintainer1', repo_ids: [REPO],
    })
    expect(synced.ok).true()
    expect(synced.created >= 1).true()

    const listed = await seneca.post('aim:inbox,list:item')
    const inbound = listed.items.find((it: any) => 'pr.inbound' === it.kind)
    expect(inbound).exist()
    expect(inbound.repo).equal(REPO)
    expect(inbound.source).equal('gitlab')

    await seneca.close()
  })

})


// Full stack (model, entity store, every service) - only the last test
// needs this; the base-pattern tests above only need the forge plugin
// itself, same split as forge-mem's own suite.
async function makeFullSeneca() {
  const { Local } = require('@voxgig/system')
  const Model = require('../../model/model.json')
  const { basic } = require('../../dist/env/shared/basic.js')

  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  seneca.test()
  basic(seneca)
  seneca.use(forge_gitlab)

  seneca.use(Local, {
    srv: { folder: __dirname + '/../../dist/srv' },
  })

  return seneca.ready()
}
