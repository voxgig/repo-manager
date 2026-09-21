// The inbox: Stage 1's one real view (SPEC.REPO-MANAGER.md §12,
// MOCKUPS.md flow 1). A list + a focus detail panel, driven by the SPEC
// §13.2 key bindings this stage has forge support for
// (j/k/o/e/a/m/c/l/C/s/u), local search (§13.3), Snoozed/Aging/Campaigns
// views alongside Inbox, and a Cmd-K command bar (SPEC §13.4) reaching the
// same set. No multi-select, no `g`-prefixed view-switch chords -
// deliberately shallow.

import * as Api from '../api.js'
import * as Theme from '../theme.js'

const KIND_LABEL = {
  'pr.review_requested': 'review',
  'pr.inbound': 'inbound',
  'pr.stale': 'stale',
  'pr.open': 'open',
  'issue.open': 'open',
  'issue.assigned': 'assigned',
  'issue.mentioned': 'mentioned',
  'issue.untriaged': 'untriaged',
  'campaign.bot_pr': 'campaign',
  'repo.drift': 'drift',
}

// SPEC §14.3's four drift-matrix cell states - cellLabel is what the grid
// cell itself shows, focusLabel/cls drive the side panel and both share
// the cell's own color via the vg-drift-* classes (custom.css).
const DRIFT_STATUS = {
  compliant: { cellLabel: '✓', focusLabel: '✓ compliant', cls: 'vg-drift-ok' },
  drifted: { cellLabel: '✕ drift', focusLabel: '✕ drifted', cls: 'vg-drift-bad' },
  'not-applicable': { cellLabel: '–', focusLabel: '– not applicable', cls: 'vg-drift-na' },
  error: { cellLabel: '⚠ error', focusLabel: '⚠ error', cls: 'vg-drift-error' },
}

// The known fleet (docs/inventory.md) - static until org modeling (Stage 4
// multi-tenancy, sys/org) exists. Sidebar entries only, not live data.
const FLEET_ORGS = ['senecajs', 'tabnas', 'voxgig', 'voxgig-sdk']

// Sidebar sections with no backing data/message yet at Stage 1 - shown
// inert (no counts, not clickable) rather than omitted, so the shape of
// the eventual nav is visible without faking numbers behind it.
const INERT_SECTIONS = ['Runs']

// Real nav views. inbox/snoozed are the derived queue (rpm/item behind
// every row, full item-intent set available); pulls/issues/drift are raw
// fleet browses (SPEC's "Pull requests"/"Issues"/§14.3's drift matrix -
// read-only: open on the forge and search, nothing else, since there's no
// item to act on - drift's cells aren't rpm/item rows either, even though
// a non-compliant one has a matching repo.drift item in the real inbox).
const VIEWS = {
  inbox: { title: 'Inbox', itemActions: true },
  snoozed: { title: 'Snoozed', itemActions: true },
  aging: { title: 'Aging', itemActions: true },
  campaigns: { title: 'Campaigns', itemActions: true },
  pulls: { title: 'Pull requests', itemActions: false },
  issues: { title: 'Issues', itemActions: false },
  drift: { title: 'Drift matrix', itemActions: false },
}

// Views with no priority to rank by - load() calls these instead of
// Api.listInbox(state) and skips the priority sort.
const BROWSE_LOADERS = {
  pulls: () => Api.listPulls(),
  issues: () => Api.listIssues(),
}

// Aging (SPEC §12.4, §13.1 "the unanswered, oldest first"): kinds where
// someone OTHER than the maintainer is waiting on a response - not
// pr.review_requested/pr.stale, which are about the maintainer's own work.
const AGING_KINDS = ['pr.inbound', 'issue.assigned', 'issue.mentioned', 'issue.untriaged']

// The open items still waiting on a first response, oldest first - a
// filter+sort over the same open-item set the Inbox view already has, not
// a separate fetch.
function agingItems(items) {
  return items
    .filter((it) => AGING_KINDS.includes(it.kind) && !it.first_response_at)
    .sort((a, b) => (a.first_seen || 0) - (b.first_seen || 0))
}

// Campaigns (SPEC §12.4): grouped bot-PR rows, source:'campaign' - also a
// filter over the same open-item set (sync_item.ts's syncCampaigns already
// pulled the real members out of it), not a separate fetch.
function campaignItems(items) {
  return items.filter((it) => 'campaign' === it.source)
}

// Composer kinds. Text kinds (title, multiline) render an input/textarea -
// label is single-line (Enter sends), comment/close are multi-line
// (Cmd-Enter sends, matching the spec's "reply" composer convention - plain
// Enter stays a newline). snooze (title, picker) renders preset buttons
// instead - "when" is a choice, not something worth typing.
const COMPOSER = {
  comment: { title: 'Comment', multiline: true, replies: true },
  label: { title: 'Label (comma-separated)', multiline: false },
  close: { title: 'Close - reason (posted as a comment first)', multiline: true, replies: true },
  snooze: { title: 'Snooze', picker: true },
}

const SNOOZE_PRESETS = [
  { label: 'later today', hours: 3 },
  { label: 'tomorrow', hours: 24 },
  { label: 'next week', hours: 24 * 7 },
]

// List-level key -> handler (SPEC §13.2). `prevent: true` marks keys whose
// default browser behaviour would otherwise fight the handler - opening a
// composer focuses a textbox mid-keydown, so the same keystroke would also
// land in it; '/' has no default to speak of, but preventDefault keeps it
// from ever reaching whatever had focus.
const KEY_ACTIONS = {
  j: { run: (c) => c.moveFocus(1) },
  k: { run: (c) => c.moveFocus(-1) },
  Enter: { run: (c) => c.openDetail() },
  o: { run: (c) => c.openExternal() },
  Escape: { run: (c) => c.closeDetail() },
  e: { run: (c) => c.dismissFocused() },
  a: { run: (c) => c.approveFocused() },
  m: { run: (c) => c.mergeFocused() },
  c: { prevent: true, run: (c) => c.openComposer('comment') },
  l: { prevent: true, run: (c) => c.openComposer('label') },
  C: { prevent: true, run: (c) => c.openComposer('close') },
  s: { prevent: true, run: (c) => c.openComposer('snooze') },
  u: { run: (c) => c.undoLast() },
  '/': { prevent: true, run: (c) => c.focusSearch() },
}

class VgInbox extends HTMLElement {
  async connectedCallback() {
    this.items = []
    this.view = 'inbox'
    this.focusIndex = 0
    this.searchQuery = ''
    this.wantSearchFocus = false
    this.paletteOpen = false
    this.paletteIndex = 0
    this.statusMsg = ''
    this.composer = null
    this.mergeConfirm = null
    this.detail = null
    this.detailToken = 0
    this.lastSyncedAt = null
    // Undo (SPEC §13.3): the one most recent reversible action, cleared on
    // use or on any full reload (its item may no longer be what it was).
    this.lastReversible = null
    // Saved replies (SPEC §12.4) - fetched once, lazily, the first time a
    // comment/close composer opens.
    this.replies = null
    // Drift matrix (SPEC §14.3) - a grid, not a list, so it gets its own
    // cell-focus coordinate instead of reusing focusIndex/visibleItems().
    this.driftPolicies = []
    this.driftCells = []
    this.driftFocus = { row: 0, col: 0 }
    // Sidebar badge counts, one per real view - kept separate from
    // this.items (the ACTIVE view's rows) so every nav entry can show a
    // real count, not just the one currently open.
    this.counts = {}
    this.onKeydownBound = (ev) => this.onKeydown(ev)
    document.addEventListener('keydown', this.onKeydownBound)
    // Keeps "synced Xs ago" honest without a full reload - nothing else on
    // screen is time-sensitive enough to need a tick.
    this.agoTimer = setInterval(() => {
      if (this.lastSyncedAt) {
        this.render()
      }
    }, 30000)
    await this.load()
    this.refreshCounts()
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.onKeydownBound)
    clearInterval(this.agoTimer)
  }

  // The state this.view shows - what a service message loaded, and what an
  // item intent must land on to still belong on screen.
  viewState() {
    return 'snoozed' === this.view ? 'snoozed' : 'open'
  }

  async load() {
    // A full reload re-fetches every item as a new object - any open detail
    // page would be pointing at a stale reference, so drop it. Same for a
    // pending undo: the item it targeted may not even be in this set anymore.
    this.detail = null
    this.lastReversible = null
    const browse = BROWSE_LOADERS[this.view]
    if (browse) {
      // Already sorted server-side (most recently updated first) - no
      // priority to rank by on a plain browse list.
      this.items = await browse()
    }
    else if ('aging' === this.view) {
      // Same open-item set the Inbox view fetches, filtered/sorted
      // differently - not a separate backend message.
      this.items = agingItems(await Api.listInbox('open'))
    }
    else if ('campaigns' === this.view) {
      this.items = campaignItems(await Api.listInbox('open'))
    }
    else if ('drift' === this.view) {
      const res = await Api.listDrift()
      this.driftPolicies = res.policies
      this.driftCells = res.cells
      this.driftFocus = { row: 0, col: 0 }
      this.items = []
    }
    else {
      this.items = await Api.listInbox(this.viewState())
      // now < soon < later, then most recently updated first within a tier.
      const rank = { now: 0, soon: 1, later: 2 }
      this.items.sort((a, b) =>
        (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || (b.updated_at || 0) - (a.updated_at || 0))
    }
    this.counts[this.view] = 'drift' === this.view
      ? this.driftCells.filter((c) => 'drifted' === c.status).length
      : this.items.length
    this.clampFocus()
    this.render()
  }

  // Unique repo ids in the drift grid, in the order the backend returned
  // them (REPO_MANAGER_REPOS order) - the grid's rows.
  driftRepoIds() {
    const seen = []
    for (const cell of this.driftCells) {
      if (!seen.includes(cell.repo)) {
        seen.push(cell.repo)
      }
    }
    return seen
  }

  driftCellAt(repo, policyId) {
    return this.driftCells.find((c) => c.repo === repo && c.policy_id === policyId)
  }

  // Refetches every real view's count for the sidebar badges - separate
  // from load()'s single-view fetch so switching views stays cheap (one
  // request, not four); called after anything that can change more than
  // the active view's own count (initial load, a real sync).
  async refreshCounts() {
    const [inboxItems, snoozedItems, pulls, issues] = await Promise.all([
      Api.listInbox('open'), Api.listInbox('snoozed'), Api.listPulls(), Api.listIssues(),
    ])
    this.counts = {
      inbox: inboxItems.length, snoozed: snoozedItems.length,
      aging: agingItems(inboxItems).length, campaigns: campaignItems(inboxItems).length,
      // The badge shows drifted-cell count, same signal as the repo.drift
      // items already in inboxItems - no separate list:drift round-trip
      // just for a sidebar number.
      drift: inboxItems.filter((it) => 'repo.drift' === it.kind).length,
      pulls: pulls.length, issues: issues.length,
    }
    this.render()
  }

  itemActionsAvailable() {
    return VIEWS[this.view].itemActions
  }

  // Guards every item-intent entry point - a raw Pull requests row has no
  // rpm/item behind it, so there's nothing for approve/merge/comment/label/
  // close/snooze/done to act on. Surfaces why, rather than firing a request
  // that can only ever come back not-found.
  requireItemActions() {
    if (this.itemActionsAvailable()) {
      return true
    }
    this.statusMsg = `not available in ${VIEWS[this.view].title} - browse only`
    this.render()
    setTimeout(() => {
      this.statusMsg = ''
      this.render()
    }, 2500)
    return false
  }

  // approve/merge are PR-only forge concepts (aim:forge,approve:pr /
  // merge:pr) - guards a/m the same way requireItemActions() guards the
  // whole set for a browse view, since issue-kind items now share the
  // derived inbox with pr.* ones.
  requirePrItem(item) {
    if (item && isPrKind(item.kind)) {
      return true
    }
    this.statusMsg = 'not available for issues'
    this.render()
    setTimeout(() => {
      this.statusMsg = ''
      this.render()
    }, 2500)
    return false
  }

  async switchView(view) {
    if (view === this.view) {
      return
    }
    this.view = view
    this.focusIndex = 0
    this.searchQuery = ''
    this.detail = null
    await this.load()
  }

  // Local search (SPEC §13.3): the full set is already in memory, so
  // filtering is just an array filter - no request.
  visibleItems() {
    const q = (this.searchQuery || '').trim().toLowerCase()
    if (!q) {
      return this.items
    }
    return this.items.filter((it) =>
      (it.title || '').toLowerCase().includes(q) ||
      (it.repo || it.org_id || '').toLowerCase().includes(q) ||
      (it.actor || '').toLowerCase().includes(q))
  }

  clampFocus() {
    this.focusIndex = Math.min(this.focusIndex, Math.max(0, this.visibleItems().length - 1))
  }

  commands() {
    return [
      { id: 'sync', label: 'sync now', run: () => this.runSync() },
      { id: 'view-inbox', label: 'view: inbox', run: () => this.switchView('inbox') },
      { id: 'view-snoozed', label: 'view: snoozed', run: () => this.switchView('snoozed') },
      { id: 'view-aging', label: 'view: aging', run: () => this.switchView('aging') },
      { id: 'view-campaigns', label: 'view: campaigns', run: () => this.switchView('campaigns') },
      { id: 'view-pulls', label: 'view: pull requests', run: () => this.switchView('pulls') },
      { id: 'view-drift', label: 'view: drift matrix', run: () => this.switchView('drift') },
      { id: 'open', label: 'open detail (Enter)', run: () => this.openDetail() },
      { id: 'open-external', label: 'open on forge (o)', run: () => this.openExternal() },
      { id: 'done', label: 'done (e)', run: () => this.dismissFocused() },
      { id: 'approve', label: 'approve (a)', run: () => this.approveFocused() },
      { id: 'merge', label: 'merge (m)', run: () => this.mergeFocused() },
      { id: 'comment', label: 'comment (c)', run: () => this.openComposer('comment') },
      { id: 'label', label: 'label (l)', run: () => this.openComposer('label') },
      { id: 'close', label: 'close with reason (C)', run: () => this.openComposer('close') },
      { id: 'snooze', label: 'snooze (s)', run: () => this.openComposer('snooze') },
      { id: 'undo', label: 'undo (u)', run: () => this.undoLast() },
    ]
  }

  filteredCommands() {
    const q = (this.paletteQuery || '').toLowerCase()
    return this.commands().filter((c) => c.label.includes(q))
  }

  onKeydown(ev) {
    // Cmd-K / Ctrl-K toggles the command bar from anywhere (SPEC §13.4).
    if ('k' === ev.key && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault()
      this.togglePalette()
      return
    }

    if (this.paletteOpen) {
      this.onPaletteKeydown(ev)
      return
    }

    if (this.mergeConfirm) {
      this.onMergeConfirmKeydown(ev)
      return
    }

    if (this.composer) {
      this.onComposerKeydown(ev)
      return
    }

    const tag = document.activeElement && document.activeElement.tagName
    if ('INPUT' === tag || 'TEXTAREA' === tag) {
      return
    }

    if ('drift' === this.view) {
      this.onDriftKeydown(ev)
      return
    }

    const action = KEY_ACTIONS[ev.key]
    if (action) {
      if (action.prevent) {
        ev.preventDefault()
      }
      action.run(this)
    }
  }

  moveFocus(delta) {
    const n = this.visibleItems().length
    this.focusIndex = Math.max(0, Math.min(n - 1, this.focusIndex + delta))
    if (this.detail) {
      // Stay in the detail page, but swap it to the new focus - matches
      // the mockup's "j k next/prev item" hint in the detail topbar.
      this.openDetail()
    }
    else {
      this.render()
    }
  }

  focusSearch() {
    this.wantSearchFocus = true
    this.render()
  }

  // Grid nav for the drift matrix (mockup's own "j k h l move cell") -
  // separate from moveFocus() since a cell is a (row, col) pair, not an
  // index into visibleItems().
  onDriftKeydown(ev) {
    const rows = this.driftRepoIds().length
    const cols = this.driftPolicies.length
    if (!rows || !cols) {
      return
    }
    const moves = { j: [1, 0], k: [-1, 0], l: [0, 1], h: [0, -1] }
    const d = moves[ev.key]
    if (!d) {
      return
    }
    this.driftFocus = {
      row: Math.max(0, Math.min(rows - 1, this.driftFocus.row + d[0])),
      col: Math.max(0, Math.min(cols - 1, this.driftFocus.col + d[1])),
    }
    this.render()
  }

  onComposerKeydown(ev) {
    const def = COMPOSER[this.composer.kind]
    if ('Escape' === ev.key) {
      ev.preventDefault()
      this.closeComposer()
    }
    else if (!def.picker && 'Enter' === ev.key && (!def.multiline || ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault()
      this.submitComposer()
    }
  }

  onMergeConfirmKeydown(ev) {
    if ('Escape' === ev.key) {
      ev.preventDefault()
      this.closeMergeConfirm()
    }
    else if ('Enter' === ev.key && !this.mergeConfirm.loading && !this.mergeBlocked()) {
      ev.preventDefault()
      this.confirmMerge()
    }
  }

  onPaletteKeydown(ev) {
    if ('Escape' === ev.key) {
      ev.preventDefault()
      this.togglePalette(false)
    }
    else if ('ArrowDown' === ev.key) {
      ev.preventDefault()
      const n = this.filteredCommands().length
      this.paletteIndex = n ? (this.paletteIndex + 1) % n : 0
      this.render()
    }
    else if ('ArrowUp' === ev.key) {
      ev.preventDefault()
      const n = this.filteredCommands().length
      this.paletteIndex = n ? (this.paletteIndex - 1 + n) % n : 0
      this.render()
    }
    else if ('Enter' === ev.key) {
      ev.preventDefault()
      const cmd = this.filteredCommands()[this.paletteIndex]
      this.togglePalette(false)
      if (cmd) {
        cmd.run()
      }
    }
  }

  togglePalette(open) {
    this.paletteOpen = undefined === open ? !this.paletteOpen : open
    this.paletteQuery = ''
    this.paletteIndex = 0
    this.render()
    if (this.paletteOpen) {
      const input = this.querySelector('.vg-palette-input')
      if (input) {
        input.focus()
      }
    }
  }

  openExternal() {
    const item = this.visibleItems()[this.focusIndex]
    if (item && item.url) {
      window.open(item.url, '_blank', 'noopener')
    }
  }

  // In-app detail page (03-pr-item.png). Only PRs have one - Api.loadPr is
  // the only load:X point wired up so far (see msg.aon's loose-ends note);
  // Enter on anything else is a no-op rather than a surprise external tab.
  async openDetail() {
    const item = this.visibleItems()[this.focusIndex]
    if (!item || !isPrKind(item.kind)) {
      return
    }
    const token = ++this.detailToken
    this.detail = { item, pr: this.detail && this.detail.item === item ? this.detail.pr : null, loading: true }
    this.render()
    const pr = await Api.loadPr(item.repo, item.subject_id)
    if (token !== this.detailToken) {
      // Focus moved on (or detail closed) before this landed - discard it.
      return
    }
    this.detail = { item, pr, loading: false }
    this.render()
  }

  closeDetail() {
    if (!this.detail) {
      return
    }
    this.detail = null
    this.render()
  }

  async runSync() {
    this.statusMsg = 'syncing…'
    this.render()
    const res = await Api.syncNow()
    this.statusMsg = res.ok
      ? `synced: ${res.created} new, ${res.updated} updated, ${res.resolved} resolved`
      : 'sync not configured (REPO_MANAGER_REPOS / REPO_MANAGER_GITHUB_USER)'
    if (res.ok) {
      this.lastSyncedAt = Date.now()
    }
    await this.load()
    this.refreshCounts()
    setTimeout(() => {
      this.statusMsg = ''
      this.render()
    }, 4000)
  }

  async dismissFocused() {
    if (!this.requireItemActions()) {
      return
    }
    const item = this.visibleItems()[this.focusIndex]
    if (!item) {
      return
    }
    await Api.dismissItem(item.id)
    this.lastReversible = { kind: 'dismiss', id: item.id }
    this.removeItem(item.id)
    this.render()
  }

  // SPEC §13.3: undo covers what a definition declares reversible - only
  // dismiss/snooze here (see undo_item.ts). Reloads the current view on
  // success rather than patching the item back in by hand.
  async undoLast() {
    if (!this.lastReversible) {
      return
    }
    const { kind, id } = this.lastReversible
    this.lastReversible = null
    this.statusMsg = 'undoing…'
    this.render()
    const res = await Api.undoItem(id, kind)
    if (!res || !res.ok) {
      this.statusMsg = `undo failed: ${(res && res.why) || 'error'}`
      this.render()
    }
    else {
      this.statusMsg = 'undone'
      await this.load()
    }
    setTimeout(() => {
      this.statusMsg = ''
      this.render()
    }, 4000)
  }

  // Drops an item out of the currently loaded set (by id, not focusIndex -
  // focusIndex indexes visibleItems(), a filtered VIEW of this.items).
  removeItem(id) {
    const idx = this.items.findIndex((it) => it.id === id)
    if (-1 !== idx) {
      this.items.splice(idx, 1)
    }
    this.clampFocus()
    // The item this.detail was showing is gone - nothing left to render.
    if (this.detail && this.detail.item.id === id) {
      this.detail = null
    }
  }

  // Runs an item intent, surfacing the result as a status message - "A
  // failed optimistic action must be unmissable" (SPEC §13.3). Drops the
  // item from the current view when the service reports a state that no
  // longer belongs there (merge/close/snooze leave open; a snoozed item
  // leaving the Snoozed view once it wakes is sync's job, not this).
  // `reversible`, when passed, names the undo kind (SPEC §13.3) - only
  // dismiss/snooze ever pass one; see undo_item.ts for why the rest can't.
  async runAction(fn, verb, reversible) {
    this.statusMsg = verb + '…'
    this.render()
    const res = await fn()
    if (!res || !res.ok) {
      this.statusMsg = `${verb} failed: ${(res && res.why) || 'error'}`
    }
    else {
      this.statusMsg = verb
      if (reversible) {
        this.lastReversible = { kind: reversible, id: res.item.id }
      }
      if (res.item && res.item.state !== this.viewState()) {
        this.removeItem(res.item.id)
      }
    }
    this.render()
    setTimeout(() => {
      this.statusMsg = ''
      this.render()
    }, 4000)
  }

  async approveFocused() {
    if (!this.requireItemActions()) {
      return
    }
    const item = this.visibleItems()[this.focusIndex]
    if (!item || !this.requirePrItem(item)) {
      return
    }
    await this.runAction(() => Api.approveItem(item.id), 'approved')
  }

  // Irreversible (SPEC S13) - confirm explicitly (04-merge-confirm.png)
  // rather than let a stray keypress merge something. Fetches the PR's own
  // detail (mergeable state, commit count) so the confirmation states real
  // facts, not just the title - reviews/checks are left out, same reason
  // as the detail page: neither API is modeled in the SDK yet.
  async mergeFocused() {
    if (!this.requireItemActions()) {
      return
    }
    const item = this.visibleItems()[this.focusIndex]
    if (!item || !this.requirePrItem(item)) {
      return
    }
    this.mergeConfirm = { item, pr: null, loading: true }
    this.render()
    const pr = await Api.loadPr(item.repo, item.subject_id)
    if (!this.mergeConfirm || this.mergeConfirm.item !== item) {
      return
    }
    this.mergeConfirm = { item, pr, loading: false }
    this.render()
  }

  closeMergeConfirm() {
    if (!this.mergeConfirm) {
      return
    }
    this.mergeConfirm = null
    this.render()
  }

  // SPEC §13.2 only offers merge "when pr.ready_to_merge" - we don't derive
  // that kind (needs checks/reviews the SDK doesn't model), but GitHub's own
  // mergeable flag is real data we already fetch for the modal, so block on
  // it rather than let the confirm through unconditionally. GitHub would
  // reject the merge call anyway - this makes that visible before the click,
  // not after (S13).
  mergeBlocked() {
    return !!this.mergeConfirm && !this.mergeConfirm.loading &&
      false === (this.mergeConfirm.pr && this.mergeConfirm.pr.mergeable)
  }

  async confirmMerge() {
    if (this.mergeBlocked()) {
      return
    }
    const { item } = this.mergeConfirm
    this.mergeConfirm = null
    await this.runAction(() => Api.mergeItem(item.id), 'merged')
  }

  async openComposer(kind) {
    if (!this.requireItemActions()) {
      return
    }
    if (!this.visibleItems()[this.focusIndex]) {
      return
    }
    this.composer = { kind, value: '' }
    this.render()
    // Saved replies (SPEC §12.4) - only comment/close use them; fetched
    // once and cached, since the seeded set doesn't change at runtime.
    if (COMPOSER[kind].replies && !this.replies) {
      this.replies = await Api.listReplies()
      if (this.composer && kind === this.composer.kind) {
        this.render()
      }
    }
  }

  closeComposer() {
    this.composer = null
    this.render()
  }

  // Fills the composer with a saved reply's template, {author}/{repo}
  // resolved from the focused item - still editable before sending.
  applyReply(id) {
    if (!this.composer || !this.replies) {
      return
    }
    const reply = this.replies.find((r) => r.id === id)
    const item = this.visibleItems()[this.focusIndex]
    if (!reply || !item) {
      return
    }
    this.composer.value = reply.body
      .replace(/\{author\}/g, item.actor || 'there')
      .replace(/\{repo\}/g, item.repo || item.org_id || 'this repo')
    this.render()
  }

  async submitComposer() {
    const item = this.visibleItems()[this.focusIndex]
    const { kind, value } = this.composer
    this.composer = null
    if (!item || !value.trim()) {
      this.render()
      return
    }

    if ('comment' === kind) {
      await this.runAction(() => Api.commentItem(item.id, value), 'commented')
    }
    else if ('label' === kind) {
      const labels = value.split(',').map((s) => s.trim()).filter(Boolean)
      await this.runAction(() => Api.labelItem(item.id, labels), 'labeled')
    }
    else if ('close' === kind) {
      await this.runAction(() => Api.closeItem(item.id, value), 'closed')
    }
  }

  async submitSnooze(hours) {
    const item = this.visibleItems()[this.focusIndex]
    this.composer = null
    if (!item) {
      this.render()
      return
    }
    const until = Date.now() + hours * 3600000
    await this.runAction(() => Api.snoozeItem(item.id, until), 'snoozed', 'snooze')
  }

  render() {
    // Captured BEFORE innerHTML replaces the DOM: removing a focused element
    // blurs it as a side effect, so an onblur handler can't tell "the user
    // clicked away" from "render() just ran" - checking activeElement here,
    // first, is the only reliable signal.
    const hadSearchFocus = document.activeElement === this.querySelector('.vg-search-input')

    if (this.detail) {
      this.innerHTML = this.renderDetailPage()
      this.wireDetailPage()
    }
    else if ('drift' === this.view) {
      this.innerHTML = this.renderDriftPage()
      this.wireDriftPage()
    }
    else {
      this.innerHTML = this.renderListPage()
      this.wireListPage(hadSearchFocus)
    }

    this.wireOverlays()
  }

  // Shared by the list and drift pages (the detail page runs full-width,
  // no nav) - same view-switch links, same inert placeholders.
  renderNav() {
    return `
      <nav class="vg-inbox-nav">
        ${Object.keys(VIEWS).map((v) => `
          <div class="vg-nav-item${v === this.view ? ' vg-nav-active' : ''}" data-view="${v}">
            ${esc(VIEWS[v].title)} ${undefined !== this.counts[v] ? `<span class="vg-nav-count">${this.counts[v]}</span>` : ''}
          </div>`).join('')}
        ${INERT_SECTIONS.map((s) => `<div class="vg-nav-item vg-nav-inert">${esc(s)}</div>`).join('')}
        <div class="vg-nav-group-title">Fleet</div>
        ${FLEET_ORGS.map((o) => `<div class="vg-nav-item vg-nav-inert">${esc(o)}</div>`).join('')}
      </nav>`
  }

  wireNav() {
    for (const nav of this.querySelectorAll('.vg-nav-item[data-view]')) {
      nav.onclick = () => this.switchView(nav.dataset.view)
    }
  }

  // Shared by the list and drift pages (the detail page runs its own,
  // narrower topbar) - crumbTitle is the only thing that varies.
  renderTopbar(crumbTitle) {
    return `
      <header class="vg-inbox-topbar">
        <span class="vg-inbox-brand">🔴 repo-manager</span>
        <span class="vg-inbox-crumb">/ ${esc(crumbTitle)}</span>
        <div class="vg-spacer"></div>
        ${this.statusMsg ? `<span class="vg-inbox-status">${esc(this.statusMsg)}</span>` : ''}
        <span class="vg-inbox-meta">${this.lastSyncedAt ? `synced ${agoShort(this.lastSyncedAt)} · ` : ''}${FLEET_ORGS.length} orgs · 1 forge</span>
        <button class="vg-cmdk-btn" id="vg-cmdk-open">⌘K commands</button>
        <button class="vg-theme-btn" id="vg-theme-toggle" title="toggle theme">${'dark' === Theme.current() ? '☀' : '🌙'}</button>
        <span class="vg-inbox-avatar" title="no sign-in yet">·</span>
      </header>`
  }

  wireTopbar() {
    const cmdkBtn = this.querySelector('#vg-cmdk-open')
    if (cmdkBtn) {
      cmdkBtn.onclick = () => this.togglePalette(true)
    }
    const themeBtn = this.querySelector('#vg-theme-toggle')
    if (themeBtn) {
      themeBtn.onclick = () => {
        Theme.nextMode()
        this.render()
      }
    }
  }

  renderListPage() {
    const items = this.visibleItems()
    const focused = items[this.focusIndex]
    const viewTitle = VIEWS[this.view].title
    const showActions = this.itemActionsAvailable()

    return `
      <div class="vg-inbox">
        ${this.renderTopbar(viewTitle)}
        <div class="vg-inbox-shell">
          ${this.renderNav()}
          <div class="vg-inbox-main">
            <div class="vg-inbox-body">
              <div class="vg-inbox-list">
                <div class="vg-inbox-list-head">
                  ${esc(viewTitle)} <span class="vg-inbox-count">${items.length}</span>
                  <input class="vg-search-input" placeholder="/ to search" />
                </div>
                ${items.length
                  ? items.map((it, i) => this.renderRow(it, i)).join('')
                  : `<div class="vg-empty">${this.searchQuery ? 'no matches' : viewTitle.toLowerCase() + ' is empty'}</div>`}
                ${items.length && this.itemActionsAvailable()
                  ? '<div class="vg-inbox-footnote">items vanish on their own when the condition clears - merged PRs never need a keystroke</div>'
                  : ''}
              </div>
              <aside class="vg-inbox-focus">
                ${focused ? this.renderFocus(focused) : ''}
              </aside>
            </div>
            <footer class="vg-inbox-keys">
              <span><kbd>j</kbd><kbd>k</kbd> move</span>
              <span><kbd>Enter</kbd> open</span>
              <span><kbd>o</kbd> open on forge</span>
              ${showActions ? `
                <span><kbd>e</kbd> done</span>
                <span><kbd>a</kbd> approve</span>
                <span><kbd>m</kbd> merge</span>
                <span><kbd>c</kbd> comment</span>
                <span><kbd>l</kbd> label</span>
                <span><kbd>C</kbd> close</span>
                <span><kbd>s</kbd> snooze</span>` : ''}
              ${this.lastReversible ? '<span><kbd>u</kbd> undo</span>' : ''}
              <span><kbd>/</kbd> search</span>
              <span><kbd>⌘K</kbd> commands</span>
            </footer>
          </div>
        </div>
        ${this.paletteOpen ? this.renderPalette() : ''}
        ${this.composer ? this.renderComposer() : ''}
        ${this.mergeConfirm ? this.renderMergeConfirm() : ''}
      </div>`
  }

  wireListPage(hadSearchFocus) {
    for (const row of this.querySelectorAll('.vg-inbox-row')) {
      row.onclick = () => {
        this.focusIndex = Number(row.dataset.i)
        this.openDetail()
      }
    }

    this.wireNav()
    this.wireTopbar()

    const searchInput = this.querySelector('.vg-search-input')
    if (searchInput) {
      searchInput.value = this.searchQuery || ''
      searchInput.oninput = () => {
        this.searchQuery = searchInput.value
        this.focusIndex = 0
        this.render()
      }
      searchInput.onkeydown = (ev) => {
        if ('Escape' === ev.key) {
          ev.preventDefault()
          this.searchQuery = ''
          this.focusIndex = 0
          this.wantSearchFocus = false
          this.render()
        }
      }
      if (hadSearchFocus || this.wantSearchFocus) {
        searchInput.focus()
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length)
        this.wantSearchFocus = false
      }
    }
  }

  // In-app PR detail page (03-pr-item.png) - a full-page replacement, not a
  // panel inside the list shell. CHECKS and unresolved-thread cards are
  // deliberately omitted: neither the Checks API nor a resolving review-
  // comments API is wired into the SDK yet, and this app never fakes data.
  renderDetailPage() {
    const { item, pr, loading } = this.detail
    const showActions = this.itemActionsAvailable()
    const badge = pr
      ? `${esc(String(pr.state || '').toUpperCase())} · ${
          true === pr.mergeable ? 'MERGEABLE' : false === pr.mergeable ? 'CONFLICTS' : '…'}`
      : ''

    return `
      <div class="vg-pr-detail">
        <header class="vg-detail-topbar">
          <button class="vg-detail-back"><kbd>Esc</kbd> back to inbox</button>
          <span class="vg-detail-crumb">/ ${esc(item.repo || item.org_id || '')}</span>
          <span class="vg-detail-title">#${esc(item.subject_id)} · ${esc(item.title)}</span>
          ${pr ? `<span class="vg-detail-badge">${badge}</span>` : ''}
          <div class="vg-spacer"></div>
          <span class="vg-detail-nav-hint"><kbd>j</kbd><kbd>k</kbd> next / prev item</span>
        </header>
        <div class="vg-detail-shell">
          <div class="vg-detail-main">
            ${loading
              ? '<div class="vg-empty">loading…</div>'
              : pr ? this.renderDetailBody(item, pr) : '<div class="vg-empty">could not load PR detail</div>'}
          </div>
          <aside class="vg-detail-side">
            ${pr ? this.renderDetailState(item, pr) : ''}
            ${this.renderDetailActions(item, showActions)}
          </aside>
        </div>
        <footer class="vg-inbox-keys">
          ${showActions ? `
            <span><kbd>a</kbd> approve</span>
            <span><kbd>m</kbd> merge</span>
            <span><kbd>c</kbd> comment</span>
            <span><kbd>l</kbd> label</span>
            <span><kbd>C</kbd> close</span>
            <span><kbd>s</kbd> snooze</span>
            <span><kbd>e</kbd> done</span>` : ''}
          <span><kbd>o</kbd> open on ${esc(item.source || 'forge')}</span>
          ${this.lastReversible ? '<span><kbd>u</kbd> undo</span>' : ''}
          <span><kbd>Esc</kbd> back</span>
        </footer>
      </div>
      ${this.paletteOpen ? this.renderPalette() : ''}
      ${this.composer ? this.renderComposer() : ''}
      ${this.mergeConfirm ? this.renderMergeConfirm() : ''}`
  }

  renderDetailBody(item, pr) {
    return `
      <div class="vg-detail-card">
        <div class="vg-detail-summary">
          ${item.actor ? `<strong>@${esc(item.actor)}</strong> wants your review · ` : ''}
          ${pr.head_ref && pr.base_ref ? `${esc(pr.head_ref)} → ${esc(pr.base_ref)} · ` : ''}
          ${undefined !== pr.additions ? `<span class="vg-diff-add">+${pr.additions}</span> <span class="vg-diff-del">−${pr.deletions}</span> · ` : ''}
          ${undefined !== pr.changed_files ? `${pr.changed_files} files` : ''}
        </div>
        ${pr.body ? `<div class="vg-detail-body">${esc(pr.body)}</div>` : ''}
      </div>
      <div class="vg-detail-note">checks and review threads aren't shown here yet - neither is wired into the SDK</div>`
  }

  renderDetailState(item, pr) {
    return `
      <div class="vg-detail-side-block">
        <div class="vg-detail-side-title">STATE</div>
        <div class="vg-detail-state-row">mergeable — <strong>${
          true === pr.mergeable ? 'yes' : false === pr.mergeable ? 'no' : 'unknown'}</strong></div>
        ${pr.mergeable_state ? `<div class="vg-detail-state-row">status — ${esc(pr.mergeable_state)}</div>` : ''}
        ${item.priority ? `<div class="vg-detail-state-row">priority — <strong class="vg-priority-${esc(item.priority)}">${esc(item.priority)}</strong></div>` : ''}
        ${pr.draft ? '<div class="vg-detail-state-row">draft</div>' : ''}
      </div>`
  }

  renderDetailActions(item, showActions) {
    return `
      <div class="vg-detail-side-block">
        <div class="vg-detail-side-title">ACTIONS</div>
        ${showActions ? `
          <div class="vg-detail-action" data-act="approve"><kbd>a</kbd> approve</div>
          <div class="vg-detail-action" data-act="merge"><kbd>m</kbd> merge</div>
          <div class="vg-detail-action" data-act="comment"><kbd>c</kbd> comment</div>
          <div class="vg-detail-action" data-act="label"><kbd>l</kbd> label</div>
          <div class="vg-detail-action" data-act="close"><kbd>C</kbd> close with reason</div>
          <div class="vg-detail-action" data-act="snooze"><kbd>s</kbd> snooze</div>
          <div class="vg-detail-action" data-act="done"><kbd>e</kbd> done</div>` : ''}
        <div class="vg-detail-action" data-act="open"><kbd>o</kbd> open on ${esc(item.source || 'forge')}</div>
      </div>
      <div class="vg-detail-disclaimer">Approve and merge are always a human decision — no rule, schedule or agent merges anything.</div>`
  }

  wireDetailPage() {
    const back = this.querySelector('.vg-detail-back')
    if (back) {
      back.onclick = () => this.closeDetail()
    }

    const actionFns = {
      approve: () => this.approveFocused(),
      merge: () => this.mergeFocused(),
      comment: () => this.openComposer('comment'),
      label: () => this.openComposer('label'),
      close: () => this.openComposer('close'),
      snooze: () => this.openComposer('snooze'),
      done: () => this.dismissFocused(),
      open: () => this.openExternal(),
    }
    for (const el of this.querySelectorAll('.vg-detail-action')) {
      el.onclick = () => {
        const fn = actionFns[el.dataset.act]
        if (fn) {
          fn()
        }
      }
    }
  }

  // Palette and composer overlay both page modes identically.
  wireOverlays() {
    if (this.paletteOpen) {
      const input = this.querySelector('.vg-palette-input')
      input.value = this.paletteQuery || ''
      input.oninput = () => {
        this.paletteQuery = input.value
        this.paletteIndex = 0
        this.render()
      }
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)

      for (const row of this.querySelectorAll('.vg-palette-row')) {
        row.onclick = () => {
          const cmd = this.filteredCommands()[Number(row.dataset.i)]
          this.togglePalette(false)
          if (cmd) {
            cmd.run()
          }
        }
      }
      const backdrop = this.querySelector('.vg-palette-backdrop')
      backdrop.onclick = () => this.togglePalette(false)
      this.querySelector('.vg-palette').onclick = (ev) => ev.stopPropagation()
    }

    if (this.composer) {
      const def = COMPOSER[this.composer.kind]

      if (def.picker) {
        for (const btn of this.querySelectorAll('.vg-composer-pick')) {
          btn.onclick = () => this.submitSnooze(SNOOZE_PRESETS[Number(btn.dataset.i)].hours)
        }
      }
      else {
        const input = this.querySelector('.vg-composer-input')
        input.value = this.composer.value
        input.oninput = () => {
          this.composer.value = input.value
        }
        input.focus()
        this.querySelector('.vg-composer-send').onclick = () => this.submitComposer()

        for (const btn of this.querySelectorAll('.vg-composer-reply')) {
          btn.onclick = () => this.applyReply(btn.dataset.reply)
        }
      }

      const backdrop = this.querySelector('.vg-composer-backdrop')
      backdrop.onclick = () => this.closeComposer()
      this.querySelector('.vg-composer').onclick = (ev) => ev.stopPropagation()
      this.querySelector('.vg-composer-cancel').onclick = () => this.closeComposer()
    }

    if (this.mergeConfirm) {
      const backdrop = this.querySelector('.vg-merge-backdrop')
      backdrop.onclick = () => this.closeMergeConfirm()
      this.querySelector('.vg-merge-confirm').onclick = (ev) => ev.stopPropagation()
      this.querySelector('.vg-merge-cancel').onclick = () => this.closeMergeConfirm()
      const goBtn = this.querySelector('.vg-merge-go')
      if (goBtn) {
        goBtn.onclick = () => this.confirmMerge()
      }
    }
  }

  // Merge confirmation (04-merge-confirm.png, S13): irreversible, so it
  // states real facts (mergeable state, commit count) rather than just the
  // title - reviews/checks are left out, same reason as the detail page.
  // SPEC §13.2 only offers merge "when pr.ready_to_merge"; we don't derive
  // that kind, but blocking on GitHub's own mergeable:false here is the real
  // data we do have - see mergeBlocked().
  renderMergeConfirm() {
    const { item, pr, loading } = this.mergeConfirm
    const blocked = this.mergeBlocked()
    const mergeLine = loading
      ? 'checking mergeability…'
      : pr
        ? (true === pr.mergeable
            ? 'no conflicts'
            : false === pr.mergeable
              ? `can't merge — ${esc(pr.mergeable_state || 'not mergeable')}`
              : 'mergeable state unknown')
        : 'could not load PR detail'

    return `
      <div class="vg-merge-backdrop">
        <div class="vg-merge-confirm">
          <div class="vg-merge-title">Merge #${esc(item.subject_id)} into ${esc((pr && pr.base_ref) || '…')}?</div>
          <div class="vg-merge-sub">${esc(item.repo || '')}${item.actor ? ' · @' + esc(item.actor) : ''}</div>
          <div class="vg-merge-status">
            <div${blocked ? ' class="vg-merge-blocked"' : ''}>${mergeLine}</div>
            ${!loading && pr && undefined !== pr.commits ? `<div>${pr.commits} commit${1 === pr.commits ? '' : 's'}</div>` : ''}
          </div>
          <div class="vg-merge-warning">⚠ A merge cannot be undone.</div>
          <div class="vg-merge-row">
            <button class="vg-merge-cancel">Cancel <kbd>Esc</kbd></button>
            <button class="vg-merge-go"${loading || blocked ? ' disabled' : ''}>Merge #${esc(item.subject_id)} <kbd>Enter</kbd></button>
          </div>
        </div>
      </div>`
  }

  renderComposer() {
    const { kind } = this.composer
    const def = COMPOSER[kind]

    if (def.picker) {
      return `
        <div class="vg-composer-backdrop">
          <div class="vg-composer">
            <div class="vg-composer-title">${esc(def.title)}</div>
            <div class="vg-composer-picker">
              ${SNOOZE_PRESETS.map((p, i) =>
                `<button class="vg-composer-pick" data-i="${i}">${esc(p.label)}</button>`).join('')}
            </div>
            <div class="vg-composer-row">
              <span class="vg-composer-hint">Esc to cancel</span>
              <button class="vg-composer-cancel">Cancel</button>
            </div>
          </div>
        </div>`
    }

    return `
      <div class="vg-composer-backdrop">
        <div class="vg-composer">
          <div class="vg-composer-title">${esc(def.title)}</div>
          ${def.replies && this.replies && this.replies.length ? `
            <div class="vg-composer-replies">
              ${this.replies.map((r) => `<button class="vg-composer-reply" data-reply="${esc(r.id)}">${esc(r.title)}</button>`).join('')}
            </div>` : ''}
          ${def.multiline
            ? '<textarea class="vg-composer-input" rows="4"></textarea>'
            : '<input class="vg-composer-input" />'}
          <div class="vg-composer-row">
            <span class="vg-composer-hint">${def.multiline ? '⌘-Enter to send' : 'Enter to send'} · Esc to cancel</span>
            <button class="vg-composer-cancel">Cancel</button>
            <button class="vg-composer-send">Send</button>
          </div>
        </div>
      </div>`
  }

  renderPalette() {
    const cmds = this.filteredCommands()
    return `
      <div class="vg-palette-backdrop">
        <div class="vg-palette">
          <input class="vg-palette-input" placeholder="Type a command…" />
          <div class="vg-palette-list">
            ${cmds.length
              ? cmds.map((c, i) => `
                  <div class="vg-palette-row${i === this.paletteIndex ? ' vg-focused' : ''}" data-i="${i}">
                    ${esc(c.label)}
                  </div>`).join('')
              : '<div class="vg-palette-empty">no matching command</div>'}
          </div>
        </div>
      </div>`
  }

  renderRow(it, i) {
    // Aging sorts by first_seen (how long they've waited), not updated_at
    // (last activity) - show the field that's actually driving the order.
    const shown = 'aging' === this.view ? it.first_seen : it.updated_at
    return `
      <div class="vg-inbox-row${i === this.focusIndex ? ' vg-focused' : ''}" data-i="${i}">
        <span class="vg-priority-dot vg-priority-${esc(it.priority || 'none')}"></span>
        <span class="vg-kind-badge ${kindClass(it.kind)}">${esc(kindLabel(it.kind))}</span>
        <span class="vg-inbox-repo">${esc(it.repo || it.org_id || '')}</span>
        <span class="vg-inbox-title">${esc(it.title)}</span>
        <span class="vg-inbox-age">${age(shown)}</span>
      </div>`
  }

  renderFocus(it) {
    const showActions = this.itemActionsAvailable()
    return `
      <div class="vg-focused-label">FOCUSED</div>
      <h3 class="vg-focus-title">${esc(it.title)}</h3>
      <div class="vg-muted">${esc(it.repo || it.org_id || '')}${it.actor ? ' · @' + esc(it.actor) : ''}</div>
      ${it.priority
        ? `<div class="vg-focus-priority">priority <strong class="vg-priority-${esc(it.priority)}">${esc(it.priority)}</strong></div>`
        : ''}
      ${it.state === 'snoozed' && it.snooze_until
        ? `<div class="vg-muted">snoozed until ${new Date(it.snooze_until).toLocaleString()}</div>`
        : ''}
      <div class="vg-focus-actions">
        ${isPrKind(it.kind) ? '<div><kbd>Enter</kbd> open</div>' : ''}
        <div><kbd>o</kbd> open on ${esc(it.source)}</div>
        ${showActions ? `
          <div><kbd>e</kbd> done</div>
          ${isPrKind(it.kind) ? `
          <div><kbd>a</kbd> approve</div>
          <div><kbd>m</kbd> merge</div>` : ''}
          <div><kbd>c</kbd> comment</div>
          <div><kbd>l</kbd> label</div>
          <div><kbd>C</kbd> close with reason</div>
          <div><kbd>s</kbd> snooze</div>` : ''}
      </div>`
  }

  // The drift matrix (06-drift-matrix.png, SPEC §14.3): repos × policies,
  // read-only. Deliberately stops short of the mockup's "plan preview /
  // apply" side - that's the bulk-apply pipeline, Stage 3 (§19.6), and
  // nothing here has one yet (check_policy.ts is check-only).
  renderDriftPage() {
    const repoIds = this.driftRepoIds()
    const policies = this.driftPolicies
    const focusedRepo = repoIds[this.driftFocus.row]
    const focusedPolicy = policies[this.driftFocus.col]
    const focusedCell = focusedRepo && focusedPolicy && this.driftCellAt(focusedRepo, focusedPolicy.id)

    return `
      <div class="vg-inbox">
        ${this.renderTopbar(VIEWS.drift.title)}
        <div class="vg-inbox-shell">
          ${this.renderNav()}
          <div class="vg-inbox-main">
            <div class="vg-inbox-body">
              <div class="vg-drift-grid-wrap">
                ${repoIds.length
                  ? `<table class="vg-drift-grid">
                      <thead><tr><th>Repo</th>${policies.map((p) => `<th>${esc(p.id)}</th>`).join('')}</tr></thead>
                      <tbody>
                        ${repoIds.map((repo, ri) => `
                          <tr>
                            <td class="vg-drift-repo">${esc(repo)}</td>
                            ${policies.map((p, ci) => {
                              const cell = this.driftCellAt(repo, p.id)
                              const info = cell && DRIFT_STATUS[cell.status]
                              const cls = info ? ' ' + info.cls : ''
                              const focus = ri === this.driftFocus.row && ci === this.driftFocus.col ? ' vg-focused' : ''
                              const label = info ? info.cellLabel : '—'
                              return `<td class="vg-drift-cell${cls}${focus}" data-row="${ri}" data-col="${ci}">${label}</td>`
                            }).join('')}
                          </tr>`).join('')}
                      </tbody>
                    </table>`
                  : '<div class="vg-empty">no repos configured</div>'}
                ${repoIds.length && this.driftCells.some((c) => 'drifted' === c.status)
                  ? '<div class="vg-inbox-footnote">every drifted cell is also a work item in the inbox</div>'
                  : ''}
              </div>
              <aside class="vg-inbox-focus">
                ${focusedCell ? this.renderDriftFocus(focusedRepo, focusedPolicy, focusedCell) : ''}
              </aside>
            </div>
            <footer class="vg-inbox-keys">
              <span><kbd>j</kbd><kbd>k</kbd><kbd>h</kbd><kbd>l</kbd> move cell</span>
              <span><kbd>⌘K</kbd> commands</span>
            </footer>
          </div>
        </div>
        ${this.paletteOpen ? this.renderPalette() : ''}
      </div>`
  }

  renderDriftFocus(repo, policy, cell) {
    const info = DRIFT_STATUS[cell.status] || {}
    return `
      <div class="vg-focused-label">FOCUSED CELL</div>
      <h3 class="vg-focus-title">${esc(repo)} × ${esc(policy.id)}</h3>
      <div class="vg-muted">${esc(policy.description)}</div>
      <div class="vg-drift-status ${esc(info.cls || '')}">
        ${info.focusLabel || cell.status}${cell.why ? ' - ' + esc(cell.why) : ''}
      </div>`
  }

  wireDriftPage() {
    this.wireNav()
    this.wireTopbar()

    for (const cell of this.querySelectorAll('.vg-drift-cell')) {
      cell.onclick = () => {
        this.driftFocus = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
        this.render()
      }
    }
  }
}


// PRs and issues share the derived inbox, but approve/merge/detail-open are
// PR-only forge concepts (aim:forge,approve:pr / merge:pr; no load:issue).
function isPrKind(kind) {
  return String(kind || '').startsWith('pr.')
}

function kindLabel(kind) {
  return KIND_LABEL[kind] || kind
}

// 'pr.review_requested' -> 'vg-kind-pr-review_requested', so custom.css can
// give each kind its own accent (PLATFORM.md §5.1) without a JS lookup table
// to keep in sync every time a new kind is added.
function kindClass(kind) {
  return 'vg-kind-' + String(kind || '').replace(/\./g, '-')
}

// "synced Xs ago" in the topbar - same idea as age() but starting from
// seconds, since a fresh sync is the one timestamp worth that resolution.
function agoShort(ms) {
  const secs = Math.floor((Date.now() - ms) / 1000)
  if (secs < 60) {
    return secs + 's ago'
  }
  return age(ms) + ' ago'
}

// Coarse relative time, matching the mockups' "2h" / "3d" style.
function age(ms) {
  if (!ms) {
    return ''
  }
  const mins = Math.floor((Date.now() - ms) / 60000)
  if (mins < 60) {
    return mins + 'm'
  }
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return hours + 'h'
  }
  return Math.floor(hours / 24) + 'd'
}

function esc(s) {
  return String(null == s ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}


customElements.define('vg-inbox', VgInbox)
