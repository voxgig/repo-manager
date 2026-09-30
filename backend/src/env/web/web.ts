
// Local web runner: the local in-memory backend plus an HTTP layer for
// the SPA - express serving the frontend dist, the model, and a single
// seneca gateway endpoint (/seneca) that the browser-side Seneca bus
// posts messages to (seneca-browser fetch transport).
//
// Login (srv/auth, @seneca/user + @seneca/gateway-auth's express_cookie
// spec) sets/reads the session cookie on every request, but nothing is
// gated behind it yet (user.require: false) - the inbox/drift views stay
// reachable unauthenticated, same as before. Gating them is a separate,
// later step once there's an actual reason to lock the app down.

import Path from 'node:path'

import Express from 'express'
import CookieParser from 'cookie-parser'

import Seneca from 'seneca'
import { Local, context, devtools } from '@voxgig/system'

// require(), not import - see backend/src/env/shared/basic.ts's own comment.
const SenecaEnv = require('@seneca/env')
const SenecaGateway = require('@seneca/gateway')
const SenecaGatewayExpress = require('@seneca/gateway-express')
const SenecaGatewayAuth = require('@seneca/gateway-auth')

import { basic, base } from '../shared/basic'

import Pkg from '../../../package.json'
import Model from '../../../model/model.json'


const PORT = parseInt(process.env.PORT || '', 10) ||
  (Model as any).main.conf.port.backend


run()


async function run() {
  const { deep } = Seneca.util

  const seneca = Seneca(deep(base.seneca, { tag: 'repo-manager-web' }))

  context(seneca, Model, Pkg, { env: 'web' })
  devtools(seneca, Model, { env: 'web' })

  basic(seneca)

  // Local dev convenience: env.local.js (gitignored, see .example) supplies
  // defaults for GITHUB_TOKEN/REPO_MANAGER_* so they don't need re-exporting
  // every session - process.env wins when a var IS set, same as any other
  // default. Backfilling process.env (rather than switching every reader to
  // seneca.context.SenecaEnv.var) keeps every existing process.env.X call
  // site - here and in srv/inbox/web_*.ts - working unchanged.
  seneca.use(SenecaEnv, {
    var: (valid: any) => ({
      GITHUB_TOKEN: valid.Skip(String),
      REPO_MANAGER_REPOS: valid.Skip(String),
      REPO_MANAGER_GITHUB_USER: valid.Skip(String),
      REPO_MANAGER_FORGE: valid.Skip(String),
      ADMIN_EMAIL: valid.Skip(String),
      ADMIN_PASSWORD: valid.Skip(String),
    }),
    file: Path.join(__dirname, '..', '..', '..', 'env.local.js') + ';?',
  })
  // Plugin init runs during ready(), not use() - the env plugin has to have
  // actually loaded before context.SenecaEnv exists to read, and before
  // forge_github (registered next) reads process.env.GITHUB_TOKEN.
  await seneca.ready()
  // Object.assign would stringify an unset var to the literal "undefined" -
  // only backfill the ones @seneca/env actually resolved a value for.
  for (const [k, v] of Object.entries(seneca.context.SenecaEnv.var)) {
    if (undefined !== v) {
      process.env[k] = v as string
    }
  }

  // Seed the one admin login if ADMIN_EMAIL/ADMIN_PASSWORD are set and no
  // such user exists yet. Mem-store (the default here - see basic.ts) is
  // per-process and wiped on restart, so this can't be a one-time script
  // the way a real persistent store would let it be; it has to run at
  // every boot instead, and no-op once the account already exists.
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = seneca.context.SenecaEnv.var
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const existing = await seneca.entity('sys/user').list$({ email: ADMIN_EMAIL })
    if (0 === existing.length) {
      await seneca.post('sys:user,register:user', { email: ADMIN_EMAIL, pass: ADMIN_PASSWORD })
      console.log('repo-manager-web: seeded admin user', ADMIN_EMAIL)
    }
  }

  seneca
    .use(SenecaGateway, {
      // THE BROWSER SURFACE. Only aim:web is reachable from a browser:
      // every message the SPA may send is declared in the model as an
      // aim:web PROXY that forwards to the real service message.
      allow: { 'aim:web': true },
    })
    .use(SenecaGatewayExpress, {
      // The cookie-WRITING config (res.cookie/clearCookie) - a separate
      // option from gateway-auth's own below, which only READS the
      // cookie back. Same name in both, or gateway-express keeps writing
      // its own 'seneca-auth' default while gateway-auth looks for a
      // cookie that's never actually set under that name.
      auth: { token: { name: 'repo-manager-auth' } },
    })
    .use(SenecaGatewayAuth, {
      spec: {
        express_cookie: {
          active: true,
          token: { name: 'repo-manager-auth' },
          // require: false - resolve the principal from the cookie when
          // one exists (web_load_auth.ts reads it), but don't block
          // requests without one; see this file's own header comment.
          user: { auth: true, require: false },
        },
      },
    })

  // REPO_MANAGER_FORGE=mem runs against the same in-memory fixture data the
  // test suite uses (test/fixtures/forge_mem.ts) instead of real GitHub -
  // no token needed, lets a second instance run alongside the real one for
  // demo purposes. =gitlab runs the canned GitLab stub (SPEC §19.5) - proves
  // nothing here branches on which forge answers. Defaults to the real
  // GitHub forge, same as always.
  if ('mem' === process.env.REPO_MANAGER_FORGE) {
    seneca.use(require('../../../dist-test/fixtures/forge_mem'))
  }
  else if ('gitlab' === process.env.REPO_MANAGER_FORGE) {
    seneca.use(require('../../forge/forge_gitlab'))
  }
  else {
    seneca.use(require('../../forge/forge_github'), {
      provider: { sdk: { headers: { Authorization: 'Bearer ' + (process.env.GITHUB_TOKEN || '') } } },
    })
  }

  seneca.use(Local, {
    srv: {
      folder: __dirname + '/../../../dist/srv',
    },
  })

  await seneca.ready()

  const app = Express()
  // The frontend folder is a sibling of backend/; from dist/env/web go up
  // to the project root, then into its dist. The folder name comes from
  // the model (env web `dir`), so it stays in step if the project renames it.
  const webdist = Path.join(
    __dirname, '..', '..', '..', '..', 'frontend', 'dist')

  app
    .use(Express.json())
    // Before the /seneca route, not after - gateway-auth's express_cookie
    // hook reads req.cookies (set by this middleware) while handling the
    // gateway-express request.
    .use(CookieParser())
    .post('/seneca', seneca.export('gateway-express/handler'))
    // Bespoke, read-only REST endpoint for the MCP/SDK path (step 9) - calls
    // the inbox concern directly, NOT the generic aim:ent gatekeeper we
    // deliberately excluded (see the srv/auth,srv/ent,srv/api deletions in
    // this project's build routine). No auth yet, same as everywhere else.
    .get('/api/v1/inbox', async (_req: any, res: any) => {
      const out = await seneca.post({ aim: 'inbox', list: 'item' })
      res.json(out.ok ? out.items : [])
    })
    .get('/model.json',
      (_req: any, res: any) => res.sendFile(
        Path.join(__dirname, '..', '..', '..', 'model', 'model.json')))
    .use(Express.static(webdist))
    .listen(PORT)

  console.log('repo-manager-web started', { port: PORT, version: Pkg.version })
}
