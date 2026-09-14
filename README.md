# repo-manager

Multi-forge repository management: cross-repo work-item inbox and fleet policy engine.

A [Seneca](https://senecajs.org) microservices backend with a model-driven entity layer
(`@voxgig/model` + `@voxgig/system`), scaffolded via `npm create @voxgig/system` and pinned to
the toolchain versions `metsitaba/todo-app` runs (`@voxgig/model` 11.0.0, `@voxgig/system`
1.15.0, `@voxgig/build` 4.16.0).

Stage 1 (the walking skeleton) is done: a `rpm/item` work-item entity, a `srv/inbox` service
(sync/list/dismiss, full derive/auto-resolve), a real `forge:github` plugin alongside the
`forge:mem` test double, a vanilla-web-components `frontend/` driven end-to-end in a browser, and
a generated `sdk/` (TypeScript/Go/Go-MCP) client for the bespoke inbox API. Stage 2 ("the primary
loop") is underway: every `aim:forge,*` action (`open:pr`, `merge:pr`, `comment:issue`,
`label:issue`, `assign:issue`, `close:issue`, `approve:pr`, `request:review`) is now real against
GitHub, routed through `@seneca/github-provider`'s entity-store rather than fixture-backed.
See `docs/inventory.md` for the fleet inventory driving what gets built first.

## Documentation

- **Inventory**: [Fleet inventory](docs/inventory.md) — Stage 0 survey of the managed orgs

Real [Diátaxis](https://diataxis.fr)-organised docs (tutorial, how-to, reference, explanation)
are Stage 5 work, written once there's an actual model and services to document rather than the
scaffold's generic placeholders.

Working here with an AI agent? See [AGENTS.md](AGENTS.md).

## Layout

```
repo-manager/
  docs/         project documentation (Diátaxis) + the fleet inventory
  backend/
    model/      voxgig-model sources (.aon) -> compiled model.json
    build/      model-build generation actions (deployment templates)
    src/
      env/shared/basic.ts   core Seneca setup (entity + user)
      env/local/local.ts    local runner (in-memory store)
      env/lambda/lambda.ts  Lambda bootstrap for generated handlers
      env/cli/              headless inbox CLI
      env/web/              REST + web gateway (bespoke, no generic aim:ent surface)
      forge/                forge:github - real GitHub actions via @seneca/github-provider
      srv/inbox/            sync/list/dismiss the rpm/item work-item entity
    test/unit/  unit tests
  frontend/     vanilla web-components UI (seneca-browser), no framework
  sdk/          sdkgen-generated ts/go/go-mcp client for the inbox API
```

## Build, test, run

```bash
cd backend
npm install
npm run build    # voxgig-model (compile model + generate) + tsc
npm test         # unit tests, in-memory store, no external services
npm run local    # boot the backend locally
```
