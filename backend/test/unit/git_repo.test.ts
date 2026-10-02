// `plan`'s git layer (SPEC §14.2), tested per SPEC §18's own stated
// approach for it: "Local bare repos as remotes. Real git, real pushes,
// no network, no mocks." No GitHub, no token, no test.skip gating - these
// need neither, so they run in default CI like everything else here.

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'
import { execFileSync } from 'node:child_process'
import Fs from 'node:fs'
import Os from 'node:os'
import Path from 'node:path'

const GitRepo = require('../../dist/srv/inbox/git_repo.js')
const { runApply, appliesLocally } = require('../../dist/srv/inbox/apply_action.js')


// A real bare repo with real history, built by pushing from a throwaway
// working clone - not a fixture file, actual git commands throughout.
function makeBareRepo(): string {
  const bareDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-test-bare-'))
  execFileSync('git', ['init', '--bare', '-b', 'main', bareDir])

  const workDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-test-work-'))
  execFileSync('git', ['init', '-b', 'main', workDir])
  execFileSync('git', ['-C', workDir, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', workDir, 'config', 'user.name', 'test'])
  Fs.writeFileSync(Path.join(workDir, 'package.json'), '{}\n')
  execFileSync('git', ['-C', workDir, 'add', '.'])
  execFileSync('git', ['-C', workDir, 'commit', '-m', 'initial'])
  execFileSync('git', ['-C', workDir, 'push', bareDir, 'main'])

  return bareDir
}

const STANDARD_CI_POLICY = {
  id: 'standard-ci',
  applies: { hasFile: 'package.json' },
  apply: [
    { action: 'file.write', path: '.github/workflows/ci.yml', template: 'repo: {{repo}}\n' },
  ],
}


describe('git_repo (local bare repos, SPEC §18)', () => {
  test('ensureMirror, resolveDefaultBranch and addWorktree work against a real local repo', async () => {
    const bareDir = makeBareRepo()
    const workspace = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-test-workspace-'))

    const mirror = Path.join(workspace, 'mirror')
    await GitRepo.ensureMirror(mirror, bareDir, '')
    expect(Fs.existsSync(mirror)).to.be.true()

    const branch = await GitRepo.resolveDefaultBranch(bareDir, '')
    expect(branch).to.equal('main')

    const worktreeDir = Path.join(workspace, 'work')
    await GitRepo.addWorktree(mirror, branch, worktreeDir)
    expect(Fs.existsSync(Path.join(worktreeDir, 'package.json'))).to.be.true()

    // A second ensureMirror call takes the fetch (not clone) path - same
    // function, no error, proves the refresh path works too.
    await GitRepo.ensureMirror(mirror, bareDir, '')
  })


  test('runApply writes the rendered template, statusPorcelain and diffFor detect it', async () => {
    const bareDir = makeBareRepo()
    const workspace = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-test-workspace-'))
    const mirror = Path.join(workspace, 'mirror')
    await GitRepo.ensureMirror(mirror, bareDir, '')
    const branch = await GitRepo.resolveDefaultBranch(bareDir, '')
    const worktreeDir = Path.join(workspace, 'work')
    await GitRepo.addWorktree(mirror, branch, worktreeDir)

    expect(appliesLocally(worktreeDir, STANDARD_CI_POLICY)).to.be.true()
    runApply(worktreeDir, 'owner/repo', STANDARD_CI_POLICY)

    const files = await GitRepo.statusPorcelain(worktreeDir)
    expect(files).to.have.length(1)
    expect(files[0].path).to.equal('.github/workflows/ci.yml')
    expect(files[0].status).to.equal('??')

    const diff = await GitRepo.diffFor(worktreeDir)
    expect(diff).to.include('repo: owner/repo')
    expect(diff).to.include('new file mode')
  })


  test('appliesLocally skips a repo with no package.json', async () => {
    const bareDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-test-bare-'))
    execFileSync('git', ['init', '--bare', '-b', 'main', bareDir])
    const workDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-test-work-'))
    execFileSync('git', ['init', '-b', 'main', workDir])
    execFileSync('git', ['-C', workDir, 'config', 'user.email', 'test@example.com'])
    execFileSync('git', ['-C', workDir, 'config', 'user.name', 'test'])
    Fs.writeFileSync(Path.join(workDir, 'README.md'), 'no package.json here\n')
    execFileSync('git', ['-C', workDir, 'add', '.'])
    execFileSync('git', ['-C', workDir, 'commit', '-m', 'initial'])
    execFileSync('git', ['-C', workDir, 'push', bareDir, 'main'])

    const workspace = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-test-workspace-'))
    const mirror = Path.join(workspace, 'mirror')
    await GitRepo.ensureMirror(mirror, bareDir, '')
    const branch = await GitRepo.resolveDefaultBranch(bareDir, '')
    const worktreeDir = Path.join(workspace, 'work')
    await GitRepo.addWorktree(mirror, branch, worktreeDir)

    expect(appliesLocally(worktreeDir, STANDARD_CI_POLICY)).to.be.false()
  })


  test('renderTemplate is a literal substring replace, not a regex scan', () => {
    const { renderTemplate } = require('../../dist/srv/inbox/apply_action.js')
    // Must survive GitHub Actions' own ${{ }} syntax untouched.
    const out = renderTemplate('{{repo}} uses ${{ matrix.node-version }}', { repo: 'a/b' })
    expect(out).to.equal('a/b uses ${{ matrix.node-version }}')
  })


  test('cloneUrlFor builds a GitHub URL and rejects forges with no real git history', () => {
    expect(GitRepo.cloneUrlFor('github', 'owner/repo')).to.equal('https://github.com/owner/repo.git')
    expect(() => GitRepo.cloneUrlFor('mem', 'owner/repo')).to.throw()
    expect(() => GitRepo.cloneUrlFor('gitlab', 'owner/repo')).to.throw()
  })
})
