// The inbox: Stage 1's one real view (SPEC.REPO-MANAGER.md §12,
// MOCKUPS.md flow 1). A list + a focus detail panel, driven by the SPEC
// §13.2 key bindings this stage has forge support for (j/k/o/e/a/m/c/l/C/s),
// local search (§13.3), a Snoozed view alongside Inbox, and a Cmd-K command
// bar (SPEC §13.4) reaching the same set. No undo, no campaigns, no
// multi-select, no `g`-prefixed view-switch chords - deliberately shallow.

import * as Api from '../api.js'

const KIND_LABEL = {
  'pr.review_requested': 'review',
  'pr.inbound': 'inbound',
  'pr.stale': 'stale',
  'pr.open': 'open',
  'issue.open': 'open',
}

// The known fleet (docs/inventory.md) - static until org modeling (Stage 4
// multi-tenancy, sys/org) exists. Sidebar entries only, not live data.
const FLEET_ORGS = ['senecajs', 'tabnas', 'voxgig', 'voxgig-sdk']

// Sidebar sections with no backing data/message yet at Stage 1 - shown
// inert (no counts, not clickable) rather than omitted, so the shape of
// the eventual nav is visible without faking numbers behind it.
const INERT_SECTIONS = ['Drift', 'Campaigns', 'Runs']

// Real nav views. inbox/snoozed are the derived queue (rpm/item behind
// every row, full item-intent set available); pulls/issues are raw fleet
// browses (SPEC's "Pull requests"/"Issues" - every open PR or issue, no
// rpm/item, read-only: open on the forge and search, nothing else, since
// there's no item to act on).
const VIEWS = {
  inbox: { title: 'Inbox', itemActions: true },
  snoozed: { title: 'Snoozed', itemActions: true },
  pulls: { title: 'Pull requests', itemActions: false },
  issues: { title: 'Issues', itemActions: false },
}

// Views with no priority to rank by - load() calls these instead of
// Api.listInbox(state) and skips the priority sort.
const BROWSE_LOADERS = {
  pulls: () => Api.listPulls(),
  issues: () => Api.listIssues(),
}

// Composer kinds. Text kinds (title, multiline) render an input/textarea -
// label is single-line (Enter sends), comment/close are multi-line
// (Cmd-Enter sends, matching the spec's "reply" composer convention - plain
// Enter stays a newline). snooze (title, picker) renders preset buttons
// instead - "when" is a choice, not something worth typing.
const COMPOSER = {
  comment: { title: 'Comment', multiline: true },
  label: { title: 'Label (comma-separated)', multiline: false },
  close: { title: 'Close - reason (posted as a comment first)', multiline: true },
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
  Enter: { run: (c) => c.openFocused() },
  o: { run: (c) => c.openFocused() },
  e: { run: (c) => c.dismissFocused() },
  a: { run: (c) => c.approveFocused() },
  m: { run: (c) => c.mergeFocused() },
  c: { prevent: true, run: (c) => c.openComposer('comment') },
  l: { prevent: true, run: (c) => c.openComposer('label') },
  C: { prevent: true, run: (c) => c.openComposer('close') },
  s: { prevent: true, run: (c) => c.openComposer('snooze') },
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
    this.onKeydownBound = (ev) => this.onKeydown(ev)
    document.addEventListener('keydown', this.onKeydownBound)
    await this.load()
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.onKeydownBound)
  }

  // The state this.view shows - what a service message loaded, and what an
  // item intent must land on to still belong on screen.
  viewState() {
    return 'snoozed' === this.view ? 'snoozed' : 'open'
  }

  async load() {
    const browse = BROWSE_LOADERS[this.view]
    if (browse) {
      // Already sorted server-side (most recently updated first) - no
      // priority to rank by on a plain browse list.
      this.items = await browse()
    }
    else {
      this.items = await Api.listInbox(this.viewState())
      // now < soon < later, then most recently updated first within a tier.
      const rank = { now: 0, soon: 1, later: 2 }
      this.items.sort((a, b) =>
        (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || (b.updated_at || 0) - (a.updated_at || 0))
    }
    this.clampFocus()
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

  async switchView(view) {
    if (view === this.view) {
      return
    }
    this.view = view
    this.focusIndex = 0
    this.searchQuery = ''
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
      { id: 'view-pulls', label: 'view: pull requests', run: () => this.switchView('pulls') },
      { id: 'open', label: 'open (o)', run: () => this.openFocused() },
      { id: 'done', label: 'done (e)', run: () => this.dismissFocused() },
      { id: 'approve', label: 'approve (a)', run: () => this.approveFocused() },
      { id: 'merge', label: 'merge (m)', run: () => this.mergeFocused() },
      { id: 'comment', label: 'comment (c)', run: () => this.openComposer('comment') },
      { id: 'label', label: 'label (l)', run: () => this.openComposer('label') },
      { id: 'close', label: 'close with reason (C)', run: () => this.openComposer('close') },
      { id: 'snooze', label: 'snooze (s)', run: () => this.openComposer('snooze') },
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

    if (this.composer) {
      this.onComposerKeydown(ev)
      return
    }

    const tag = document.activeElement && document.activeElement.tagName
    if ('INPUT' === tag || 'TEXTAREA' === tag) {
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
    this.render()
  }

  focusSearch() {
    this.wantSearchFocus = true
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

  openFocused() {
    const item = this.visibleItems()[this.focusIndex]
    if (item && item.url) {
      window.open(item.url, '_blank', 'noopener')
    }
  }

  async runSync() {
    this.statusMsg = 'syncing…'
    this.render()
    const res = await Api.syncNow()
    this.statusMsg = res.ok
      ? `synced: ${res.created} new, ${res.updated} updated, ${res.resolved} resolved`
      : 'sync not configured (REPO_MANAGER_REPOS / REPO_MANAGER_GITHUB_USER)'
    await this.load()
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
    this.removeItem(item.id)
    this.render()
  }

  // Drops an item out of the currently loaded set (by id, not focusIndex -
  // focusIndex indexes visibleItems(), a filtered VIEW of this.items).
  removeItem(id) {
    const idx = this.items.findIndex((it) => it.id === id)
    if (-1 !== idx) {
      this.items.splice(idx, 1)
    }
    this.clampFocus()
  }

  // Runs an item intent, surfacing the result as a status message - "A
  // failed optimistic action must be unmissable" (SPEC §13.3). Drops the
  // item from the current view when the service reports a state that no
  // longer belongs there (merge/close/snooze leave open; a snoozed item
  // leaving the Snoozed view once it wakes is sync's job, not this).
  async runAction(fn, verb) {
    this.statusMsg = verb + '…'
    this.render()
    const res = await fn()
    if (!res || !res.ok) {
      this.statusMsg = `${verb} failed: ${(res && res.why) || 'error'}`
    }
    else {
      this.statusMsg = verb
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
    if (!item) {
      return
    }
    await this.runAction(() => Api.approveItem(item.id), 'approved')
  }

  async mergeFocused() {
    if (!this.requireItemActions()) {
      return
    }
    const item = this.visibleItems()[this.focusIndex]
    if (!item) {
      return
    }
    // Irreversible (SPEC S13) - confirm explicitly (K5) rather than let a
    // stray keypress merge something.
    if (!window.confirm(`Merge "${item.title}"? This cannot be undone.`)) {
      return
    }
    await this.runAction(() => Api.mergeItem(item.id), 'merged')
  }

  openComposer(kind) {
    if (!this.requireItemActions()) {
      return
    }
    if (!this.visibleItems()[this.focusIndex]) {
      return
    }
    this.composer = { kind, value: '' }
    this.render()
  }

  closeComposer() {
    this.composer = null
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
    await this.runAction(() => Api.snoozeItem(item.id, until), 'snoozed')
  }

  render() {
    // Captured BEFORE innerHTML replaces the DOM: removing a focused element
    // blurs it as a side effect, so an onblur handler can't tell "the user
    // clicked away" from "render() just ran" - checking activeElement here,
    // first, is the only reliable signal.
    const hadSearchFocus = document.activeElement === this.querySelector('.vg-search-input')

    const items = this.visibleItems()
    const focused = items[this.focusIndex]
    const viewTitle = VIEWS[this.view].title
    const showActions = this.itemActionsAvailable()

    this.innerHTML = `
      <div class="vg-inbox">
        <header class="vg-inbox-topbar">
          <span class="vg-inbox-brand">🔴 repo-manager</span>
          <span class="vg-inbox-crumb">/ ${esc(viewTitle)}</span>
          <div class="vg-spacer"></div>
          ${this.statusMsg ? `<span class="vg-inbox-status">${esc(this.statusMsg)}</span>` : ''}
          <span class="vg-inbox-meta">${FLEET_ORGS.length} orgs · 1 forge</span>
          <button class="vg-cmdk-btn" id="vg-cmdk-open">⌘K commands</button>
          <span class="vg-inbox-avatar" title="no sign-in yet">·</span>
        </header>
        <div class="vg-inbox-shell">
          <nav class="vg-inbox-nav">
            ${Object.keys(VIEWS).map((v) => `
              <div class="vg-nav-item${v === this.view ? ' vg-nav-active' : ''}" data-view="${v}">
                ${esc(VIEWS[v].title)} ${v === this.view ? `<span class="vg-nav-count">${items.length}</span>` : ''}
              </div>`).join('')}
            ${INERT_SECTIONS.map((s) => `<div class="vg-nav-item vg-nav-inert">${esc(s)}</div>`).join('')}
            <div class="vg-nav-group-title">Fleet</div>
            ${FLEET_ORGS.map((o) => `<div class="vg-nav-item vg-nav-inert">${esc(o)}</div>`).join('')}
          </nav>
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
              </div>
              <aside class="vg-inbox-focus">
                ${focused ? this.renderFocus(focused) : ''}
              </aside>
            </div>
            <footer class="vg-inbox-keys">
              <span><kbd>j</kbd><kbd>k</kbd> move</span>
              <span><kbd>o</kbd> open</span>
              ${showActions ? `
                <span><kbd>e</kbd> done</span>
                <span><kbd>a</kbd> approve</span>
                <span><kbd>m</kbd> merge</span>
                <span><kbd>c</kbd> comment</span>
                <span><kbd>l</kbd> label</span>
                <span><kbd>C</kbd> close</span>
                <span><kbd>s</kbd> snooze</span>` : ''}
              <span><kbd>/</kbd> search</span>
              <span><kbd>⌘K</kbd> commands</span>
            </footer>
          </div>
        </div>
        ${this.paletteOpen ? this.renderPalette() : ''}
        ${this.composer ? this.renderComposer() : ''}
      </div>`

    for (const row of this.querySelectorAll('.vg-inbox-row')) {
      row.onclick = () => {
        this.focusIndex = Number(row.dataset.i)
        this.render()
      }
    }

    for (const nav of this.querySelectorAll('.vg-nav-item[data-view]')) {
      nav.onclick = () => this.switchView(nav.dataset.view)
    }

    const cmdkBtn = this.querySelector('#vg-cmdk-open')
    if (cmdkBtn) {
      cmdkBtn.onclick = () => this.togglePalette(true)
    }

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
      }

      const backdrop = this.querySelector('.vg-composer-backdrop')
      backdrop.onclick = () => this.closeComposer()
      this.querySelector('.vg-composer').onclick = (ev) => ev.stopPropagation()
      this.querySelector('.vg-composer-cancel').onclick = () => this.closeComposer()
    }
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
    return `
      <div class="vg-inbox-row${i === this.focusIndex ? ' vg-focused' : ''}" data-i="${i}">
        <span class="vg-priority-dot vg-priority-${esc(it.priority || 'none')}"></span>
        <span class="vg-kind-badge">${esc(kindLabel(it.kind))}</span>
        <span class="vg-inbox-repo">${esc(it.repo || it.org_id || '')}</span>
        <span class="vg-inbox-title">${esc(it.title)}</span>
        <span class="vg-inbox-age">${age(it.updated_at)}</span>
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
        <div><kbd>o</kbd> open on ${esc(it.source)}</div>
        ${showActions ? `
          <div><kbd>e</kbd> done</div>
          <div><kbd>a</kbd> approve</div>
          <div><kbd>m</kbd> merge</div>
          <div><kbd>c</kbd> comment</div>
          <div><kbd>l</kbd> label</div>
          <div><kbd>C</kbd> close with reason</div>
          <div><kbd>s</kbd> snooze</div>` : ''}
      </div>`
  }
}


function kindLabel(kind) {
  return KIND_LABEL[kind] || kind
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
