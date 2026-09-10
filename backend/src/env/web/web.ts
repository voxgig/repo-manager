
// Local web runner: the local in-memory backend plus an HTTP layer for
// the SPA - express serving the frontend dist, the model, and a single
// seneca gateway endpoint (/seneca) that the browser-side Seneca bus
// posts messages to (seneca-browser fetch transport).
//
// No login yet - Stage 1's CLI/tests also run unauthenticated (see
// src/forge/forge_github.ts). Signin-gating is deferred, not forgotten.

import Path from 'node:path'

import Express from 'express'

import Seneca from 'seneca'
import { Local, context, devtools } from '@voxgig/system'

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

  seneca
    .use('gateway', {
      // THE BROWSER SURFACE. Only aim:web is reachable from a browser:
      // every message the SPA may send is declared in the model as an
      // aim:web PROXY that forwards to the real service message.
      allow: { 'aim:web': true },
    })
    .use('gateway-express', {})

  seneca.use(require('../../forge/forge_github'), {
    provider: { sdk: { headers: { Authorization: 'Bearer ' + (process.env.GITHUB_TOKEN || '') } } },
  })

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
