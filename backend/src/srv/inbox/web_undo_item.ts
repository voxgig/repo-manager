module.exports = function make_web_undo_item() {
  return async function web_undo_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', undo: 'item', id: msg.id, kind: msg.kind })
    return res.ok ? { ok: true, item: res.item } : { ok: false, why: res.why }
  }
}
