// SPEC §14.1: a policy declares what compliance means (check) and how to
// reach it (apply) - apply/the bulk-write pipeline is Stage 3 (§19.6);
// this is check-only. Seeded like rpm/reply's saved replies - three real,
// spec-grounded examples, not a management UI yet: standard-ci is §14.1's
// own worked example; dependency-bot and pinned-actions come from
// docs/inventory.md's Stage 0 fleet audit (the "Definition of Done"
// tabnas/status already checks by hand, and the "no dependency automation"
// finding called out as the fleet's highest-value gap).
//
// One action kind, two modes: file.exists, and file.matches with either
// `contains` (a substring must be present) or `regex` + `mode:'notMatches'`
// (a pattern must NOT be present - pinned-actions' only real option, since
// "every `uses:` line is pinned" isn't expressible as "contains this one
// substring"). json.equals/yaml.merge/text.replace/exec/repo.settings from
// §14.1's full vocabulary aren't modeled - each needs its own executor
// and, for the API-backed ones, its own forge action.
//
// `applies` (SPEC §14.1's own example) is modeled for `hasFile` only, using
// the same get:file primitive - `languages` isn't modeled: no forge action
// reports a repo's language breakdown, and faking that isn't worth it for
// three seeded policies.

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
  {
    id: 'dependency-bot',
    description: 'Every repo has automated dependency updates enabled',
    check: [
      { action: 'file.exists', path: 'renovate.json' },
    ],
  },
  {
    id: 'pinned-actions',
    description: 'Every GitHub Actions workflow pins actions to a full commit SHA, not a mutable tag',
    // Gated on the workflow existing at all - a repo with no CI workflow
    // has nothing for this policy to check (that gap is standard-ci's
    // concern), so it reads not-applicable here rather than drifted.
    applies: { hasFile: '.github/workflows/ci.yml' },
    check: [
      {
        action: 'file.matches', path: '.github/workflows/ci.yml', mode: 'notMatches',
        // A `uses:` ref whose tag isn't a full 40-char commit SHA - good
        // enough to catch the common case (@v4, @main), not a bulletproof
        // YAML-aware parse.
        regex: 'uses:\\s*[^\\s@]+@(?![0-9a-f]{40}\\b)\\S+',
        describe: 'has an action pinned to a tag/branch instead of a full commit SHA',
      },
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
    if (!res.exists) {
      return { status: 'fail', why: `${check.path} not found` }
    }
    const found = check.regex ? new RegExp(check.regex).test(res.content) : res.content.includes(check.contains)
    const pass = 'notMatches' === check.mode ? !found : found
    if (pass) {
      return { status: 'pass' }
    }
    return { status: 'fail', why: `${check.path} ${check.describe || `does not contain "${check.contains}"`}` }
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
