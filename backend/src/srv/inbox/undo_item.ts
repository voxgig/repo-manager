// SPEC §13.3: "Undo (u) covers the optimistic window and, where the forge
// allows, beyond it: dismissing a review is reversible, a merge is not."
// Only the two pure-local-state transitions are reversible here - dismiss
// (state -> done, no forge call) and snooze (state -> snoozed, no forge
// call). Everything else either changed real forge state with no prior
// state captured to restore (label) or has no undo primitive modeled at
// all (comment/close/approve/merge) - msg.kind narrows to exactly which
// transition the caller is undoing, so this never guesses from item.state
// alone (close and merge also land on 'done', but aren't reversible).

module.exports = function make_undo_item() {
  return async function undo_item(this: any, msg: any) {
    const seneca = this
    const item = await seneca.entity('rpm/item').load$(msg.id)
    if (!item) {
      return { ok: false, why: 'not-found' }
    }

    // last_action, not just state, is what makes this safe - close and
    // merge also land on state:'done', so a state-only check would let a
    // stray/replayed undo:dismiss resurrect an irreversible merge.
    if ('dismiss' === msg.kind && 'done' === item.state && 'dismiss' === item.last_action) {
      item.state = 'open'
    }
    else if ('snooze' === msg.kind && 'snoozed' === item.state && 'snooze' === item.last_action) {
      item.state = 'open'
      item.snooze_until = undefined
    }
    else {
      return { ok: false, why: 'nothing-to-undo' }
    }

    await item.save$()
    return { ok: true, item }
  }
}
