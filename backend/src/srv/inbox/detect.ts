// Item-kind detectors (SPEC §12): each takes a normalized PR and the syncing
// user, and returns the condition it represents, or null. sync_item runs
// every detector over every PR it fetches - the author/reviewer checks below
// keep the three mutually exclusive, so a PR becomes at most one item.

const STALE_DAYS = 14

// SPEC §12.2: derived, not user-assigned. Partial cut - only the kinds
// Stage 2 has detectors for; the rest of the heuristic (checks, conflicts,
// drift, security) lands with those kinds.
const KIND_PRIORITY: Record<string, string> = {
  'pr.review_requested': 'now',
  'pr.inbound': 'now',
  'pr.stale': 'later',
}

function priorityFor(kind: string) {
  return KIND_PRIORITY[kind] || 'later'
}

function detectReviewRequested(pr: any, for_user: string) {
  const reviewers: string[] = pr.requested_reviewers || []
  if (!reviewers.includes(for_user)) {
    return null
  }
  return {
    kind: 'pr.review_requested', subject_id: pr.id, title: pr.title, url: pr.url,
    actor: pr.author, updated_at: pr.updated_at,
    facts: { title: pr.title, state: pr.state, reviewers },
    payload: { requested_reviewers: reviewers },
  }
}

// A contributor's PR in a repo you maintain, that hasn't asked you for
// review specifically - SPEC §12.3's "biggest work item", full triage depth
// (rpm/reply, saved replies, aging) deferred.
function detectInbound(pr: any, for_user: string) {
  const reviewers: string[] = pr.requested_reviewers || []
  if (pr.author === for_user || reviewers.includes(for_user)) {
    return null
  }
  return {
    kind: 'pr.inbound', subject_id: pr.id, title: pr.title, url: pr.url,
    actor: pr.author, updated_at: pr.updated_at,
    facts: { title: pr.title, state: pr.state },
    payload: {},
  }
}

// Your own PR, no movement past the threshold.
function detectStale(pr: any, for_user: string) {
  if (pr.author !== for_user) {
    return null
  }
  const age_days = Math.floor((Date.now() - (pr.updated_at || 0)) / 86400000)
  if (age_days < STALE_DAYS) {
    return null
  }
  return {
    kind: 'pr.stale', subject_id: pr.id, title: pr.title, url: pr.url,
    actor: pr.author, updated_at: pr.updated_at,
    facts: { title: pr.title, updated_at: pr.updated_at },
    payload: { age_days },
  }
}

const PR_DETECTORS = [detectReviewRequested, detectInbound, detectStale]

module.exports = { PR_DETECTORS, priorityFor }
