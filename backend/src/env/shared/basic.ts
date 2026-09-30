
import { v4 } from 'uuid'

import { entity } from '@voxgig/util'

import Model from '../../../model/model.json'

// require(), not import - these plugins' CJS export shapes vary (some have
// no .d.ts, entity-util has no default export) and a literal-string
// require() bundles identically to import under esbuild either way, so
// there's no reason to fight each package's type shape individually.
const SenecaPromisify = require('seneca-promisify')
const SenecaEntity = require('seneca-entity')
const SenecaEntityUtil = require('@seneca/entity-util')
const SenecaUser = require('@seneca/user')
const SenecaReload = require('@seneca/reload')


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

  // Direct plugin references, not string names - use-plugin's dynamic
  // require() silently loads nothing under a bundled Cloudflare Worker
  // (confirmed with a wrangler dev spike), and a direct reference works
  // identically on plain Node, so there's no target-specific branch needed.
  seneca
    .use(SenecaPromisify, deep(base.options.promisify, options.promisify))
    .use(SenecaEntity, deep(base.options.entity, options.entity))
    .use(SenecaEntityUtil, deep(base.options.entity_util, options.entity_util))
    .use(SenecaReload, deep(base.options.reload, options.reload))

  // @seneca/user's default password hasher forks a child process
  // (lib/hasher.js) to keep hashing off the event loop - ChildProcess.fork
  // doesn't exist in a Workers isolate, and the call never errors, it just
  // never calls back, so seneca.ready() hangs forever with no timeout
  // (confirmed live against a real wrangler dev DO). worker.ts passes
  // { fork: false } for exactly this - @seneca/user's own inline-hash
  // path (identical algorithm, no subprocess), from
  // github:Rarfael/seneca-user#cloudflare-workers-compat (senecajs/
  // seneca-user PR #122, open upstream). Node targets don't set it,
  // so they keep the real fork-based path unchanged.
  seneca.use(SenecaUser, deep(base.options.user, options.user))

  return seneca
}


export {
  basic,
  base,
}
