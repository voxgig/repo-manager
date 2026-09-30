
import Seneca from 'seneca'

import Model from '../../../../model/model.json'

// The shared plugin setup (loads @seneca/user etc.) from compiled output.
const { basic } = require('../../../../dist/env/shared/basic.js')


// Seneca with @seneca/user + the auth service (from compiled dist/srv).
async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  seneca.test()
  basic(seneca)

  seneca
    .use('reload')
    .use('../../../../dist/srv/auth/auth-srv')

  return seneca.ready()
}


// Post a gateway message AS a signed-in user. A custom$ directive on the
// message itself does NOT reach the action's own fixedmeta.custom
// (confirmed live) - @seneca/gateway's real mechanism is a per-request
// delegate built via root.delegate(fixed, {custom}) (gateway.ts), whose
// fixedmeta then inherits down through every action dispatched off it, so
// that's what this simulates too.
function as(seneca: any, user: any, msg: any, extra?: any) {
  const principal = Object.assign({ user }, extra)
  return seneca.delegate({}, { custom: { principal } }).post(msg)
}


export {
  makeSeneca,
  as,
  Model,
}
