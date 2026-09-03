
import { v4 } from 'uuid'

import { entity } from '@voxgig/util'

import Model from '../../../model/model.json'


// Core seneca setup shared by the local runner, the lambda bootstrap, and
// (optionally) tests.
//
// `user` provides user records and the signed-in principal. Access control
// is done EXPLICITLY in the service actions: the generic `ent` service scopes
// by project membership, and a service can scope by owner_id from the
// principal. @seneca/owner is intentionally NOT used — it annotated every
// entity (including sys/user, which broke self-service password changes) and
// its owner-only filter is incompatible with shared, membership-based data.
const base = {
  seneca: {
    timeout: 5 * 60 * 1000,
    legacy: false,
    log: {
      logger: 'flat',
      level: 'warn',
    },
  },
  options: {
    promisify: {},
    entity: {
      generate_id: () => v4().split('-').join(''),
      ent: entity(Model),
    },
    entity_util: {
      when: {
        active: true,
        human: 'y',
      },
    },
    user: {
      fields: {
        standard: ['id', 'handle', 'email', 'name', 'active'],
      },
    },
    reload: {},
  },
}


function basic(seneca: any, options?: any) {
  options = options || {}
  const deep = seneca.util.deep

  seneca
    .use('promisify', deep(base.options.promisify, options.promisify))
    .use('entity', deep(base.options.entity, options.entity))
    .use('entity-util', deep(base.options.entity_util, options.entity_util))
    .use('user', deep(base.options.user, options.user))
    .use('reload', deep(base.options.reload, options.reload))

  return seneca
}


export {
  basic,
  base,
}
