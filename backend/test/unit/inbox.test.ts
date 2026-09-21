
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

// r3 is issue-only: i6 (assigned to maintainer1, no labels - both assigned
// AND untriaged), i7 (mentions @maintainer1, not assigned, labeled), i8
// (nobody's on it, no labels - untriaged only). See forge_mem.ts.
const SYNC_R3 = { aim: 'inbox', sync: 'item', repo_ids: ['r3'], forge: 'mem', for_user: 'maintainer1' }

// r4/r5: the same renovate-bot version bump (p9/p10), fingerprinting to the
// same title once the version numbers are normalised away - a bot-pr
// campaign (SPEC §12.4).
const SYNC_R45 = { aim: 'inbox', sync: 'item', repo_ids: ['r4', 'r5'], forge: 'mem', for_user: 'maintainer1' }

// r7 has no files at all - fails standard-ci's file.exists check, so it's
// the one dedicated drifted repo (r1-r6 are all made CI-compliant so the
// drift check can't perturb their unrelated exact-count assertions above).
const SYNC_R7 = { aim: 'inbox', sync: 'item', repo_ids: ['r7'], forge: 'mem', for_user: 'maintainer1' }


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


  // Issue item kinds (SPEC §12): issue.assigned, issue.mentioned,
  // issue.untriaged - same derivation machinery as the PR kinds, over
  // aim:forge,list:issue instead of list:pr.

  test('sync-detects-assigned-mentioned-and-untriaged-issues', async () => {
    const seneca = await makeSeneca()

    const synced = await seneca.post(SYNC_R3)
    expect(synced.ok).true()
    // i6 fires both assigned AND untriaged (not mutually exclusive by
    // design - see detect.ts), i7 fires mentioned, i8 fires untriaged.
    expect(synced.created).equal(4)

    const listed = await seneca.post('aim:inbox,list:item')
    const byKind: any = {}
    for (const it of listed.items) {
      byKind[it.kind] = byKind[it.kind] || []
      byKind[it.kind].push(it)
    }

    expect(byKind['issue.assigned'].length).equal(1)
    expect(byKind['issue.assigned'][0].subject_id).equal('i6')
    expect(byKind['issue.assigned'][0].priority).equal('soon')

    expect(byKind['issue.mentioned'].length).equal(1)
    expect(byKind['issue.mentioned'][0].subject_id).equal('i7')
    expect(byKind['issue.mentioned'][0].priority).equal('soon')

    expect(byKind['issue.untriaged'].length).equal(2)
    const untriagedIds = byKind['issue.untriaged'].map((it: any) => it.subject_id).sort()
    expect(untriagedIds).equal(['i6', 'i8'])
    expect(byKind['issue.untriaged'][0].priority).equal('later')

    await seneca.close()
  })


  test('issue-assigned-resolves-once-a-label-is-added', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC_R3)
    const before = await seneca.post('aim:inbox,list:item')
    expect(before.items.filter((it: any) => 'issue.untriaged' === it.kind).length).equal(2)

    // i8 gets triaged (a label appears) - the untriaged condition for it
    // disappears, same auto-resolve path as a merged PR.
    await seneca.post('aim:forge,label:issue,forge:mem', { issue_id: 'i8', labels: ['bug'] })
    const resynced = await seneca.post(SYNC_R3)
    expect(resynced.resolved).equal(1)

    const after = await seneca.post('aim:inbox,list:item')
    expect(after.items.filter((it: any) => 'issue.untriaged' === it.kind).length).equal(1)
    expect(after.items.some((it: any) => 'i8' === it.subject_id)).false()

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


  // Undo (SPEC §13.3): only dismiss/snooze are reversible - pure local
  // state, no forge call. close/merge land on the same 'done' state but
  // must NOT be undoable (S13) - msg.kind is what tells them apart.

  test('undo-dismiss-reopens-the-item', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    await seneca.post('aim:inbox,dismiss:item', { id })
    const undone = await seneca.post('aim:inbox,undo:item', { id, kind: 'dismiss' })
    expect(undone.ok).true()
    expect(undone.item.state).equal('open')

    const after = await seneca.post('aim:inbox,list:item')
    expect(after.items.length).equal(1)

    await seneca.close()
  })


  test('undo-snooze-reopens-the-item', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    await seneca.post('aim:inbox,snooze:item', { id, until: Date.now() + 3600000 })
    const undone = await seneca.post('aim:inbox,undo:item', { id, kind: 'snooze' })
    expect(undone.ok).true()
    expect(undone.item.state).equal('open')

    const reloaded = (await seneca.post('aim:inbox,list:item')).items[0]
    expect(reloaded.state).equal('open')

    await seneca.close()
  })


  test('undo-refuses-a-merged-item-even-though-state-is-also-done', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    await seneca.post('aim:inbox,merge:item', { id })
    // A stray/replayed undo:dismiss must not resurrect an irreversible merge.
    const undone = await seneca.post('aim:inbox,undo:item', { id, kind: 'dismiss' })
    expect(undone.ok).false()
    expect(undone.why).equal('nothing-to-undo')

    await seneca.close()
  })


  test('undo-on-unknown-id-reports-not-found', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,undo:item', { id: 'does-not-exist', kind: 'dismiss' })
    expect(res.ok).false()
    expect(res.why).equal('not-found')

    await seneca.close()
  })


  // first_response_at (SPEC §12, drives the aging view §12.4): set by the
  // first response an outside party can see - approve/comment/close/merge -
  // never by label or priority alone, and never overwritten once set.

  test('comment-sets-first-response-at-once-and-only-once', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    const before = (await seneca.post('aim:inbox,list:item')).items[0]
    expect(before.first_response_at).undefined()

    const first = await seneca.post('aim:inbox,comment:item', { id, body: 'looking into it' })
    expect(first.item.first_response_at).exist()
    const firstAt = first.item.first_response_at

    const second = await seneca.post('aim:inbox,comment:item', { id, body: 'a follow-up' })
    expect(second.item.first_response_at).equal(firstAt)

    await seneca.close()
  })


  test('label-item-does-not-set-first-response-at', async () => {
    const seneca = await makeSeneca()
    await seneca.post(SYNC)
    const id = (await seneca.post('aim:inbox,list:item')).items[0].id

    await seneca.post('aim:inbox,label:item', { id, labels: ['needs-work'] })
    const after = (await seneca.post('aim:inbox,list:item')).items[0]
    expect(after.first_response_at).undefined()

    await seneca.close()
  })


  // Saved replies (SPEC §12.4): rpm/reply, seeded with the spec's five
  // named intents on first use.

  test('list-reply-seeds-the-five-spec-named-intents-on-first-use', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,list:reply')
    expect(res.ok).true()
    expect(res.replies.length).equal(5)

    const intents = res.replies.map((r: any) => r.intent).sort()
    expect(intents).equal([
      'duplicate-of', 'needs-more-info', 'out-of-scope', 'security-ack', 'thanks-and-merged',
    ])
    for (const r of res.replies) {
      expect(r.body.includes('{author}')).true()
    }

    await seneca.close()
  })


  test('list-reply-does-not-reseed-on-a-second-call', async () => {
    const seneca = await makeSeneca()

    await seneca.post('aim:inbox,list:reply')
    const again = await seneca.post('aim:inbox,list:reply')
    expect(again.replies.length).equal(5)

    await seneca.close()
  })


  // Campaigns, stub depth (SPEC §12.4): grouping computed and displayed,
  // no fan-out action yet. p9 (r4) and p10 (r5) are the same renovate-bot
  // version bump - same fingerprint+author, across 2+ repos.

  test('sync-groups-a-bot-pr-campaign-and-hides-its-members', async () => {
    const seneca = await makeSeneca()

    const synced = await seneca.post(SYNC_R45)
    expect(synced.ok).true()
    // p9's pr.inbound item, p10's pr.inbound item, plus the one campaign
    // item grouping them.
    expect(synced.created).equal(3)

    const listed = await seneca.post('aim:inbox,list:item')
    const campaign = listed.items.find((it: any) => 'campaign.bot_pr' === it.kind)
    expect(campaign).exist()
    expect(campaign.source).equal('campaign')
    expect(campaign.payload.member_count).equal(2)
    expect(campaign.priority).equal('later')

    // The members themselves no longer show up in the default list -
    // just the one campaign row standing in for both.
    const memberRows = listed.items.filter((it: any) => 'pr.inbound' === it.kind && ['p9', 'p10'].includes(it.subject_id))
    expect(memberRows.length).equal(0)
    expect(listed.items.length).equal(1)

    await seneca.close()
  })


  test('campaign-releases-its-remaining-member-once-the-group-drops-below-two', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC_R45)
    expect((await seneca.post('aim:inbox,list:item')).items.length).equal(1)

    // p10 merges (drops out of r5's open PRs) - only p9 is left, below the
    // 2-repo grouping threshold, so the campaign auto-resolves.
    await seneca.post('aim:forge,merge:pr,forge:mem', { pr_id: 'p10' })
    const resynced = await seneca.post(SYNC_R45)
    expect(resynced.ok).true()

    const after = await seneca.post('aim:inbox,list:item')
    expect(after.items.length).equal(1)
    expect(after.items[0].kind).equal('pr.inbound')
    expect(after.items[0].subject_id).equal('p9')
    expect(after.items[0].grouped_into).null()

    await seneca.close()
  })


  test('campaign-item-does-not-support-comment-label-or-close', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC_R45)
    const campaignId = (await seneca.post('aim:inbox,list:item')).items[0].id

    const commented = await seneca.post('aim:inbox,comment:item', { id: campaignId, body: 'hi' })
    expect(commented.ok).false()
    expect(commented.why).equal('not-supported')

    const labeled = await seneca.post('aim:inbox,label:item', { id: campaignId, labels: ['x'] })
    expect(labeled.ok).false()
    expect(labeled.why).equal('not-supported')

    const closed = await seneca.post('aim:inbox,close:item', { id: campaignId, reason: 'because' })
    expect(closed.ok).false()
    expect(closed.why).equal('not-supported')

    await seneca.close()
  })


  test('campaign-item-can-still-be-dismissed', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC_R45)
    const campaignId = (await seneca.post('aim:inbox,list:item')).items[0].id

    const dismissed = await seneca.post('aim:inbox,dismiss:item', { id: campaignId })
    expect(dismissed.ok).true()
    expect(dismissed.item.state).equal('done')

    await seneca.close()
  })


  // Policy checks (SPEC §14.1): repo.drift items, derived from the seeded
  // standard-ci policy via aim:forge,get:file - see check_policy.ts.

  test('sync-creates-a-drift-item-for-a-noncompliant-repo', async () => {
    const seneca = await makeSeneca()

    const synced = await seneca.post(SYNC_R7)
    expect(synced.ok).true()
    expect(synced.created).equal(1)

    const listed = await seneca.post('aim:inbox,list:item')
    expect(listed.items.length).equal(1)
    expect(listed.items[0].kind).equal('repo.drift')
    expect(listed.items[0].subject_id).equal('standard-ci')
    expect(listed.items[0].priority).equal('soon')
    expect(listed.items[0].title).contain('.github/workflows/ci.yml not found')

    await seneca.close()
  })


  test('sync-does-not-create-a-drift-item-for-a-compliant-repo', async () => {
    const seneca = await makeSeneca()

    // r1 is CI-compliant (see forge_mem.ts) - SYNC's own review-request
    // item is still the only item, same count as before drift existed.
    const synced = await seneca.post(SYNC)
    expect(synced.created).equal(1)

    const listed = await seneca.post('aim:inbox,list:item')
    expect(listed.items.some((it: any) => 'repo.drift' === it.kind)).false()

    await seneca.close()
  })


  test('drift-item-does-not-support-comment-label-close-approve-or-merge', async () => {
    const seneca = await makeSeneca()

    await seneca.post(SYNC_R7)
    const driftId = (await seneca.post('aim:inbox,list:item')).items[0].id

    const commented = await seneca.post('aim:inbox,comment:item', { id: driftId, body: 'hi' })
    expect(commented.ok).false()
    expect(commented.why).equal('not-supported')

    const labeled = await seneca.post('aim:inbox,label:item', { id: driftId, labels: ['x'] })
    expect(labeled.ok).false()
    expect(labeled.why).equal('not-supported')

    const closed = await seneca.post('aim:inbox,close:item', { id: driftId, reason: 'because' })
    expect(closed.ok).false()
    expect(closed.why).equal('not-supported')

    const approved = await seneca.post('aim:inbox,approve:item', { id: driftId })
    expect(approved.ok).false()
    expect(approved.why).equal('not-supported')

    const merged = await seneca.post('aim:inbox,merge:item', { id: driftId })
    expect(merged.ok).false()
    expect(merged.why).equal('not-supported')

    await seneca.close()
  })


  test('drift-check-runs-independently-per-repo-in-a-multi-repo-sync', async () => {
    const seneca = await makeSeneca()

    // r1 (compliant) and r7 (not) in the same sync - only r7 should drift.
    const synced = await seneca.post({ aim: 'inbox', sync: 'item', repo_ids: ['r1', 'r7'], forge: 'mem', for_user: 'maintainer1' })
    expect(synced.ok).true()

    const listed = await seneca.post('aim:inbox,list:item')
    const drifted = listed.items.filter((it: any) => 'repo.drift' === it.kind)
    expect(drifted.length).equal(1)
    expect(drifted[0].repo).equal('r7')

    await seneca.close()
  })


  // The drift matrix (SPEC §14.3): every (repo, policy) cell, not just the
  // non-compliant ones - a browse endpoint, no rpm/item lookup.

  test('list-drift-returns-every-repo-policy-cell-compliant-or-not', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,list:drift', { repo_ids: ['r1', 'r7'], forge: 'mem' })
    expect(res.ok).true()
    expect(res.policies.length).equal(1)
    expect(res.policies[0].id).equal('standard-ci')
    expect(res.cells.length).equal(2)

    const byRepo: any = {}
    for (const cell of res.cells) byRepo[cell.repo] = cell

    expect(byRepo['r1'].status).equal('compliant')
    expect(byRepo['r1'].why).undefined()
    expect(byRepo['r7'].status).equal('drifted')
    expect(byRepo['r7'].why).contain('not found')

    await seneca.close()
  })


  // SPEC §14.3's other two cell states: not-applicable (the policy's own
  // `applies: { hasFile: package.json }` gate excludes a repo that has no
  // package.json at all) and error (the forge call itself fails, so
  // compliance can't be determined - distinct from a genuine drift).

  test('list-drift-reports-not-applicable-for-a-repo-with-no-package-json', async () => {
    const seneca = await makeSeneca()

    // No files entry at all for this repo_id - forge_mem's get:file
    // returns exists:false for every path, including package.json.
    const res = await seneca.post('aim:inbox,list:drift', { repo_ids: ['tabnas/native-bridge'], forge: 'mem' })
    expect(res.ok).true()
    expect(res.cells[0].status).equal('not-applicable')
    expect(res.cells[0].why).contain('package.json')

    await seneca.close()
  })

  test('list-drift-reports-error-when-the-forge-call-itself-fails', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:inbox,list:drift', { repo_ids: ['voxgig-sdk/legacy-connector'], forge: 'mem' })
    expect(res.ok).true()
    expect(res.cells[0].status).equal('error')
    expect(res.cells[0].why).equal('rate limited')

    await seneca.close()
  })

  test('sync-does-not-create-a-drift-item-for-not-applicable-or-error-repos', async () => {
    const seneca = await makeSeneca()

    const synced = await seneca.post({
      aim: 'inbox', sync: 'item', forge: 'mem', for_user: 'maintainer1',
      repo_ids: ['tabnas/native-bridge', 'voxgig-sdk/legacy-connector'],
    })
    expect(synced.ok).true()
    expect(synced.created).equal(0)

    const listed = await seneca.post('aim:inbox,list:item')
    expect(listed.items.some((it: any) => 'repo.drift' === it.kind)).false()

    await seneca.close()
  })

})
