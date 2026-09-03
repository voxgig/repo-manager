# Fleet inventory

Stage 0 deliverable per SPEC.REPO-MANAGER.md §4.1 / §19.3. Read-only survey of the four fleet
orgs via the GitHub API on 2026-09-02 — no repository, file, or setting was changed to produce
this document. Full repo/language listings are cached locally under `/tmp/<org>-repos.json` for
reference; not committed (regenerable, and `voxgig-sdk`'s alone is ~700 rows).

## Orgs

| Org | Repo count | Archived | Dominant language | Notes |
|---|---|---|---|---|
| `senecajs` | 250 | 2 | JavaScript (125), TypeScript (90) | The Seneca framework + plugin ecosystem. No org-default `.github` repo. |
| `tabnas` | 38 | 0 | Go (25), TypeScript/JS (11) | Parser/format fleet. The most *governed* org already — see below. |
| `voxgig` | 39 | 0 | Mixed: TS (11), JS (10), Vue (3), Go (2), C (3), C#, Zig | Core tooling (`model`, `sdkgen`, `station`, `sekreto`, `struct`). Fewer repos, highest blast radius. |
| `voxgig-sdk` | 688 | 0 | TypeScript (682) | Generated SDK repos (`bluefin-*` client work + a long tail of public SDKs). The scale case. |

`senecajs` at 250 repos is larger than the spec's own partial listing suggested (§4 notes that
listing "paginated before filtering" and returned an inconclusive empty page) — confirmed here
with an explicit `--limit 1000`.

## Existing automation found

| Name | What it does | Orgs covered | Still running? | Classification (§4.1) | Notes / target stage |
|---|---|---|---|---|---|
| `tabnas/status` | Generated compliance dashboard (GitHub Pages). Sweeps every public org repo and checks it against the org's own "Definition of Done": CI status, shared-CI adoption, Renovate presence, Release Please presence, npm↔Go release drift, SHA-pinned actions, branch protection, docs. Publishes a shields.io badge per repo. | `tabnas` | Yes, active (pushed 2026-08-28) | **Work-item source**, and its individual checks map almost one-to-one onto **policy `check`s** | This is the single biggest find — `tabnas` already runs an informal version of repo-manager's own drift matrix (§14.3) by hand. Its checklist is close to a ready-made first policy set. Retire once repo-manager's own drift view + inbox surface the same signals live (Stage 2–3). |
| `tabnas/.github` `GOVERNANCE.md` | Defines repo tiers (`core` / `supported` / `experimental`) with different policy strictness per tier, and states the org's "Definition of Done" that `tabnas/status` checks against. | `tabnas` | Yes | Not itself replaced — it's the **source of truth to write the first `rpm/policy` definitions from** | Read before writing any tabnas policy. |
| `tabnas/.github` reusable workflows: `polyglot-ci.yml`, `scorecard.yml` | Each caller repo has a thin `.github/workflows/*.yml` that just delegates to these via `workflow_call`, so behavior stays centralized. `scorecard.yml` runs OpenSSF Scorecard (branch protection, pinned actions, `SECURITY.md`, etc.) and publishes a public score. | `tabnas` | Yes | **Policy-managed file** — this is exactly the `file.write` policy-action shape from SPEC §14.1's own worked example | Stage 3, once bulk-apply can push/maintain the same caller file directly. |
| `tabnas/.github` `notify-status.yml` | Reusable workflow each repo calls to ping `tabnas/status` and trigger a dashboard rebuild whenever that repo's PR/issue counts change. | `tabnas` | Yes | **Retire** once repo-manager's own sync exists | Repo-manager keeps its inbox current itself (§9: "sync, not proxy") — this whole ping-to-rebuild mechanism becomes unnecessary. |
| `tabnas/.github` `renovate-config.json` (org-wide Renovate policy) | Shared Renovate config every repo extends: grouped internal-package bumps, GitHub Actions digest-pinning, coordinated Node/Go major-version bumps only, weekly schedule. | `tabnas` | Yes | **Not replaced** — Renovate itself is explicitly out of scope (§6: "consume Renovate, don't replace it") | Its PRs become `dep.update` work items (§12) in the inbox as-is. |
| `tabnas/.github` `clib-release.yml`, `clib-darwin-attach.yml` | Release automation for native-library artifacts (portable + darwin lanes, manifest patching). | `tabnas` | Yes | **Out of scope** | §6 explicitly excludes release management (versioning/publishing) from this project. Left alone. |
| `tabnas/measure`, `tabnas/skills`, `tabnas/mcp` | Parser-fleet benchmark suite, AI-agent skill docs, and an MCP server/CLI for the tabnas *parser* ecosystem itself. | `tabnas` | Yes | **Out of scope** | These are products of the tabnas domain (parsers), not fleet-management point solutions — despite being named as "candidates" in the spec, none of the three actually does repo-fleet governance. |
| `senecajs` `todo.yml` (`senecajs/todo-to-issue-action`) | A workflow copied into most `senecajs` repos that converts `TODO:` code comments into GitHub issues on every push. Uses an unpinned `@master` action ref. | `senecajs` (widespread; absent from at least one core repo, `seneca` itself, alongside CI) | Yes | **Policy-managed file** (§4.1's own example: "a per-repo workflow copied into every repo") | Could become both a managed file *and* a policy check ("is TODO-to-issue present and SHA-pinned"). Target Stage 3. |
| CI workflow naming | `voxgig` repos use at least three different CI/release workflow shapes sampled (`build.yml`+`publish.yml`; `build.yml`+`release.yml`; `ci.yml`+`real-stores.yml`+`release.yml`; `build.yml`+`lint.yml`+`publish.yml`+`security.yml`) — no shared convention like tabnas's reusable workflows. | `voxgig` | — | **Gap, not a point solution** | No automation manages this consistency today; it's raw drift. First real candidate for a `voxgig`-specific policy, given the org's high blast radius (§4). |
| Generated CI drift | `voxgig-sdk` sample shows version skew directly from the generator: some repos have only `ci.yml`, at least one has `ci.yml` + `publish-go.yml` + `publish-ts.yml` (a newer sdkgen output shape). | `voxgig-sdk` | — | **Gap, not a point solution** | No mechanism today re-syncs already-generated repos to a newer generator template. This is the flagship case Stage 3's own "done when" line names directly (a policy run across a `voxgig-sdk` slice). |
| No dependency/security automation detected | No `renovate.json` / `.github/dependabot.yml` found in sampled `voxgig-sdk` or `senecajs` repos; vulnerability-alert and org Dependabot-alert API endpoints returned 404 (not enabled, on the repos/org checked). | `voxgig-sdk`, `senecajs` | N/A — nothing running | **Gap, not a point solution to retire — a missing work-item source** | This is exactly what G4 (respond to inbound traffic at scale, §12.3–§12.4) exists for. On 688 largely-unmonitored generated repos, this is arguably the highest-value gap in the whole fleet. |

## Summary against Stage 0's "done when" bar

SPEC.REPO-MANAGER.md §19.3 requires the inventory to cover all four orgs and name at least three
point solutions the project will replace. This inventory names five items repo-manager directly
absorbs or retires — `tabnas/status`, the `polyglot-ci.yml`/`scorecard.yml` managed-file
pattern, `notify-status.yml`, and `senecajs`'s `todo.yml` — plus, deliberately kept separate,
three real gaps (`voxgig`'s CI inconsistency, `voxgig-sdk`'s generator-version drift, and the
missing dependency/security monitoring on `voxgig-sdk`/`senecajs`) that aren't existing point
solutions to retire, but are the actual first-value cases the tool needs to prove itself against.
