// Headless CLI: `inbox sync`, `inbox list`, `inbox dismiss <id>`.
// Boots the same services as the local runner, no web gateway or REPL.

import Seneca from 'seneca'
import { Local } from '@voxgig/system'

import { basic, base } from '../shared/basic'

import Model from '../../../model/model.json'


run()


async function run() {
  const { deep } = Seneca.util

  const seneca = Seneca(deep(base.seneca, { tag: 'repo-manager-cli' }))

  seneca.context.model = Model
  seneca.context.env = 'local'
  seneca.context.stage = 'local'
  seneca.context.srvname = 'all'

  basic(seneca)

  seneca.use(require('../../forge/forge_github'), {
    provider: { sdk: { headers: { Authorization: 'Bearer ' + (process.env.GITHUB_TOKEN || '') } } },
  })

  seneca.use(Local, {
    srv: {
      folder: __dirname + '/../../../dist/srv',
    },
  })

  await seneca.ready()

  const [, , cmd, ...rest] = process.argv

  if ('sync' === cmd) {
    await cmd_sync(seneca, rest)
  }
  else if ('list' === cmd) {
    await cmd_list(seneca)
  }
  else if ('dismiss' === cmd) {
    await cmd_dismiss(seneca, rest)
  }
  else {
    console.log('Usage: inbox sync --repos owner/name,owner/name --user login')
    console.log('       inbox list')
    console.log('       inbox dismiss <id>')
    process.exitCode = 1
  }

  await seneca.close()

  // The github-provider SDK's fetch client leaves a keep-alive handle open,
  // so the event loop never drains on its own - a CLI has to exit, not wait.
  process.exit(process.exitCode || 0)
}


function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf('--' + name)
  return -1 === i ? undefined : args[i + 1]
}


async function cmd_sync(seneca: any, args: string[]) {
  const repos = flag(args, 'repos')
  const user = flag(args, 'user')

  if (!repos || !user) {
    console.log('Usage: inbox sync --repos owner/name,owner/name --user login')
    process.exitCode = 1
    return
  }

  const res = await seneca.post({
    aim: 'inbox', sync: 'item',
    repo_ids: repos.split(','),
    for_user: user,
  })

  console.log(`synced: ${res.created} created, ${res.updated} updated, ${res.resolved} auto-resolved`)
}


async function cmd_list(seneca: any) {
  const res = await seneca.post({ aim: 'inbox', list: 'item' })

  if (0 === res.items.length) {
    console.log('inbox is empty')
    return
  }

  for (const item of res.items) {
    console.log(`${item.id}  [${item.kind}]  ${item.repo}  ${item.title}  (${item.actor})`)
  }
}


async function cmd_dismiss(seneca: any, args: string[]) {
  const id = args[0]

  if (!id) {
    console.log('Usage: inbox dismiss <id>')
    process.exitCode = 1
    return
  }

  const res = await seneca.post({ aim: 'inbox', dismiss: 'item', id })

  console.log(res.ok ? `dismissed: ${id}` : `not found: ${id}`)
}
