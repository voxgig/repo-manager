module.exports = function make_web_merge_item() {
  return async function web_merge_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', merge: 'item', id: msg.id, merge_method: msg.merge_method })
    return res.ok ? { ok: true, item: res.item } : { ok: false, why: res.why }
  }
}
