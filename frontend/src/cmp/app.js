// Top-level entry: gates between the login form (cmp/auth.js) and the
// real app (cmp/inbox.js) on session state. The generic entity-admin
// shell/public/settings scaffold is unwired - see those files' own
// comments; this project's real UI is vg-inbox.

import { bus, onEvent } from '../bus.js'

class VgApp extends HTMLElement {
  async connectedCallback() {
    onEvent('auth', ({ user }) => this.renderFor(user))
    const state = await bus.post('cmp:auth,load:state')
    this.renderFor(state.user)
  }

  renderFor(user) {
    this.innerHTML = user ? '<vg-inbox></vg-inbox>' : '<vg-auth></vg-auth>'
  }
}

customElements.define('vg-app', VgApp)
