# Service: inbox (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

Answers `aim:inbox` messages, loaded by convention (`@voxgig/system` MakeSrv): each
message maps to the action file named after its last pattern pair.

## Messages

| Message | Action file |
|---|---|
| `aim:inbox,sync:item` | `sync_item.ts` |
| `aim:inbox,list:item` | `list_item.ts` |
| `aim:inbox,dismiss:item` | `dismiss_item.ts` |

## Flow

```mermaid
flowchart LR
  gateway{{gateway}} -->|validated msg| srv[srv inbox]
  srv --> sync_item["aim:inbox,sync:item<br>sync_item.ts"]
  srv --> list_item["aim:inbox,list:item<br>list_item.ts"]
  srv --> dismiss_item["aim:inbox,dismiss:item<br>dismiss_item.ts"]
```

Message params are validated from the model (gubu); see
`../../../model/` and `docs/reference/messages.md` at the project root.
