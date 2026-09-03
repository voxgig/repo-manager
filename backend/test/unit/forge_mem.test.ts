
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import Seneca from 'seneca'

const forge_mem = require('../fixtures/forge_mem.js')


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.test()
  seneca.use(forge_mem)

  return seneca.ready()
}


describe('forge-mem', () => {

  test('list-pr-for-repo', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,list:pr,forge:mem', { repo_id: 'r1' })

    expect(res.ok).true()
    expect(res.prs.length).equal(1)
    expect(res.prs[0].title).equal('Fix thing')

    await seneca.close()
  })


  test('open-pr-creates-and-stores', async () => {
    const seneca = await makeSeneca()

    const opened = await seneca.post('aim:forge,open:pr,forge:mem', { repo_id: 'r1', title: 'New feature' })
    expect(opened.ok).true()
    expect(opened.pr.title).equal('New feature')

    const listed = await seneca.post('aim:forge,list:pr,forge:mem', { repo_id: 'r1' })
    expect(listed.prs.length).equal(2)

    await seneca.close()
  })


  test('get-info-reports-capabilities', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,get:info,forge:mem')
    expect(res.ok).true()
    expect(res.capabilities).includes('merge:pr')

    await seneca.close()
  })


  test('merge-pr-changes-state', async () => {
    const seneca = await makeSeneca()

    const merged = await seneca.post('aim:forge,merge:pr,forge:mem', { pr_id: 'p1' })
    expect(merged.ok).true()
    expect(merged.pr.state).equal('merged')

    const missing = await seneca.post('aim:forge,merge:pr,forge:mem', { pr_id: 'does-not-exist' })
    expect(missing.ok).false()
    expect(missing.why).equal('not-found')

    await seneca.close()
  })


  test('dismiss-alert-marks-dismissed-and-list-alert-reflects-it', async () => {
    const seneca = await makeSeneca()

    const before = await seneca.post('aim:forge,list:alert,forge:mem', { repo_id: 'r1' })
    expect(before.alerts[0].dismissed).false()

    const dismissed = await seneca.post('aim:forge,dismiss:alert,forge:mem', { alert_id: 'a1' })
    expect(dismissed.ok).true()

    const after = await seneca.post('aim:forge,list:alert,forge:mem', { repo_id: 'r1' })
    expect(after.alerts[0].dismissed).true()

    await seneca.close()
  })


  test('read-only-patterns-all-answer-ok', async () => {
    const seneca = await makeSeneca()

    const patterns = [
      'aim:forge,comment:issue,forge:mem',
      'aim:forge,label:issue,forge:mem',
      'aim:forge,assign:issue,forge:mem',
      'aim:forge,close:issue,forge:mem',
      'aim:forge,approve:pr,forge:mem',
      'aim:forge,request:review,forge:mem',
    ]

    for (const pat of patterns) {
      const res = await seneca.post(pat, { issue_id: 'i1', pr_id: 'p1', body: 'hi' })
      expect(res.ok).true()
    }

    const checks = await seneca.post('aim:forge,list:check,forge:mem', { pr_id: 'p1' })
    expect(checks.ok).true()
    expect(checks.checks.length).equal(1)
    expect(checks.checks[0].status).equal('success')

    await seneca.close()
  })

})
