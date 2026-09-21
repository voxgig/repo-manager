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

const SEED_POLICIES = [
  {
    id: 'standard-ci',
    description: 'Every repo runs the standard CI workflow on the supported node matrix',
    check: [
      { action: 'file.exists', path: '.github/workflows/ci.yml' },
      { action: 'file.matches', path: '.github/workflows/ci.yml', contains: 'node-version: [22, 24]' },
    ],
  },
]

async function runCheck(seneca: any, forge: string, repo_id: string, check: any) {
  const res = await seneca.post({ aim: 'forge', get: 'file', forge, repo_id, path: check.path })
  if (!res.ok) {
    return { ok: false, why: 'forge-failed' }
  }
  if ('file.exists' === check.action) {
    return { ok: res.exists, why: res.exists ? undefined : `${check.path} not found` }
  }
  if ('file.matches' === check.action) {
    const matches = !!res.exists && res.content.includes(check.contains)
    return { ok: matches, why: matches ? undefined : `${check.path} does not contain "${check.contains}"` }
  }
  return { ok: false, why: `unknown check action: ${check.action}` }
}

// Runs every check in a policy against one repo - compliant only if all
// pass. Stops at the first failure's reason rather than collecting every
// one: SPEC §14.3's matrix cell is compliant/drifted/error, not a list of
// what's wrong - the drift item's own title carries the specific reason.
async function runPolicy(seneca: any, forge: string, repo_id: string, policy: any) {
  for (const check of policy.check) {
    const result = await runCheck(seneca, forge, repo_id, check)
    if (!result.ok) {
      return { compliant: false, why: result.why }
    }
  }
  return { compliant: true }
}

module.exports = { SEED_POLICIES, runPolicy }
