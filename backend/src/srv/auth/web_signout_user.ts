// Gateway signout: revoke the session server-side, then tell
// gateway-auth (express_cookie) to clear the auth cookie.
module.exports = function make_web_signout_user() {
  return async function web_signout_user(this: any) {
    // this.fixedmeta.custom, not a custom$ message directive - @seneca/
    // gateway builds one delegate per request via root.delegate(fixed,
    // {custom}) (gateway.ts), and fixedmeta is inherited down through
    // every further delegate/action dispatched off it - confirmed live,
    // a custom$ directive on the posted message itself does NOT reach the
    // action's own meta.custom the same way. principal.login carries the
    // token (see gateway-auth's own extendPrincipal calls), not a bare
    // principal.token.
    const principal = this.fixedmeta?.custom?.principal
    const token = principal?.login?.token
    const user_id = principal?.user?.id

    if (token || user_id) {
      // Both are needed: a token alone does not revoke the login row.
      await this.post('aim:auth,signout:user', { user_id, token })
    }

    return { ok: true, gateway$: { auth: { remove: true } } }
  }
}
