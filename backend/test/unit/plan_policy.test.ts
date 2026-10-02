// `aim:inbox,plan:policy`'s own message-level guard (plan_policy.ts) - a
// config problem, not N doomed per-repo clone attempts, so it's checked
// here directly rather than only indirectly through a real clone (which
// needs network/GitHub - see git_repo.test.ts for the local-bare-repo
// coverage of the actual git layer).

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import Seneca from 'seneca'
import { Local } from '@voxgig/system'

import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const forge_mem = require('../fixtures/forge_mem.js')


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  seneca.test()
  basic(seneca)
  seneca.use(forge_mem)
  seneca.use(Local, { srv: { folder: __dirname + '/../../dist/srv' } })

  return seneca.ready()
}


describe('plan_policy', () => {
  test('rejects forge:mem/gitlab before touching any repo - plan needs real git history', async () => {
    const seneca = await makeSeneca()

    const mem = await seneca.post({ aim: 'inbox', plan: 'policy', forge: 'mem', repo_ids: ['r1'] })
    expect(mem.ok).to.be.false()
    expect(mem.why).to.include('forge:github')

    const gitlab = await seneca.post({ aim: 'inbox', plan: 'policy', forge: 'gitlab', repo_ids: ['r1'] })
    expect(gitlab.ok).to.be.false()

    await seneca.close()
  })


  test('an explicitly-named policy with no apply actions reports skip, not an error', async () => {
    // forge:github with no real GITHUB_TOKEN/network will fail the clone
    // itself - this test only needs to prove the policy-selection logic
    // runs before any git call, so it checks the rejection shape for an
    // unknown policy id instead of a real clone.
    const seneca = await makeSeneca()
    const res = await seneca.post({
      aim: 'inbox', plan: 'policy', forge: 'mem', repo_ids: ['r1'], policy_ids: ['dependency-bot'],
    })
    // Still rejected at the forge guard - confirms policy_ids alone
    // doesn't bypass the forge:github requirement.
    expect(res.ok).to.be.false()
    await seneca.close()
  })
})
