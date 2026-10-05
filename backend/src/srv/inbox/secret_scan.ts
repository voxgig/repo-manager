// SPEC S8: rendered content is scanned for known token prefixes before
// commit. Named prefixes only, not a high-entropy heuristic - the spec
// names exact prefixes to catch, and a generic entropy scan risks false
// positives on legitimate-looking hashes/ids in a template; that's a
// follow-up, not this slice.

import Fs from 'node:fs'
import Path from 'node:path'

const PATTERNS = [
  /ghp_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /glpat-[A-Za-z0-9_-]{20}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/,
]

function scanForSecrets(worktreeDir: string, changedPaths: string[]): { clean: true } | { clean: false, why: string, path: string } {
  for (const relPath of changedPaths) {
    const full = Path.join(worktreeDir, relPath)
    if (!Fs.existsSync(full) || !Fs.statSync(full).isFile()) {
      continue
    }
    const content = Fs.readFileSync(full, 'utf8')
    for (const pattern of PATTERNS) {
      if (pattern.test(content)) {
        return { clean: false, why: `matches a known secret pattern (${pattern})`, path: relPath }
      }
    }
  }
  return { clean: true }
}

module.exports = { scanForSecrets }
