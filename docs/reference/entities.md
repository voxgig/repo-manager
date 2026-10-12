# Reference: entities (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

*Diátaxis: reference — the entity graph, derived from the model.*

## Entity relationship diagram

Relationships come from `ref` fields (the field stores the id of the
target entity).

```mermaid
erDiagram
  rpm_driftcell {
    String id
    String policy_id
    String repo
    String source
    String status
    Number updated_at
    String why
  }
  rpm_issue {
    String actor
    String id
    String repo
    String source
    String subject_id
    String title
    Number updated_at
    String url
  }
  rpm_item {
    String actor
    String digest
    Number first_response_at
    Number first_seen
    String id
    String kind
    String org_id
    Object payload
    String priority
    String repo
    Number snooze_until
    String source
    String state
    String subject_id
    String title
    Number updated_at
    String url
  }
  rpm_pr {
    String actor
    String id
    String repo
    String source
    String subject_id
    String title
    Number updated_at
    String url
  }
  sys_login {
    String id
  }
  sys_user {
    String id
  }
```

(Entity ids are canons with `/` shown as `_`.)

## Entities

| Canon | Fields | Relationships | UI |
|---|---|---|---|
| `rpm/driftcell` | id, policy_id, repo, source, status, updated_at, why | — | generic admin |
| `rpm/issue` | actor, id, repo, source, subject_id, title, updated_at, url | — | generic admin |
| `rpm/item` | actor, digest, first_response_at, first_seen, id, kind, org_id, payload, priority, repo, snooze_until, source, state, subject_id, title, updated_at, url | — | generic admin |
| `rpm/pr` | actor, id, repo, source, subject_id, title, updated_at, url | — | generic admin |
| `sys/login` | id | — | generic admin |
| `sys/user` | id | — | generic admin |
