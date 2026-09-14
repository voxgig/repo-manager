// SPEC §12.4: rpm/reply - org-scoped templated responses, organised by
// intent. Seeded with the spec's five named intents on first call, same
// idea as a fresh install shipping sensible defaults - real entities the
// user can edit later, not fabricated data about any actual repo.
//
// {author}/{repo} are resolved client-side from the focused item when a
// reply is applied (see inbox.js) - {contributing_url} from the spec's own
// example isn't included: there's no per-org config source for it yet, and
// a template that silently renders a literal "{contributing_url}" would be
// worse than one that just doesn't offer the placeholder.

const SEED_REPLIES = [
  { intent: 'needs-more-info', title: 'Needs more info',
    body: 'Hi {author}, thanks for filing this - could you share a bit more detail (repro steps, versions) so we can take a look?' },
  { intent: 'duplicate-of', title: 'Duplicate',
    body: 'Thanks {author} - this looks like a duplicate of an existing issue in {repo}. Closing in favor of that one; feel free to add anything relevant there.' },
  { intent: 'out-of-scope', title: 'Out of scope',
    body: 'Thanks for the suggestion {author} - this is outside the scope of {repo}, so we will not be pursuing it here.' },
  { intent: 'thanks-and-merged', title: 'Thanks & merged',
    body: 'Thank you {author}, this is merged!' },
  { intent: 'security-ack', title: 'Security ack',
    body: 'Thanks for the report {author} - we have received this and are looking into it.' },
]

module.exports = function make_list_reply() {
  return async function list_reply(this: any) {
    const seneca = this
    let replies = await seneca.entity('rpm/reply').list$({})

    if (0 === replies.length) {
      for (const seed of SEED_REPLIES) {
        await seneca.entity('rpm/reply').data$(seed).save$()
      }
      replies = await seneca.entity('rpm/reply').list$({})
    }

    return { ok: true, replies: replies.map((r: any) => ({ id: r.id, intent: r.intent, title: r.title, body: r.body })) }
  }
}
