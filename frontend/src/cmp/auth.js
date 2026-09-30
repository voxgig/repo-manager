// Auth: a seneca plugin holding the signed-in principal (state), and the
// <vg-auth> login form shown to signed-out visitors. No signup or
// forgot-password - see backend/model/srv.aon's own comment on why
// (single-operator repo fleet, one seeded admin account).

import { bus, emit } from '../bus.js'
import * as Hooks from '../hooks.js'


bus.use(function auth_cmp() {
  const seneca = this

  let user = null

  seneca.add('cmp:auth,get:state', function (msg, reply) {
    reply({ ok: true, user })
  })

  // Resolve current auth from the backend (cookie session).
  seneca.add('cmp:auth,load:state', function (msg, reply) {
    this.act('aim:web,on:auth,load:auth', function (err, out) {
      user = (!err && out.ok && 'signedin' === out.state) ? out.user : null
      emit('auth', { user })
      reply({ ok: true, user })
    })
  })

  seneca.add('cmp:auth,signin:user', function (msg, reply) {
    this.act('aim:web,on:auth,signin:user', {
      email: msg.email,
      password: msg.password,
    }, function (err, out) {
      if (err || !out.ok) {
        return reply({ ok: false, why: (out && out.why) || 'signin-failed' })
      }
      user = out.user
      emit('auth', { user })
      reply({ ok: true, user })
    })
  })

  seneca.add('cmp:auth,signout:user', function (msg, reply) {
    this.act('aim:web,on:auth,signout:user', function () {
      user = null
      emit('auth', { user })
      reply({ ok: true })
    })
  })
})


// The login form.
class VgAuth extends HTMLElement {
  connectedCallback() {
    this.render()
  }

  render() {
    this.innerHTML = `
      <form class="vg-auth-form">
        <h2>Sign in</h2>
        <label>Email <input name="email" type="email" required /></label>
        <label>Password <input name="password" type="password" required /></label>
        <button type="submit">Sign in</button>
        ${Hooks.html('auth:form:footer', {})}
        <div class="vg-auth-err" id="vg-auth-err"></div>
      </form>`
    this.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault()
      const fd = new FormData(ev.target)
      const res = await bus.post('cmp:auth,signin:user', {
        email: fd.get('email'),
        password: fd.get('password'),
      })
      if (!res.ok) {
        this.querySelector('#vg-auth-err').textContent = 'Sign in failed: ' + res.why
      }
    }
  }
}

customElements.define('vg-auth', VgAuth)
