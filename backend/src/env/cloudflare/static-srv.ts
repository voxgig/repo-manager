// Cloudflare-only replacement for @voxgig/system's MakeSrv + @seneca/reload's
// file-scanning make(): both dynamically require() a srv's handler files at
// runtime (@seneca/reload's make() does a computed `require(actpath)`),
// which esbuild can't statically bundle for a Workers isolate (no
// filesystem, no dynamic require()). System.messages() itself is NOT the
// problem - it only reads the srv's message list off the compiled model and
// calls whatever `reload(actpath, {options})` function it's given, then
// registers the result via seneca.message(). This supplies a static,
// bundler-friendly `reload` (a plain object lookup against handlers
// imported by literal require() in handler-map.ts) instead, and reuses
// System.messages() unchanged.
//
// Trade-off: handler files are a hand-maintained list (handler-map.ts)
// rather than auto-discovered by folder scan - add a handler file under
// src/srv/inbox/, add a line to that map.

import { System } from '@voxgig/system'

type MakeAction = (...args: any[]) => any
type HandlerMap = Record<string, MakeAction>

// A missing handler stub-replies 'not-supported' instead of throwing -
// throwing here happens during seneca.ready()'s synchronous plugin-init
// pass, which workerd doesn't surface as a rejection the way plain Node
// does; it hangs the whole DO forever instead (confirmed live: every
// message on the srv stopped responding, not just the one with no static
// handler, the same silent-hang class of bug @seneca/user's dynamic
// require hit earlier). A srv file that's deliberately Node-only (e.g.
// plan_policy.ts - real git/fs, never addable to handler-map.ts) is
// expected to be missing here; the static map is a known subset of what
// MakeSrv/@seneca/reload load on Node, not a bug to fail loudly over.
function makeStaticReload(handlerMap: HandlerMap) {
  return function staticReload(actpath: string, ..._args: any[]): any {
    const make = handlerMap[actpath]
    if (!make) {
      return async function notSupported(this: any) {
        return { ok: false, why: `${actpath.replace(/^\.\//, '')} is not available on this platform` }
      }
    }
    return make(..._args)
  }
}

// Mirrors MakeSrv's own shape (same 'srv_' + name convention, same
// this-bound options function) - System.messages derives the srv name
// being loaded from seneca.fixedargs.plugin$.name, set from this
// function's own .name once registered via seneca.use().
function makeStaticSrv(name: string, handlerMap: HandlerMap) {
  const srv = function (this: any, options: any): void {
    const seneca = this
    System.messages(seneca, options, makeStaticReload(handlerMap))
  }
  Object.defineProperty(srv, 'name', { value: 'srv_' + name })
  return srv
}

function loadStaticSrv(seneca: any, name: string, handlerMap: HandlerMap): void {
  seneca.root.use(makeStaticSrv(name, handlerMap), {})
}

export { loadStaticSrv }
export type { HandlerMap, MakeAction }
