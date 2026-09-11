module.exports = function make_web_label_item() {
  return async function web_label_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', label: 'item', id: msg.id, labels: msg.labels })
    return res.ok ? { ok: true, item: res.item } : { ok: false, why: res.why }
  }
}
