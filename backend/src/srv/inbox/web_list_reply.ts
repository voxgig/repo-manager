module.exports = function make_web_list_reply() {
  return async function web_list_reply(this: any) {
    const res = await this.post({ aim: 'inbox', list: 'reply' })
    return res.ok ? { ok: true, replies: res.replies } : { ok: false }
  }
}
