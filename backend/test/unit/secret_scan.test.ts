// SPEC S8's detector, tested directly - same style as git_repo.test.ts's
// direct renderTemplate/appliesLocally tests. apply_policy.ts's own wiring
// (scan before commit, a hit fails that repo without committing) is proven
// by the S8 case in apply_policy.test.ts instead - this file is just the
// pattern-matching logic.

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'
import Fs from 'node:fs'
import Os from 'node:os'
import Path from 'node:path'

const { scanForSecrets } = require('../../dist/srv/inbox/secret_scan.js')

function writeFile(dir: string, relPath: string, content: string) {
  const full = Path.join(dir, relPath)
  Fs.mkdirSync(Path.dirname(full), { recursive: true })
  Fs.writeFileSync(full, content)
}

describe('secret_scan', () => {
  test('clean content reports clean', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-secret-scan-'))
    writeFile(dir, 'ci.yml', 'name: CI\non: [push]\n')
    const res = scanForSecrets(dir, ['ci.yml'])
    expect(res.clean).to.be.true()
  })

  test('a GitHub personal access token fails the scan with the offending path', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-secret-scan-'))
    writeFile(dir, 'ci.yml', 'TOKEN: ghp_' + 'a'.repeat(36) + '\n')
    const res = scanForSecrets(dir, ['ci.yml'])
    expect(res.clean).to.be.false()
    expect((res as any).path).to.equal('ci.yml')
  })

  test('an AWS access key id fails the scan', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-secret-scan-'))
    writeFile(dir, '.env.example', 'AWS_KEY=AKIA' + 'A'.repeat(16) + '\n')
    const res = scanForSecrets(dir, ['.env.example'])
    expect(res.clean).to.be.false()
  })

  test('a private key header fails the scan', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-secret-scan-'))
    writeFile(dir, 'key.pem', '-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n')
    const res = scanForSecrets(dir, ['key.pem'])
    expect(res.clean).to.be.false()
  })

  test('only scans the given changed paths, not the whole worktree', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rm-secret-scan-'))
    writeFile(dir, 'unrelated.txt', 'ghp_' + 'a'.repeat(36))
    writeFile(dir, 'ci.yml', 'name: CI\n')
    const res = scanForSecrets(dir, ['ci.yml'])
    expect(res.clean).to.be.true()
  })
})
