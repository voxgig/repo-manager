// `apply` (SPEC §14.2, §15), tested per SPEC §18's own stated approach for
// the git layer ("local bare repos as remotes... real git, real pushes, no
// network, no mocks"), combined with real forge:mem message dispatch -
// unlike plan_policy.ts, apply_policy.ts genuinely calls forge actions
// (get:branch_rules/list:pr/open:pr), so it needs both together.
//
// clone_urls (a test-only seam in apply_policy.ts) points each repo_id at
// a real local bare repo instead of a real github.com URL, while forge:mem
// still answers every aim:forge,* action - decoupling "where git pushes"
// from "which forge answers API-shaped questions" lets forge:mem's fake
// repo_ids drive a fully real git pipeline. Every repo_id below is unique
// to its own test (prefixed apply-test/) so tests sharing one workspace
// (set once, below) never collide on mirror/worktree paths.

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'
import { execFileSync } from 'node:child_process'
import Fs from 'node:fs'
import Os from 'node:os'
import Path from 'node:path'

import Seneca from 'seneca'
import { Local } from '@voxgig/system'

import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const forge_mem = require('../../dist/forge/forge_mem')

// Set once, synchronously, before any test body runs - every test below
// uses a distinct repo_id, so sharing one workspace root is safe even if
// the runner interleaves them.
const WORKSPACE = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-apply-workspace-'))
process.env.REPO_MANAGER_WORKSPACE = WORKSPACE


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 5555, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.test()
  basic(seneca)
  seneca.use(forge_mem)
  seneca.use(Local, { srv: { folder: __dirname + '/../../dist/srv' } })
  return seneca.ready()
}

// A real bare repo with real history - same shape as git_repo.test.ts's
// own makeBareRepo(), with package.json so standard-ci's applies.hasFile
// gate passes.
function makeBareRepo(): string {
  const bareDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-apply-bare-'))
  execFileSync('git', ['init', '--bare', '-b', 'main', bareDir])

  const workDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-apply-work-'))
  execFileSync('git', ['init', '-b', 'main', workDir])
  execFileSync('git', ['-C', workDir, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', workDir, 'config', 'user.name', 'test'])
  Fs.writeFileSync(Path.join(workDir, 'package.json'), '{}\n')
  execFileSync('git', ['-C', workDir, 'add', '.'])
  execFileSync('git', ['-C', workDir, 'commit', '-m', 'initial'])
  execFileSync('git', ['-C', workDir, 'push', bareDir, 'main'])

  return bareDir
}

// S10's fixture: a tool-named branch that already carries a commit this
// tool did not author, pushed directly (not through apply).
function pushForeignBranch(bareDir: string, branchName: string) {
  const workDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-apply-foreign-'))
  execFileSync('git', ['clone', bareDir, workDir])
  execFileSync('git', ['-C', workDir, 'checkout', '-b', branchName])
  execFileSync('git', ['-C', workDir, 'config', 'user.email', 'someone-else@example.com'])
  execFileSync('git', ['-C', workDir, 'config', 'user.name', 'someone-else'])
  Fs.writeFileSync(Path.join(workDir, 'unrelated.txt'), 'not from repo-manager\n')
  execFileSync('git', ['-C', workDir, 'add', '.'])
  execFileSync('git', ['-C', workDir, 'commit', '-m', 'someone else was here first'])
  execFileSync('git', ['-C', workDir, 'push', 'origin', branchName])
}

function branchExists(bareDir: string, branchName: string): boolean {
  const out = execFileSync('git', ['-C', bareDir, 'branch', '--list', branchName], { encoding: 'utf8' })
  return out.trim().length > 0
}

function commitCount(bareDir: string, branchName: string): number {
  const out = execFileSync('git', ['-C', bareDir, 'rev-list', '--count', branchName], { encoding: 'utf8' })
  return parseInt(out.trim(), 10)
}


describe('apply_policy', () => {
  test('S1: refuses without confirmation, touches no repo', async () => {
    const seneca = await makeSeneca()
    const res = await seneca.post({ aim: 'inbox', apply: 'policy', repo_ids: ['apply-test/s1'] })
    expect(res.ok).to.be.false()
    expect(res.why).to.include('confirmation')
    await seneca.close()
  })


  test('S5: aborts before touching any repo when over the limit', async () => {
    const seneca = await makeSeneca()
    const res = await seneca.post({
      aim: 'inbox', apply: 'policy', confirmed: true, limit: 1,
      repo_ids: ['apply-test/s5-a', 'apply-test/s5-b'],
    })
    expect(res.ok).to.be.false()
    expect(res.why).to.include('S5')
    await seneca.close()
  })


  test('S2: skips a repo whose computed branch is protected by an effective rule, never pushes', async () => {
    const bareDir = makeBareRepo()
    const seneca = await makeSeneca()
    const repo_id = 'apply-test/protected'

    const res = await seneca.post({
      aim: 'inbox', apply: 'policy', confirmed: true, forge: 'mem',
      repo_ids: [repo_id], policy_ids: ['standard-ci'],
      clone_urls: { [repo_id]: bareDir },
    })

    expect(res.ok).to.be.true()
    expect(res.repos[0].status).to.equal('skipped')
    expect(res.repos[0].why).to.include('S2')
    expect(branchExists(bareDir, 'repo-manager/standard-ci')).to.be.false()
    await seneca.close()
  })


  test('S6: idempotent - second apply with no upstream change is a no-op, opens no second PR', async () => {
    const bareDir = makeBareRepo()
    const seneca = await makeSeneca()
    const repo_id = 'apply-test/s6'
    const msg = {
      aim: 'inbox', apply: 'policy', confirmed: true, forge: 'mem',
      repo_ids: [repo_id], policy_ids: ['standard-ci'],
      clone_urls: { [repo_id]: bareDir },
    }

    const first = await seneca.post(msg)
    expect(first.ok).to.be.true()
    expect(first.repos[0].status).to.equal('pr-opened')
    expect(branchExists(bareDir, 'repo-manager/standard-ci')).to.be.true()

    const second = await seneca.post(msg)
    expect(second.ok).to.be.true()
    expect(second.repos[0].status).to.equal('no-op')

    const listRes = await seneca.post({ aim: 'forge', list: 'pr', forge: 'mem', repo_id })
    expect(listRes.prs).to.have.length(1)
    await seneca.close()
  })


  test('S7: one repo failing never aborts the run - the other still reaches pr-opened', async () => {
    const goodBare = makeBareRepo()
    const seneca = await makeSeneca()

    const res = await seneca.post({
      aim: 'inbox', apply: 'policy', confirmed: true, forge: 'mem',
      repo_ids: ['apply-test/s7-bad', 'apply-test/s7-good'],
      policy_ids: ['standard-ci'],
      clone_urls: {
        'apply-test/s7-bad': Path.join(Os.tmpdir(), 'rm-apply-does-not-exist-' + Date.now()),
        'apply-test/s7-good': goodBare,
      },
    })

    expect(res.ok).to.be.true()
    const bad = res.repos.find((r: any) => 'apply-test/s7-bad' === r.repo_id)
    const good = res.repos.find((r: any) => 'apply-test/s7-good' === r.repo_id)
    expect(bad.status).to.equal('failed')
    expect(good.status).to.equal('pr-opened')
    await seneca.close()
  })


  test('S10: existing work is never clobbered - a foreign commit on the tool branch skips the repo', async () => {
    const bareDir = makeBareRepo()
    pushForeignBranch(bareDir, 'repo-manager/standard-ci')
    const seneca = await makeSeneca()
    const repo_id = 'apply-test/s10'

    const before = commitCount(bareDir, 'repo-manager/standard-ci')

    const res = await seneca.post({
      aim: 'inbox', apply: 'policy', confirmed: true, forge: 'mem',
      repo_ids: [repo_id], policy_ids: ['standard-ci'],
      clone_urls: { [repo_id]: bareDir },
    })

    expect(res.ok).to.be.true()
    expect(res.repos[0].status).to.equal('skipped')
    expect(res.repos[0].why).to.include('S10')
    expect(commitCount(bareDir, 'repo-manager/standard-ci')).to.equal(before)
    await seneca.close()
  })


  test('writes a run record JSONL with one line per repo plus a summary', async () => {
    const bareDir = makeBareRepo()
    const seneca = await makeSeneca()
    const repo_id = 'apply-test/run-record'

    const res = await seneca.post({
      aim: 'inbox', apply: 'policy', confirmed: true, forge: 'mem',
      repo_ids: [repo_id], policy_ids: ['standard-ci'],
      clone_urls: { [repo_id]: bareDir },
    })

    expect(Fs.existsSync(res.runRecord)).to.be.true()
    const lines = Fs.readFileSync(res.runRecord, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines).to.have.length(2)
    expect(lines[0].repo_id).to.equal(repo_id)
    expect(lines[1].run_summary).to.be.true()
    await seneca.close()
  })
})
