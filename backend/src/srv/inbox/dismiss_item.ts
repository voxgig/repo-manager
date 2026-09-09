module.exports = function make_dismiss_item() {
  return async function dismiss_item(this: any, msg: any) {
    const seneca = this
    const item = await seneca.entity('rpm/item').load$(msg.id)
    if (!item) {
      return { ok: false, why: 'not-found' }
    }
    item.state = 'done'
    await item.save$()
    return { ok: true, item }
  }
}
