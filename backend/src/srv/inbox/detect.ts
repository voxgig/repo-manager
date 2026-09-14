// Item-kind detectors (SPEC §12): each takes a normalized PR and the syncing
// user, and returns the condition it represents, or null. sync_item runs
// every detector over every PR it fetches - the author/reviewer checks below
// keep the three mutually exclusive, so a PR becomes at most one item.

const STALE_DAYS = 14

// SPEC §12.2: derived, not user-assigned. Partial cut - only the kinds
// Stage 2 has detectors for; the rest of the heuristic (checks, conflicts,
// drift, security) lands with those kinds.
//
// issue.untriaged -> later is spec-explicit (§12.2's own "later" example
// list names it). issue.assigned/mentioned aren't in any of §12.2's worked
// examples (those are all PR/security-specific "someone is blocked on you"
// cases) - 'soon' here is our own judgment call, not a stated default.
const KIND_PRIORITY: Record<string, string> = {
  'pr.review_requested': 'now',
  'pr.inbound': 'now',
  'pr.stale': 'later',
  'issue.assigned': 'soon',
  'issue.mentioned': 'soon',
  'issue.untriaged': 'later',
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

// SPEC §12: 'issue.assigned' | 'issue.mentioned' | 'issue.untriaged' - the
// three issue kinds the spec names, same detector shape as the PR ones.

function detectIssueAssigned(issue: any, for_user: string) {
  const assignees: string[] = issue.assignees || []
  if (!assignees.includes(for_user)) {
    return null
  }
  return {
    kind: 'issue.assigned', subject_id: issue.id, title: issue.title, url: issue.url,
    actor: issue.author, updated_at: issue.updated_at,
    facts: { title: issue.title, state: issue.state, assignees },
    payload: { assignees },
  }
}

// Not mutually exclusive with assigned by spec definition, but skipping the
// already-assigned case avoids two items for the same "you're on this"
// signal - same reasoning as pr.review_requested/pr.inbound.
function detectIssueMentioned(issue: any, for_user: string) {
  const assignees: string[] = issue.assignees || []
  if (assignees.includes(for_user)) {
    return null
  }
  const body: string = issue.body || ''
  if (!body.toLowerCase().includes('@' + for_user.toLowerCase())) {
    return null
  }
  return {
    kind: 'issue.mentioned', subject_id: issue.id, title: issue.title, url: issue.url,
    actor: issue.author, updated_at: issue.updated_at,
    facts: { title: issue.title, state: issue.state, mentioned: true },
    payload: {},
  }
}

// Fleet-health signal, not for_user-specific (like repo.drift would be) -
// every synced issue with zero labels gets one, regardless of who's asking.
function detectIssueUntriaged(issue: any, _for_user: string) {
  const labels: string[] = issue.labels || []
  if (labels.length > 0) {
    return null
  }
  return {
    kind: 'issue.untriaged', subject_id: issue.id, title: issue.title, url: issue.url,
    actor: issue.author, updated_at: issue.updated_at,
    facts: { title: issue.title, state: issue.state, labels: [] },
    payload: {},
  }
}

const ISSUE_DETECTORS = [detectIssueAssigned, detectIssueMentioned, detectIssueUntriaged]

module.exports = { PR_DETECTORS, ISSUE_DETECTORS, priorityFor }
