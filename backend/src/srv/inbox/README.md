# Service: inbox (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

Answers `aim:inbox`, `aim:web` messages, loaded by convention (`@voxgig/system` MakeSrv): each
message maps to the action file named after its last pattern pair.

## Messages

| Message | Action file |
|---|---|
| `aim:inbox,sync:item` | `sync_item.ts` |
| `aim:inbox,list:item` | `list_item.ts` |
| `aim:inbox,dismiss:item` | `dismiss_item.ts` |
| `aim:web,on:inbox,sync:item` | `web_sync_item.ts` |
| `aim:web,on:inbox,list:item` | `web_list_item.ts` |
| `aim:web,on:inbox,dismiss:item` | `web_dismiss_item.ts` |

## Flow

```mermaid
flowchart LR
  gateway{{gateway}} -->|validated msg| srv[srv inbox]
  srv --> sync_item["aim:inbox,sync:item<br>sync_item.ts"]
  srv --> list_item["aim:inbox,list:item<br>list_item.ts"]
  srv --> dismiss_item["aim:inbox,dismiss:item<br>dismiss_item.ts"]
  srv --> web_sync_item["aim:web,on:inbox,sync:item<br>web_sync_item.ts"]
  srv --> web_list_item["aim:web,on:inbox,list:item<br>web_list_item.ts"]
  srv --> web_dismiss_item["aim:web,on:inbox,dismiss:item<br>web_dismiss_item.ts"]
```

Message params are validated from the model (gubu); see
`../../../model/` and `docs/reference/messages.md` at the project root.
