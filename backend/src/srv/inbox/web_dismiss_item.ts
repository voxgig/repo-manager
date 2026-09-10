module.exports = function make_web_dismiss_item() {
  return async function web_dismiss_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', dismiss: 'item', id: msg.id })
    return res.ok ? { ok: true, item: res.item } : { ok: false, why: res.why }
  }
}
