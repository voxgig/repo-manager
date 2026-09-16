module.exports = function make_list_item() {
  return async function list_item(this: any, msg: any) {
    const seneca = this
    const items = await seneca.entity('rpm/item').list$({ state: msg.state || 'open' })
    // Grouped members leave the default list while their campaign stands
    // (SPEC §12.1's Grouped state, sync_item.ts's syncCampaigns) - no
    // excluded/pulled-out view to see them from yet (Stage 3).
    return { ok: true, items: items.filter((it: any) => !it.grouped_into) }
  }
}
