// Cloudflare Worker entry point: one Durable Object instance hosts the
// whole repo-manager backend (gateway + inbox srv + entity store), the same
// "one process, every srv" shape local.ts/web.ts already use - unlike
// night-sky-logbook's one-Worker-per-srv split, there's only one srv here
// (inbox), so there's nothing to split. The outer Worker's fetch() does
// nothing but route every request into that one DO instance.
//
// Seneca is built ONCE, in the DO's constructor, and reused for the life
// of the DO instance - not rebuilt per request the way night-sky-logbook's
// cloudflare.ts does for its stateless per-request Workers. That repo's
// close()-after-every-request requirement (its own module comment: a
// second getSeneca() in the same warm isolate hangs forever if the first
// instance was never closed - gate-executor's setInterval keeps a
// reference alive) is a consequence of building a FRESH instance per
// request in a reused isolate; a Durable Object already IS a persistent,
// single-instance actor, so the natural fix is to never rebuild at all,
// not to rebuild-then-close on every request.
//
// debug: { undead: true } and function-form .use() (direct plugin
// references, not string names) are both required for Seneca to survive a
// bundled Workers isolate at all - see basic.ts/forge_github.ts's own
// comments on this; confirmed against a real `wrangler dev` spike before
// this file reached its current shape.
//
// options.user: { fork: false } - @seneca/user's DEFAULT password hasher
// spawns a child process (ChildProcess.fork(), unsupported under workerd),
// which hangs seneca.ready() forever with no timeout. fork:false (from
// github:Rarfael/seneca-user#cloudflare-workers-compat - senecajs/
// seneca-user PR #122, open upstream) runs the IDENTICAL hash algorithm
// (runhash: salted+peppered SHA-512, options.rounds times, 11111 by
// default) inline instead - the fork exists only to keep hashing off the
// main event loop, not for any security reason, so this is a real fix,
// not a downgrade. Node targets don't set fork, so they keep hashing in
// a real subprocess, unchanged.

import Seneca from 'seneca'

import { basic, base } from '../shared/basic'
import { loadStaticSrv } from './static-srv'
import { inboxHandlers, authHandlers } from './handler-map'

import Pkg from '../../../package.json'
import Model from '../../../model/model.json'

const SenecaGateway = require('@seneca/gateway')
const SenecaGatewayCloudflare = require('@seneca/gateway-cloudflare')
const SenecaCloudflareDOStore = require('@seneca/cloudflare-do-store')

export interface Env {
  REPO_MANAGER_DO: DurableObjectNamespace
  REPO_MANAGER_FORGE?: string
  REPO_MANAGER_REPOS?: string
  REPO_MANAGER_GITHUB_USER?: string
  GITHUB_TOKEN?: string
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD?: string
  ASSETS?: Fetcher
}

// Minimal ambient shapes - @cloudflare/workers-types isn't a dependency
// here (this file is the only thing in the whole backend that needs
// these), so the handful of fields actually used are declared inline
// rather than pulling in the full types package for three names.
declare global {
  interface DurableObjectNamespace {
    idFromName(name: string): unknown
    get(id: unknown): { fetch(request: Request): Promise<Response> }
  }
  interface DurableObjectState {
    storage: unknown
  }
  interface Fetcher {
    fetch(request: Request): Promise<Response>
  }
}

export class RepoManagerDO {
  private env: Env
  private ready: Promise<any>
  private seneca: any = null

  constructor(private ctx: DurableObjectState, env: Env) {
    this.env = env
    this.ready = this.init()
  }

  private async init(): Promise<any> {
    const { deep } = Seneca.util

    const seneca = Seneca(deep(base.seneca, {
      tag: 'repo-manager-cloudflare@' + Pkg.version,
      debug: { undead: true },
    }))

    seneca.context.model = Model
    seneca.context.env = 'cloudflare'
    seneca.context.stage = 'cloudflare'
    seneca.context.srvname = 'all'
    seneca.context.pkg = Pkg

    // Several inbox action files read process.env directly (see
    // web_sync_item.ts) rather than a seneca.context/@seneca/env lookup -
    // same process.env.X call sites web.ts's own module comment already
    // backfills for on Node. process.env isn't populated from a Worker's
    // own env bindings automatically (nodejs_compat provides the global,
    // not this), so it's backfilled here the same way.
    for (const k of ['REPO_MANAGER_REPOS', 'REPO_MANAGER_GITHUB_USER', 'REPO_MANAGER_FORGE', 'GITHUB_TOKEN'] as const) {
      if (undefined !== this.env[k]) {
        process.env[k] = this.env[k] as string
      }
    }

    basic(seneca, { reload: { active: false }, user: { fork: false } })

    seneca.use(SenecaCloudflareDOStore, { do: { storage: this.ctx.storage } })

    seneca
      .use(SenecaGateway, { allow: { 'aim:web': true } })
      .use(SenecaGatewayCloudflare, {
        // The cookie-WRITING config, mirrors gateway-express's own separate
        // options.auth in web.ts - same name passed to
        // prepareCloudflareCookieAuth below (the READING side), or the
        // login cookie gets set under one name and looked for under
        // another (web.ts hit exactly this before both were aligned).
        auth: { token: { name: 'repo-manager-auth' } },
      })

    // @seneca/gateway-auth (used on the Node/web.ts target) has no
    // cloudflare cookie spec at all - its cookie specs are hardcoded by
    // name with no pluggable interface (verified by reading its source).
    // @seneca/gateway-cloudflare ships its own equivalent for exactly
    // this reason - see its own module comment.
    await SenecaGatewayCloudflare.prepareCloudflareCookieAuth(seneca, {
      token: { name: 'repo-manager-auth' },
      // require: false here (not true) - prepareCloudflareCookieAuth's
      // own require hook has no way to exclude aim:web,on:auth,* from the
      // gate, so it would 401 the signin request itself. The real gate
      // is registered separately below - see web.ts's own comment on
      // this same split.
      user: { auth: true, require: false },
    })

    // The actual session gate - see web.ts's own comment on why this is
    // separate from the plugin's own require option. {out, gateway$}
    // shape matches prepareCloudflareCookieAuth's own require:true hook
    // exactly (gateway-cloudflare.ts reads result.gateway$.status and
    // result.out for the response body).
    await seneca.act('sys:gateway,add:hook,hook:action', {
      action: async function requireAuth(this: any, msg: any) {
        if ('auth' === msg.on) {
          return
        }
        const user = this.fixedmeta?.custom?.principal?.user
        if (!user) {
          return { out: { ok: false, why: 'not-authenticated' }, gateway$: { status: 401 } }
        }
      },
    })

    // Mirrors web.ts's own three-way forge selection - see that file's
    // module comment. 'mem' is for local `wrangler dev` verification only
    // (dist-test is a dev build artifact, never part of a real deploy);
    // require() stays inside each branch, not hoisted to a top-level
    // import, so a real deploy's bundle never pulls in a branch it can't
    // reach - see basic.ts's own opening comment on this same discipline.
    if ('mem' === this.env.REPO_MANAGER_FORGE) {
      seneca.use(require('../../../dist-test/fixtures/forge_mem'))
    }
    else if ('gitlab' === this.env.REPO_MANAGER_FORGE) {
      seneca.use(require('../../forge/forge_gitlab'))
    }
    else {
      seneca.use(require('../../forge/forge_github'), {
        provider: { sdk: { headers: { Authorization: 'Bearer ' + (this.env.GITHUB_TOKEN || '') } } },
      })
    }

    loadStaticSrv(seneca, 'inbox', inboxHandlers)
    loadStaticSrv(seneca, 'auth', authHandlers)

    await seneca.ready()

    // Seed the one admin login, same as web.ts - see that file's own
    // comment on why this runs at boot rather than as a one-time script.
    // DO storage IS persistent (unlike Node's mem-store), so this only
    // actually does anything once; every later boot's list$() finds the
    // account already there and skips it.
    if (this.env.ADMIN_EMAIL && this.env.ADMIN_PASSWORD) {
      const existing = await seneca.entity('sys/user').list$({ email: this.env.ADMIN_EMAIL })
      if (0 === existing.length) {
        await seneca.post('sys:user,register:user', { email: this.env.ADMIN_EMAIL, pass: this.env.ADMIN_PASSWORD })
      }
    }

    this.seneca = seneca
    return seneca
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready

    const url = new URL(request.url)
    if ('/seneca' !== url.pathname || 'POST' !== request.method) {
      return new Response('not found', { status: 404 })
    }

    const handler = this.seneca.export('gateway-cloudflare/handler')
    return handler(request, { env: this.env, execCtx: undefined })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if ('/seneca' === url.pathname) {
      const id = env.REPO_MANAGER_DO.idFromName('singleton')
      const stub = env.REPO_MANAGER_DO.get(id)
      return stub.fetch(request)
    }

    // Bundled at build time (same Model import worker.ts's own DO uses),
    // not proxied from the DO or the assets binding - the frontend fetches
    // this at boot (frontend/src/model.js) same as web.ts's own
    // GET /model.json route.
    if ('/model.json' === url.pathname) {
      return new Response(JSON.stringify(Model), {
        headers: { 'content-type': 'application/json' },
      })
    }

    // Every other path is the built frontend, served by the assets binding
    // (wrangler.json) - not proxied through the DO, same split web.ts's
    // Express.static(webdist) + /seneca POST route already makes.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('not found', { status: 404 })
  },
}
