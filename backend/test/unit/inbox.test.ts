
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import Seneca from 'seneca'
import { Local } from '@voxgig/system'

import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const forge_mem = require('../fixtures/forge_mem.js')


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  seneca.test()
  basic(seneca)
  seneca.use(forge_mem)

  seneca.use(Local, {
    srv: { folder: __dirname + '/../../dist/srv' },
  })

  return seneca.ready()
}


// forge_mem's fixture: PR p1 on repo r1, requesting review from
// maintainer1 - see test/fixtures/forge_mem.ts.
const SYNC = { aim: 'inbox', sync: 'item', repo_ids: ['r1'], forge: 'mem', for_user: 'maintainer1' }


describe('inbox', () => {

  test('sync-creates-item-for-review-request', async () => {
    const seneca = await makeSeneca()

    const synced = await seneca.post(SYNC)
    expect(synced.ok).true()
    expect(synced.created).equal(1)

    const listed = await seneca.post('aim:inbox,list:item')
    expect(listed.items.length).equal(1)
    expect(listed.items[0].kind).equal('pr.review_requested')
    expect(listed.items[0].repo).equal('r1')
    expect(listed.items[0].title).equal('Fix thing')
    expect(listed.items[0].actor).equal('contributor1')
    expect(listed.items[0].state).equal('open')

    await seneca.close()
  })


  test('second-sync-is-a-no-op-when-nothing-changed', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC)
    const again = await seneca.post(SYNC)

    expect(again.created).equal(0)
    expect(again.updated).equal(0)
    expect(again.resolved).equal(0)

    const listed = await seneca.post('aim:inbox,list:item')
    expect(listed.items.length).equal(1)

    await seneca.close()
  })


  test('dismiss-marks-done-and-drops-out-of-open-list', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC)
    const listed = await seneca.post('aim:inbox,list:item')
    const id = listed.items[0].id

    const dismissed = await seneca.post('aim:inbox,dismiss:item', { id })
    expect(dismissed.ok).true()
    expect(dismissed.item.state).equal('done')

    const after = await seneca.post('aim:inbox,list:item')
    expect(after.items.length).equal(0)

    await seneca.close()
  })


  test('dismiss-unknown-id-reports-not-found', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,dismiss:item', { id: 'does-not-exist' })
    expect(res.ok).false()
    expect(res.why).equal('not-found')

    await seneca.close()
  })


  test('auto-resolves-when-condition-leaves-synced-scope', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC)
    expect((await seneca.post('aim:inbox,list:item')).items.length).equal(1)

    // The PR merges - it drops out of the open-PRs list, so the review
    // request condition that created the item is gone from this pass.
    await seneca.post('aim:forge,merge:pr,forge:mem', { pr_id: 'p1' })
    const resynced = await seneca.post(SYNC)
    expect(resynced.resolved).equal(1)

    const after = await seneca.post('aim:inbox,list:item')
    expect(after.items.length).equal(0)

    await seneca.close()
  })


  test('dismissed-item-stays-dismissed-on-an-unchanged-digest-resync', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC)
    const before = await seneca.post('aim:inbox,list:item')
    await seneca.post('aim:inbox,dismiss:item', { id: before.items[0].id })

    // Same condition, nothing about it changed - re-syncing must not
    // reopen it. Only a digest change (SPEC §12.1) does that.
    const resynced = await seneca.post(SYNC)
    expect(resynced.created).equal(0)
    expect(resynced.updated).equal(0)

    const after = await seneca.post('aim:inbox,list:item')
    expect(after.items.length).equal(0)

    await seneca.close()
  })

})
