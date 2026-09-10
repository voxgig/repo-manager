# Reference: system map (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

*Diátaxis: reference — the system structure and its dependencies,
derived from the model.*

## Architecture

```mermaid
flowchart TB
  subgraph spa[Web SPA]
    shell[cmp/shell]
    admin[cmp/admin]
    publiccmp[cmp/public + cmp/auth]
    settings[cmp/settings]
    bus[(Seneca bus)]
    shell --> bus
    admin --> bus
    publiccmp --> bus
    settings --> bus
  end
  bus -->|aim:* over browser transport| gateway{{gateway}}
  subgraph services[Services]
    srv_inbox[inbox]
  end
  gateway --> srv_inbox
  subgraph data[Entities]
    subgraph zone_rpm[zone rpm]
      rpm_item[item]
    end
    subgraph zone_sys[zone sys]
      sys_login[login]
      sys_user[user]
    end
  end
  srv_inbox --> data
```

## Target environments

```mermaid
flowchart LR
  model[(model.json)]
  model --> env_local[env local]
  model --> env_web[env web]
```

Active environments: `local`, `web`.

See also: [entities](entities.md) · [messages](messages.md).
