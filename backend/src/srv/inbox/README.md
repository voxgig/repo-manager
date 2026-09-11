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
| `aim:inbox,list:pr` | `list_pr.ts` |
| `aim:inbox,approve:item` | `approve_item.ts` |
| `aim:inbox,merge:item` | `merge_item.ts` |
| `aim:inbox,comment:item` | `comment_item.ts` |
| `aim:inbox,label:item` | `label_item.ts` |
| `aim:inbox,close:item` | `close_item.ts` |
| `aim:inbox,snooze:item` | `snooze_item.ts` |
| `aim:web,on:inbox,sync:item` | `web_sync_item.ts` |
| `aim:web,on:inbox,list:item` | `web_list_item.ts` |
| `aim:web,on:inbox,dismiss:item` | `web_dismiss_item.ts` |
| `aim:web,on:inbox,approve:item` | `web_approve_item.ts` |
| `aim:web,on:inbox,merge:item` | `web_merge_item.ts` |
| `aim:web,on:inbox,comment:item` | `web_comment_item.ts` |
| `aim:web,on:inbox,label:item` | `web_label_item.ts` |
| `aim:web,on:inbox,close:item` | `web_close_item.ts` |
| `aim:web,on:inbox,snooze:item` | `web_snooze_item.ts` |
| `aim:web,on:inbox,list:pr` | `web_list_pull.ts` |

## Flow

```mermaid
flowchart LR
  gateway{{gateway}} -->|validated msg| srv[srv inbox]
  srv --> sync_item["aim:inbox,sync:item<br>sync_item.ts"]
  srv --> list_item["aim:inbox,list:item<br>list_item.ts"]
  srv --> dismiss_item["aim:inbox,dismiss:item<br>dismiss_item.ts"]
  srv --> list_pr["aim:inbox,list:pr<br>list_pr.ts"]
  srv --> approve_item["aim:inbox,approve:item<br>approve_item.ts"]
  srv --> merge_item["aim:inbox,merge:item<br>merge_item.ts"]
  srv --> comment_item["aim:inbox,comment:item<br>comment_item.ts"]
  srv --> label_item["aim:inbox,label:item<br>label_item.ts"]
  srv --> close_item["aim:inbox,close:item<br>close_item.ts"]
  srv --> snooze_item["aim:inbox,snooze:item<br>snooze_item.ts"]
  srv --> web_sync_item["aim:web,on:inbox,sync:item<br>web_sync_item.ts"]
  srv --> web_list_item["aim:web,on:inbox,list:item<br>web_list_item.ts"]
  srv --> web_dismiss_item["aim:web,on:inbox,dismiss:item<br>web_dismiss_item.ts"]
  srv --> web_approve_item["aim:web,on:inbox,approve:item<br>web_approve_item.ts"]
  srv --> web_merge_item["aim:web,on:inbox,merge:item<br>web_merge_item.ts"]
  srv --> web_comment_item["aim:web,on:inbox,comment:item<br>web_comment_item.ts"]
  srv --> web_label_item["aim:web,on:inbox,label:item<br>web_label_item.ts"]
  srv --> web_close_item["aim:web,on:inbox,close:item<br>web_close_item.ts"]
  srv --> web_snooze_item["aim:web,on:inbox,snooze:item<br>web_snooze_item.ts"]
  srv --> web_list_pull["aim:web,on:inbox,list:pr<br>web_list_pull.ts"]
```

Message params are validated from the model (gubu); see
`../../../model/` and `docs/reference/messages.md` at the project root.
