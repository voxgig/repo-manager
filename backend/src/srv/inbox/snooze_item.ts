// SPEC §12.1 state machine: Open -> Snoozed until `until` (epoch ms, chosen
// by the caller - the UI offers presets). sync_item.ts reopens it once
// `until` passes if the condition is still true, and auto-resolves it
// silently if the condition is gone while snoozed.

module.exports = function make_snooze_item() {
  return async function snooze_item(this: any, msg: any) {
    const seneca = this
    if (!msg.until) {
      return { ok: false, why: 'until-required' }
    }
    const item = await seneca.entity('rpm/item').load$(msg.id)
    if (!item) {
      return { ok: false, why: 'not-found' }
    }
    item.state = 'snoozed'
    item.snooze_until = msg.until
    item.last_action = 'snooze'
    await item.save$()
    return { ok: true, item }
  }
}
