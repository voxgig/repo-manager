// Headless CLI: `inbox sync`, `inbox list`, `inbox dismiss <id>`.
// Boots the same services as the local runner, no web gateway or REPL.

import Path from 'node:path'
import { execSync } from 'node:child_process'

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

  // See src/env/web/web.ts for why: env.local.js backfills process.env so
  // GITHUB_TOKEN doesn't need re-exporting every session.
  seneca.use('env', {
    var: (valid: any) => ({
      GITHUB_TOKEN: valid.Skip(String),
      REPO_MANAGER_REPOS: valid.Skip(String),
      REPO_MANAGER_GITHUB_USER: valid.Skip(String),
      REPO_MANAGER_FORGE: valid.Skip(String),
    }),
    file: Path.join(__dirname, '..', '..', '..', 'env.local.js') + ';?',
  })
  // Plugin init runs during ready(), not use() - see web.ts for why this
  // needs its own ready() before forge_github reads process.env.GITHUB_TOKEN.
  await seneca.ready()
  for (const [k, v] of Object.entries(seneca.context.SenecaEnv.var)) {
    if (undefined !== v) {
      process.env[k] = v as string
    }
  }

  // Same three-way choice as web.ts: =mem/=gitlab need no token, useful for
  // trying every CLI command (including status) without real credentials.
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
  else if ('status' === cmd) {
    await cmd_status(seneca, rest)
  }
  else if ('lint' === cmd) {
    cmd_lint()
  }
  else if ('doctor' === cmd) {
    await cmd_doctor(seneca, rest)
  }
  else {
    console.log('Usage: inbox sync --repos owner/name,owner/name --user login')
    console.log('       inbox list')
    console.log('       inbox dismiss <id>')
    console.log('       inbox status --repos owner/name,owner/name [--format table|json|md]')
    console.log('       inbox lint')
    console.log('       inbox doctor [--tail]')
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


// SPEC §14.3: the drift matrix, available as a table, JSON, and Markdown
// (for pasting into a tracking issue) - the CLI counterpart to the app's
// own Drift matrix view (aim:inbox,list:drift), same data either way.
const STATUS_SYMBOL: Record<string, string> = {
  compliant: '✓', drifted: '✕ drift', 'not-applicable': '–', error: '⚠ error',
}

async function cmd_status(seneca: any, args: string[]) {
  const repos = flag(args, 'repos')
  const format = flag(args, 'format') || 'table'

  if (!repos) {
    console.log('Usage: inbox status --repos owner/name,owner/name [--format table|json|md]')
    process.exitCode = 1
    return
  }

  const res = await seneca.post({ aim: 'inbox', list: 'drift', repo_ids: repos.split(',') })
  if (!res.ok) {
    console.log('status failed')
    process.exitCode = 1
    return
  }

  const repoIds: string[] = []
  for (const cell of res.cells) {
    if (!repoIds.includes(cell.repo)) {
      repoIds.push(cell.repo)
    }
  }
  const cellAt = (repo: string, policyId: string) =>
    res.cells.find((c: any) => c.repo === repo && c.policy_id === policyId)

  if ('json' === format) {
    console.log(JSON.stringify({ policies: res.policies, cells: res.cells }, null, 2))
  }
  else if ('md' === format) {
    console.log(statusMarkdown(res.policies, repoIds, cellAt))
  }
  else {
    console.log(statusTable(res.policies, repoIds, cellAt))
  }
}

function statusMarkdown(policies: any[], repoIds: string[], cellAt: any) {
  const header = `| repo | ${policies.map((p) => p.id).join(' | ')} |`
  const sep = `| --- | ${policies.map(() => '---').join(' | ')} |`
  const rows = repoIds.map((repo) => {
    const cells = policies.map((p) => {
      const cell = cellAt(repo, p.id)
      return cell ? STATUS_SYMBOL[cell.status] : '–'
    })
    return `| ${repo} | ${cells.join(' | ')} |`
  })
  return [header, sep, ...rows].join('\n')
}

function statusTable(policies: any[], repoIds: string[], cellAt: any) {
  const repoWidth = Math.max(4, ...repoIds.map((r) => r.length))
  const colWidths = policies.map((p) => Math.max(p.id.length, 8))
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))

  const header = pad('REPO', repoWidth) + '  ' + policies.map((p, i) => pad(p.id, colWidths[i])).join('  ')
  const rows = repoIds.map((repo) => {
    const cells = policies.map((p, i) => {
      const cell = cellAt(repo, p.id)
      return pad(cell ? STATUS_SYMBOL[cell.status] : '-', colWidths[i])
    })
    return pad(repo, repoWidth) + '  ' + cells.join('  ')
  })
  return [header, ...rows].join('\n')
}


// SPEC §17: "validate config + policies, offline" - no forge call, no
// network, just checks what's already configured is actually usable
// before a real run hits it. Exit code 3 (config/auth/IO failure, §17's
// own table) on any problem, not 1 - lint isn't status, finding a problem
// here isn't "drift found".
// Shared by lint and doctor - doctor's own "validates config and policies"
// check (§17) is exactly this, not a second implementation of it.
function collectLintProblems(): { problems: string[], policyCount: number } {
  const problems: string[] = []

  const repos = process.env.REPO_MANAGER_REPOS
  if (!repos) {
    problems.push('REPO_MANAGER_REPOS is not set')
  }
  else {
    for (const repo_id of repos.split(',')) {
      if (!/^[^/]+\/[^/]+$/.test(repo_id.trim())) {
        problems.push(`repo_id "${repo_id}" is not "owner/repo" shaped`)
      }
    }
  }
  if (!process.env.REPO_MANAGER_GITHUB_USER) {
    problems.push('REPO_MANAGER_GITHUB_USER is not set')
  }

  const { SEED_POLICIES } = require('../../srv/inbox/check_policy')
  const seenIds = new Set<string>()
  for (const policy of SEED_POLICIES) {
    if (!policy.id) {
      problems.push('a policy is missing an id')
      continue
    }
    if (seenIds.has(policy.id)) {
      problems.push(`duplicate policy id "${policy.id}"`)
    }
    seenIds.add(policy.id)

    if (!policy.description) {
      problems.push(`policy "${policy.id}" is missing a description`)
    }
    if (policy.applies && 'string' !== typeof policy.applies.hasFile) {
      problems.push(`policy "${policy.id}"'s applies.hasFile must be a string`)
    }
    if (!Array.isArray(policy.check) || 0 === policy.check.length) {
      problems.push(`policy "${policy.id}" has no checks`)
      continue
    }
    for (const check of policy.check) {
      if (!check.path) {
        problems.push(`policy "${policy.id}" has a check with no path`)
      }
      if ('file.exists' === check.action) {
        continue
      }
      if ('file.matches' === check.action) {
        if (!check.contains && !check.regex) {
          problems.push(`policy "${policy.id}"'s file.matches check on "${check.path}" has neither contains nor regex`)
        }
        if (check.regex) {
          try {
            new RegExp(check.regex)
          }
          catch (e: any) {
            problems.push(`policy "${policy.id}"'s regex on "${check.path}" is invalid: ${e.message}`)
          }
        }
        continue
      }
      problems.push(`policy "${policy.id}" has an unknown check action "${check.action}"`)
    }
  }

  return { problems, policyCount: SEED_POLICIES.length }
}

function cmd_lint() {
  const { problems, policyCount } = collectLintProblems()

  if (0 === problems.length) {
    console.log(`lint: ok - ${policyCount} polic${1 === policyCount ? 'y' : 'ies'}, config valid`)
    return
  }

  console.log(`lint: ${problems.length} problem${1 === problems.length ? '' : 's'}`)
  for (const p of problems) {
    console.log(`  - ${p}`)
  }
  process.exitCode = 3
}


// SPEC §17: "the first command anyone runs" - verifies credentials, rate-
// limit headroom, config/policies (via lint's own checks), and git. Real
// scope, not the full spec: `--tail` and per-connection identity both need
// @seneca/station, which doesn't exist yet (checked - no npm package, no
// local checkout, an empty placeholder repo only) - printed as such rather
// than faked. When station exists, only how the credential gets resolved
// changes; these same checks stay.
async function cmd_doctor(seneca: any, args: string[]) {
  if (args.includes('--tail')) {
    console.log('doctor --tail: not available - requires @seneca/station (not built yet)')
    process.exitCode = 3
    return
  }

  let ok = true

  try {
    execSync('git --version', { stdio: 'ignore' })
    console.log('✓ git available')
  }
  catch {
    console.log('✗ git not found on PATH')
    ok = false
  }

  const forge = process.env.REPO_MANAGER_FORGE || 'github'
  const rate = await seneca.post({ aim: 'forge', get: 'rate', forge })
  if (!rate.ok) {
    console.log(`✗ ${forge} credential: ${rate.why}`)
    ok = false
  }
  else {
    console.log(`✓ ${forge} credential valid`)
    const pct = Math.round(100 * rate.remaining / rate.limit)
    console.log(`  rate limit: ${rate.remaining}/${rate.limit} remaining (${pct}%), resets ${new Date(rate.reset * 1000).toLocaleTimeString()}`)
    if (pct < 10) {
      console.log('  ⚠ rate limit headroom below 10%')
    }
  }

  const { problems, policyCount } = collectLintProblems()
  if (0 === problems.length) {
    console.log(`✓ config valid (${policyCount} polic${1 === policyCount ? 'y' : 'ies'})`)
  }
  else {
    console.log(`✗ config: ${problems.length} problem${1 === problems.length ? '' : 's'}`)
    for (const p of problems) {
      console.log(`  - ${p}`)
    }
    ok = false
  }

  console.log('· --tail not available - requires @seneca/station (not built yet)')

  if (!ok) {
    process.exitCode = 3
  }
}
