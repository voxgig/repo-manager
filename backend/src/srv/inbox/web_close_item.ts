module.exports = function make_web_close_item() {
  return async function web_close_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', close: 'item', id: msg.id, reason: msg.reason })
    return res.ok ? { ok: true, item: res.item } : { ok: false, why: res.why }
  }
}
