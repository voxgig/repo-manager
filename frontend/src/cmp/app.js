// Top-level entry. Stage 1 runs unauthenticated (no login yet - see
// backend/src/env/web/web.ts) straight into the inbox; the generic
// auth/shell scaffold (auth.js, shell.js, public.js) is unwired for now,
// not deleted - signin-gating is deferred work, not forgotten.

class VgApp extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<vg-inbox></vg-inbox>'
  }
}

customElements.define('vg-app', VgApp)
