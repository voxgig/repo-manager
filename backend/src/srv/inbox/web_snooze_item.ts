module.exports = function make_web_snooze_item() {
  return async function web_snooze_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', snooze: 'item', id: msg.id, until: msg.until })
    return res.ok ? { ok: true, item: res.item } : { ok: false, why: res.why }
  }
}
