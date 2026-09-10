module.exports = function make_web_list_item() {
  return async function web_list_item(this: any, msg: any) {
    const res = await this.post({ aim: 'inbox', list: 'item', state: msg.state })
    return res.ok ? { ok: true, items: res.items } : { ok: false }
  }
}
