
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import Seneca from 'seneca'

const forge_github = require('../../dist/forge/forge_github.js')


// Hits the real GitHub API, so it only runs with a token available - skip
// clean rather than fail a machine that's never set one.
const token = process.env.GITHUB_TOKEN
const live = test.skip.bind(test)


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 20 * 1000, debug: { undead: true } })
  seneca.test()
  seneca.use(forge_github, {
    provider: { sdk: { headers: { Authorization: 'Bearer ' + token } } },
  })

  return seneca.ready()
}


describe('forge-github', () => {

  (token ? test : live)('list-pr-for-real-repo', async () => {
    const seneca = await makeSeneca()

    const res = await seneca.post('aim:forge,list:pr,forge:github', { repo_id: 'voxgig-sdk/github-sdk' })

    expect(res.ok).true()
    expect(Array.isArray(res.prs)).true()

    // Whether anything is currently open is out of this test's control -
    // just check the shape matches forge:mem's contract when there is one.
    if (0 < res.prs.length) {
      expect(res.prs[0].repo_id).equal('voxgig-sdk/github-sdk')
      expect('string').equal(typeof res.prs[0].id)
      expect('string').equal(typeof res.prs[0].title)
      expect('string').equal(typeof res.prs[0].state)
    }

    await seneca.close()
  })

})
