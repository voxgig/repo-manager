// repo-manager SPA entry: web components on a Seneca service bus. No
// framework — each component is a custom element; all data flows are bus
// messages, with aim:* travelling to the backend gateway via the
// seneca-browser transport.

import './theme.css'
import './style.css'
import './theme.js'
import './bus.js'
import './cmp/auth.js'
import './cmp/inbox.js'
import './cmp/app.js'

// Custom entity views (ux:{view:'custom'}) — generated index of hand-coded views.
import './views.js'

// Project customisations: hook registrations + custom.css (create-once).
import './customise.js'
