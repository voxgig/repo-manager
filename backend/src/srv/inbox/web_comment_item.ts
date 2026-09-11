module.exports = function make_web_comment_item() {
  return async function web_comment_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', comment: 'item', id: msg.id, body: msg.body })
    return res.ok ? { ok: true, item: res.item, comment: res.comment } : { ok: false, why: res.why }
  }
}
