# repo-manager

Multi-forge repository management: cross-repo work-item inbox and fleet policy engine.

A [Seneca](https://senecajs.org) microservices backend with a model-driven entity layer
(`@voxgig/model` + `@voxgig/system`), scaffolded via `npm create @voxgig/system` and pinned to
the toolchain versions `metsitaba/todo-app` runs (`@voxgig/model` 11.0.0, `@voxgig/system`
1.15.0, `@voxgig/build` 4.16.0).

The project currently starts empty: the structure is in place (model, environments, generation
actions, tests), but there are no entities, services, or messages yet beyond the scaffold's
commented examples. See `docs/inventory.md` for the fleet inventory driving what gets built
first.

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
      srv/                  services (empty - see the commented example)
    test/unit/  unit tests
```

## Build, test, run

```bash
cd backend
npm install
npm run build    # voxgig-model (compile model + generate) + tsc
npm test         # unit tests, in-memory store, no external services
npm run local    # boot the backend locally
```
