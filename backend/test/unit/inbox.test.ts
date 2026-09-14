
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

// r2 has p2 (contributor2's PR, no review request - pr.inbound) and p3
// (maintainer1's own 20-day-old PR - pr.stale).
const SYNC_R2 = { aim: 'inbox', sync: 'item', repo_ids: ['r2'], forge: 'mem', for_user: 'maintainer1' }


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


  // Pull requests / Issues nav views (list_pr.ts / list_issue.ts): raw
  // fleet browse, no rpm/item behind any row - every open PR/issue across
  // the given repos, unfiltered.

  test('list-pr-aggregates-open-prs-across-repos-with-a-repo-scoped-id', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,list:pr', { repo_ids: ['r1', 'r2'], forge: 'mem' })
    expect(res.ok).true()
    expect(res.prs.length).equal(3)

    const ids = res.prs.map((p: any) => p.id)
    expect(ids.includes('r1#p1')).true()
    expect(ids.includes('r2#p2')).true()
    expect(ids.includes('r2#p3')).true()

    await seneca.close()
  })


  test('list-issue-aggregates-open-issues-across-repos-with-a-repo-scoped-id', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,list:issue', { repo_ids: ['r1'], forge: 'mem' })
    expect(res.ok).true()
    expect(res.issues.length).equal(1)
    expect(res.issues[0].id).equal('r1#i1')
    expect(res.issues[0].kind).equal('issue.open')

    await seneca.close()
  })


  // Detail view (03-pr-item.png): the single-PR load, carrying body/diff
  // stats/mergeability that list:pr's response doesn't - works for both a
  // WorkItem-backed row (subject_id) and a raw browse row (same field).

  test('load-pr-returns-detail-fields-not-carried-by-list', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,load:pr', { repo_id: 'r1', pr_id: 'p1', forge: 'mem' })
    expect(res.ok).true()
    expect(res.pr.title).equal('Fix thing')
    expect(res.pr.body).equal('Fixes the thing.')
    expect(res.pr.head_ref).equal('fix-thing')
    expect(res.pr.base_ref).equal('main')
    expect(res.pr.additions).equal(12)
    expect(res.pr.deletions).equal(3)
    expect(res.pr.changed_files).equal(2)
    expect(res.pr.commits).equal(2)
    expect(res.pr.mergeable).true()
    expect(res.pr.mergeable_state).equal('clean')

    await seneca.close()
  })


  test('load-pr-unknown-id-reports-not-found', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,load:pr', { repo_id: 'r1', pr_id: 'does-not-exist', forge: 'mem' })
    expect(res.ok).false()
    expect(res.why).equal('not-found')

    await seneca.close()
  })


  // More item kinds (SPEC §12): pr.inbound and pr.stale, both derived from
  // the same list:pr data as pr.review_requested - see ./detect.ts.

  test('sync-detects-inbound-and-stale-with-derived-priority', async () => {
    const seneca = await makeSeneca()

    const synced = await seneca.post(SYNC_R2)
    expect(synced.ok).true()
    expect(synced.created).equal(2)

    const listed = await seneca.post('aim:inbox,list:item')
    const byKind: any = {}
    for (const it of listed.items) byKind[it.kind] = it

    expect(byKind['pr.inbound'].actor).equal('contributor2')
    expect(byKind['pr.inbound'].priority).equal('now')

    expect(byKind['pr.stale'].actor).equal('maintainer1')
    expect(byKind['pr.stale'].priority).equal('later')
    expect(byKind['pr.stale'].payload.age_days >= 20).true()

    await seneca.close()
  })


  test('review-requested-pr-is-not-also-counted-as-inbound', async () => {
    const seneca = await makeSeneca()

    const synced = await seneca.post(SYNC)
    expect(synced.created).equal(1)

    const listed = await seneca.post('aim:inbox,list:item')
    expect(listed.items.length).equal(1)
    expect(listed.items[0].kind).equal('pr.review_requested')

    await seneca.close()
  })


  // Snooze (SPEC §12.1 state machine): Open -> Snoozed -> Open (time passes,
  // condition still true) or -> AutoResolved (condition gone while snoozed).

  test('snooze-item-marks-snoozed-and-drops-out-of-open-list', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const snoozed = await seneca.post('aim:inbox,snooze:item', { id, until: Date.now() + 3600000 })
    expect(snoozed.ok).true()
    expect(snoozed.item.state).equal('snoozed')

    const open = await seneca.post('aim:inbox,list:item')
    expect(open.items.length).equal(0)

    const snoozedList = await seneca.post('aim:inbox,list:item', { state: 'snoozed' })
    expect(snoozedList.items.length).equal(1)

    await seneca.close()
  })


  test('snooze-item-without-until-reports-until-required', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const res = await seneca.post('aim:inbox,snooze:item', { id })
    expect(res.ok).false()
    expect(res.why).equal('until-required')

    await seneca.close()
  })


  test('resync-reopens-snoozed-item-once-until-passes-if-condition-still-true', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    await seneca.post('aim:inbox,snooze:item', { id, until: Date.now() - 1000 })
    const resynced = await seneca.post(SYNC)
    expect(resynced.updated).equal(1)

    const open = await seneca.post('aim:inbox,list:item')
    expect(open.items.length).equal(1)
    expect(open.items[0].state).equal('open')

    await seneca.close()
  })


  test('resync-auto-resolves-snoozed-item-when-condition-disappears', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    await seneca.post('aim:inbox,snooze:item', { id, until: Date.now() + 3600000 })

    // The PR merges - the review-requested condition is gone.
    await seneca.post('aim:forge,merge:pr,forge:mem', { pr_id: 'p1' })
    const resynced = await seneca.post(SYNC)
    expect(resynced.resolved).equal(1)

    const snoozedList = await seneca.post('aim:inbox,list:item', { state: 'snoozed' })
    expect(snoozedList.items.length).equal(0)

    await seneca.close()
  })


  // Item intents (SPEC §13.2): app-nouned messages that translate to
  // aim:forge,*,forge:mem behind the gateway. forge:mem's p1/r1 fixture
  // (test/fixtures/forge_mem.ts) backs every one of these.

  test('approve-item-calls-forge-and-leaves-item-open', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const approved = await seneca.post('aim:inbox,approve:item', { id })
    expect(approved.ok).true()
    expect(approved.item.state).equal('open')

    await seneca.close()
  })


  test('merge-item-calls-forge-and-marks-item-done', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const merged = await seneca.post('aim:inbox,merge:item', { id })
    expect(merged.ok).true()
    expect(merged.item.state).equal('done')

    const after = await seneca.post('aim:inbox,list:item')
    expect(after.items.length).equal(0)

    await seneca.close()
  })


  test('comment-item-posts-through-forge', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const commented = await seneca.post('aim:inbox,comment:item', { id, body: 'looks good' })
    expect(commented.ok).true()
    expect(commented.comment.body).equal('looks good')

    await seneca.close()
  })


  test('label-item-calls-forge', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const labeled = await seneca.post('aim:inbox,label:item', { id, labels: ['needs-work'] })
    expect(labeled.ok).true()

    await seneca.close()
  })


  test('close-item-requires-a-reason-then-comments-and-closes', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const bare = await seneca.post('aim:inbox,close:item', { id })
    expect(bare.ok).false()
    expect(bare.why).equal('reason-required')

    const closed = await seneca.post('aim:inbox,close:item', { id, reason: 'superseded' })
    expect(closed.ok).true()
    expect(closed.item.state).equal('done')

    await seneca.close()
  })


  test('item-intent-on-unknown-id-reports-not-found', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,approve:item', { id: 'does-not-exist' })
    expect(res.ok).false()
    expect(res.why).equal('not-found')

    await seneca.close()
  })

})
