// SPEC §14.1: a policy declares what compliance means (check) and how to
// reach it (apply) - apply/the bulk-write pipeline is Stage 3 (§19.6);
// this is check-only. Seeded like rpm/reply's saved replies - one real,
// spec-worked example (standard-ci), not a management UI yet.
//
// Two action kinds only: file.exists, file.matches. json.equals/yaml.merge/
// text.replace/exec/repo.settings from §14.1's full vocabulary aren't
// modeled - each needs its own executor and, for the API-backed ones, its
// own forge action; file.exists/file.matches cover the worked example
// (SPEC §14.1's own standard-ci policy) using the one read primitive we
// have (aim:forge,get:file).
//
// `applies` (SPEC §14.1's own example) is modeled for `hasFile` only, using
// that same get:file primitive - `languages` isn't modeled: no forge action
// reports a repo's language breakdown, and faking that isn't worth it for
// one seeded policy.

const SEED_POLICIES = [
  {
    id: 'standard-ci',
    description: 'Every repo runs the standard CI workflow on the supported node matrix',
    applies: { hasFile: 'package.json' },
    check: [
      { action: 'file.exists', path: '.github/workflows/ci.yml' },
      { action: 'file.matches', path: '.github/workflows/ci.yml', contains: 'node-version: [22, 24]' },
    ],
  },
]

// One aim:forge,get:file call, wrapped so a real forge exception (network
// error, API failure) becomes an {ok:false} result like any other forge
// failure, instead of an uncaught rejection breaking the whole matrix/sync.
async function readFile(seneca: any, forge: string, repo_id: string, path: string) {
  try {
    return await seneca.post({ aim: 'forge', get: 'file', forge, repo_id, path })
  }
  catch (err: any) {
    return { ok: false, why: err.message || 'forge call failed' }
  }
}

async function runCheck(seneca: any, forge: string, repo_id: string, check: any) {
  const res = await readFile(seneca, forge, repo_id, check.path)
  if (!res.ok) {
    return { status: 'error', why: res.why || 'forge call failed' }
  }
  if ('file.exists' === check.action) {
    return res.exists ? { status: 'pass' } : { status: 'fail', why: `${check.path} not found` }
  }
  if ('file.matches' === check.action) {
    const matches = !!res.exists && res.content.includes(check.contains)
    return matches
      ? { status: 'pass' }
      : { status: 'fail', why: res.exists ? `${check.path} does not contain "${check.contains}"` : `${check.path} not found` }
  }
  return { status: 'error', why: `unknown check action: ${check.action}` }
}

// SPEC §14.3's four cell states: not-applicable (the `applies` gate
// excludes this repo), error (a forge call itself failed - can't tell
// compliant from drifted), drifted (a check ran and failed), compliant
// (every check passed). Stops at the first failure/error rather than
// collecting every one - the matrix cell is one of these four, not a list
// of what's wrong; the drift item's own title carries the specific reason.
async function runPolicy(seneca: any, forge: string, repo_id: string, policy: any) {
  if (policy.applies && policy.applies.hasFile) {
    const res = await readFile(seneca, forge, repo_id, policy.applies.hasFile)
    if (!res.ok) {
      return { status: 'error', why: res.why || 'forge call failed' }
    }
    if (!res.exists) {
      return { status: 'not-applicable', why: `no ${policy.applies.hasFile}` }
    }
  }

  for (const check of policy.check) {
    const result = await runCheck(seneca, forge, repo_id, check)
    if ('error' === result.status) {
      return { status: 'error', why: result.why }
    }
    if ('fail' === result.status) {
      return { status: 'drifted', why: result.why }
    }
  }
  return { status: 'compliant' }
}

module.exports = { SEED_POLICIES, runPolicy }
