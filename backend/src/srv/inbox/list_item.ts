module.exports = function make_list_item() {
  return async function list_item(this: any, msg: any) {
    const seneca = this
    const items = await seneca.entity('rpm/item').list$({ state: msg.state || 'open' })
    return { ok: true, items }
  }
}
