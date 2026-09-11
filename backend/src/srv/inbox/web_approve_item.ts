module.exports = function make_web_approve_item() {
  return async function web_approve_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', approve: 'item', id: msg.id, body: msg.body })
    return res.ok ? { ok: true, item: res.item } : { ok: false, why: res.why }
  }
}
