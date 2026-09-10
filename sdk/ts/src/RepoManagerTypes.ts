// Typed models for the RepoManager SDK.
//
// GENERATED from the API model: main.kit.entity.<e>.fields[] and per-op
// params (op.<name>.points[].args.params[]). Field/param types come from the
// canonical type sentinels via @voxgig/sdkgen canonToType (source of truth:
// @voxgig/apidef VALID_CANON). Do not edit by hand.

export interface Inbox {
  actor?: string
  digest?: string
  first_seen?: number
  id?: string
  kind?: string
  org_id?: string
  priority?: string
  repo?: string
  source?: string
  state?: string
  subject_id?: string
  title?: string
  updated_at?: number
  url?: string
}

export interface InboxListMatch {
  actor?: string
  digest?: string
  first_seen?: number
  id?: string
  kind?: string
  org_id?: string
  priority?: string
  repo?: string
  source?: string
  state?: string
  subject_id?: string
  title?: string
  updated_at?: number
  url?: string
}

