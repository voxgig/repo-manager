// Polls the given repos via aim:forge,list:pr / list:issue, runs every
// detector (./detect.ts) over each subject, and stores one rpm/item per
// condition found - condition -> item, per SPEC §12.1:
//   no item, condition present  -> create
//   item exists, digest same    -> no-op
//   item exists, digest changed -> update (reopen if it was done)
//   item exists, condition gone -> auto-resolve (remove; "no undo" yet)

import * as crypto from 'crypto'

const { PR_DETECTORS, ISSUE_DETECTORS, priorityFor, fingerprintTitle } = require('./detect')
const { SEED_POLICIES, runPolicy } = require('./check_policy')

// Same shape for both subject kinds: which aim:forge,list:* answers it,
// which field of the response carries the list, which detectors run over it.
const SOURCES = [
  { list: 'pr', items_key: 'prs', detectors: PR_DETECTORS },
  { list: 'issue', items_key: 'issues', detectors: ISSUE_DETECTORS },
]

module.exports = function make_sync_item() {
  return async function sync_item(this: any, msg: any) {
    const seneca = this

    const repo_ids: string[] = msg.repo_ids || []
    const forge: string = msg.forge || process.env.REPO_MANAGER_FORGE || 'github'
    const for_user: string = msg.for_user

    const seen = new Set<string>()
    let created = 0
    let updated = 0

    // Fed by the pr.inbound branch below, for the campaign grouping pass
    // after the main loop - SPEC §12.4's bot-PR grouping key is title
    // fingerprint + author, across repos.
    const inboundSeen: Array<{ org_id: string, repo_id: string, item_id: string, title: string, actor: string }> = []

    for (const repo_id of repo_ids) {
      const org_id = repo_id.split('/')[0]

      for (const source of SOURCES) {
        const res = await seneca.post({ aim: 'forge', list: source.list, forge, repo_id })
        if (!res.ok) continue

        for (const subject of res[source.items_key]) {
          for (const detect of source.detectors) {
            const cond = detect(subject, for_user)
            if (!cond) continue

            seen.add([org_id, forge, cond.kind, repo_id, cond.subject_id].join('|'))

            const digest = crypto.createHash('sha256').update(JSON.stringify(cond.facts)).digest('hex')
            const now = Date.now()
            const existing = (await seneca.entity('rpm/item').list$({
              org_id, source: forge, kind: cond.kind, repo: repo_id, subject_id: cond.subject_id,
            }))[0]

            let itemId = existing && existing.id

            if (!existing) {
              const saved = await seneca.entity('rpm/item').data$({
                org_id, source: forge, repo: repo_id, kind: cond.kind,
                title: cond.title, url: cond.url, actor: cond.actor, subject_id: cond.subject_id,
                priority: priorityFor(cond.kind), state: 'open',
                first_seen: now, updated_at: cond.updated_at || now,
                digest, payload: cond.payload,
              }).save$()
              itemId = saved.id
              created++
            }
            else {
              let dirty = false

              if (existing.digest !== digest) {
                existing.title = cond.title
                existing.updated_at = cond.updated_at || now
                existing.digest = digest
                dirty = true
                if ('done' === existing.state) {
                  existing.state = 'open'
                }
              }

              // Snoozed -> Open once `until` passes, regardless of digest -
              // the condition is still true, so the wake is unconditional.
              if ('snoozed' === existing.state && now >= (existing.snooze_until || 0)) {
                existing.state = 'open'
                // snooze_until is left as-is, not cleared: rpm/item's
                // schema (ent.aon) types it Number and rejects null, and
                // seneca-entity silently drops a plain `= undefined`
                // assignment on save$() (never persists). Harmless either
                // way - every reader of this field gates on
                // state === 'snoozed' first (sync_item.ts above,
                // inbox.js's renderFocus), so a stale value on a
                // reopened item is inert until the next real snooze
                // overwrites it.
                dirty = true
              }

              if (dirty) {
                await existing.save$()
                updated++
              }
            }

            if ('pr.inbound' === cond.kind) {
              inboundSeen.push({ org_id, repo_id, item_id: itemId, title: cond.title, actor: cond.actor })
            }
          }
        }
      }
    }

    const campaignCounts = await syncCampaigns(seneca, inboundSeen)
    created += campaignCounts.created
    updated += campaignCounts.updated

    // Policy checks (SPEC §14.1) - repo.drift items. Compliant repo/policy
    // pairs are deliberately NOT added to `seen`: the generic auto-resolve
    // sweep below removes any stale drift item for them, same as a merged
    // PR's condition disappearing - no separate resolve logic needed here.
    const driftCounts = await syncDrift(seneca, repo_ids, forge, seen)
    created += driftCounts.created
    updated += driftCounts.updated

    // Auto-resolve: open OR snoozed items in this sync's scope whose
    // condition wasn't seen this pass - the PR merged, closed, went
    // stale->fresh, or the review request was withdrawn. Snoozed items
    // resolve just as silently (SPEC §12.1's state machine): a snooze is a
    // "not now", not a promise the condition survives until it wakes.
    const open_items = await seneca.entity('rpm/item').list$({ state: 'open' })
    const snoozed_items = await seneca.entity('rpm/item').list$({ state: 'snoozed' })
    let resolved = campaignCounts.resolved
    for (const item of [...open_items, ...snoozed_items]) {
      if (!repo_ids.includes(item.repo)) continue
      const key = [item.org_id, item.source, item.kind, item.repo, item.subject_id].join('|')
      if (!seen.has(key)) {
        await seneca.entity('rpm/item').remove$(item.id)
        resolved++
      }
    }

    return { ok: true, created, updated, resolved, seen: seen.size }
  }
}


// SPEC §14.1/§14.3: one repo.drift item per (repo, policy) that fails its
// check - real WorkItem rows, same lifecycle as everything else, reusing
// the caller's auto-resolve sweep for the "went compliant again" case
// (see the call site's comment). No apply/bulk-write pipeline yet
// (Stage 3, §19.6) - check only.
async function syncDrift(seneca: any, repo_ids: string[], forge: string, seen: Set<string>) {
  let created = 0
  let updated = 0
  const now = Date.now()

  for (const repo_id of repo_ids) {
    const org_id = repo_id.split('/')[0]

    for (const policy of SEED_POLICIES) {
      // Only a genuine drift becomes a work item - not-applicable (the
      // policy's `applies` gate excludes this repo) and error (the forge
      // call itself failed) are matrix-only signals, not something the
      // maintainer needs to act on the same way.
      const result = await runPolicy(seneca, forge, repo_id, policy)
      if ('drifted' !== result.status) {
        continue
      }

      seen.add([org_id, forge, 'repo.drift', repo_id, policy.id].join('|'))

      const digest = crypto.createHash('sha256').update(result.why || '').digest('hex')
      const existing = (await seneca.entity('rpm/item').list$({
        org_id, source: forge, kind: 'repo.drift', repo: repo_id, subject_id: policy.id,
      }))[0]

      if (!existing) {
        await seneca.entity('rpm/item').data$({
          org_id, source: forge, repo: repo_id, kind: 'repo.drift', subject_id: policy.id,
          title: `${policy.description} - ${result.why}`,
          priority: priorityFor('repo.drift'), state: 'open',
          first_seen: now, updated_at: now, digest, payload: { policy_id: policy.id, why: result.why },
        }).save$()
        created++
      }
      else if (existing.digest !== digest) {
        existing.title = `${policy.description} - ${result.why}`
        existing.updated_at = now
        existing.digest = digest
        existing.payload = { policy_id: policy.id, why: result.why }
        if ('done' === existing.state) {
          existing.state = 'open'
        }
        await existing.save$()
        updated++
      }
    }
  }

  return { created, updated }
}


// SPEC §12.4: "the same bot PR opened in 200 generated repos" - grouped
// into a campaign, one derived rpm/item (source:'campaign') per group of
// 2+ distinct repos, per SPEC §12.3's "row type stays WorkItem, not a
// union". Members get item.grouped_into set so they leave the default
// list (list_item.ts filters on it) - the spec's own "Grouped" state
// from §12.1's diagram, represented as a flag rather than a new
// item.state value so the existing open/snoozed/done/muted machinery
// (and every test written against it) stays untouched.
//
// Stub depth, matching Stage 2's own scoping: grouping computed and
// displayed, no fan-out action, no excluded/pulled-out affordance yet -
// those are Stage 3 (§19.6).
async function syncCampaigns(seneca: any, inboundSeen: any[]) {
  let created = 0
  let updated = 0
  let resolved = 0

  const groups = new Map<string, any[]>()
  for (const it of inboundSeen) {
    const key = fingerprintTitle(it.title) + '|' + it.actor
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(it)
  }

  const now = Date.now()
  const activeCampaignIds = new Set<string>()

  for (const members of groups.values()) {
    // The same repo opening the "same" PR twice isn't a campaign - needs
    // 2+ distinct repos to be worth grouping at all.
    if (new Set(members.map((m) => m.repo_id)).size < 2) {
      continue
    }

    const campaignId = crypto.createHash('sha256')
      .update(fingerprintTitle(members[0].title) + '|' + members[0].actor)
      .digest('hex').slice(0, 16)
    activeCampaignIds.add(campaignId)

    const memberIds = members.map((m) => m.item_id)
    const title = `${members.length} similar PRs from ${members[0].actor}: "${members[0].title}"`
    const digest = crypto.createHash('sha256').update(JSON.stringify(memberIds.slice().sort())).digest('hex')

    const existing = (await seneca.entity('rpm/item').list$({
      source: 'campaign', kind: 'campaign.bot_pr', subject_id: campaignId,
    }))[0]

    if (!existing) {
      await seneca.entity('rpm/item').data$({
        org_id: members[0].org_id, source: 'campaign', kind: 'campaign.bot_pr', subject_id: campaignId,
        title, actor: members[0].actor, priority: priorityFor('campaign.bot_pr'), state: 'open',
        first_seen: now, updated_at: now, digest, payload: { member_ids: memberIds, member_count: memberIds.length },
      }).save$()
      created++
    }
    else if (existing.digest !== digest) {
      existing.title = title
      existing.updated_at = now
      existing.digest = digest
      existing.payload = { member_ids: memberIds, member_count: memberIds.length }
      if ('done' === existing.state) {
        existing.state = 'open'
      }
      await existing.save$()
      updated++
    }

    for (const id of memberIds) {
      const item = await seneca.entity('rpm/item').load$(id)
      if (item && campaignId !== item.grouped_into) {
        item.grouped_into = campaignId
        await item.save$()
      }
    }
  }

  // A campaign whose group didn't reform this pass (a member merged/closed,
  // or the group dropped below 2) auto-resolves like any other item, and
  // releases its remaining members back into the default inbox. Assumes a
  // sync always covers the full configured fleet (true for both the CLI
  // and the web "sync now" command) - a partial-repo sync would wrongly
  // resolve a campaign whose other members are simply out of scope.
  const existingCampaigns = await seneca.entity('rpm/item').list$({ source: 'campaign', kind: 'campaign.bot_pr' })
  for (const campaign of existingCampaigns) {
    if (activeCampaignIds.has(campaign.subject_id)) {
      continue
    }
    for (const id of (campaign.payload && campaign.payload.member_ids) || []) {
      const item = await seneca.entity('rpm/item').load$(id)
      if (item && campaign.subject_id === item.grouped_into) {
        // null, not undefined - seneca-entity silently drops an
        // undefined assignment on save$(), so the old value would
        // survive a reload (list_item.ts's !it.grouped_into filter
        // would then keep hiding it forever).
        item.grouped_into = null
        await item.save$()
      }
    }
    await seneca.entity('rpm/item').remove$(campaign.id)
    resolved++
  }

  return { created, updated, resolved }
}
