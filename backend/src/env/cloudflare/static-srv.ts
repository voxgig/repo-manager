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

function makeStaticReload(handlerMap: HandlerMap) {
  return function staticReload(actpath: string, ...args: any[]): any {
    const make = handlerMap[actpath]
    if (!make) {
      throw new Error(`no static Cloudflare handler registered for ${actpath}`)
    }
    return make(...args)
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
