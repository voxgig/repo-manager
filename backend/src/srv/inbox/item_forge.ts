// Shared by every item-intent action (approve/merge/comment/label/close):
// load the WorkItem and derive the repo_id/pr_id/forge triple every
// aim:forge,*,forge:<source> message needs. Not itself a message - no
// pattern in msg.aon points at this file, so MakeSrv never loads it.

async function loadItemForge(seneca: any, id: string) {
  const item = await seneca.entity('rpm/item').load$(id)
  if (!item) return null
  return { item, repo_id: item.repo, pr_id: item.subject_id, forge: item.source }
}

// SPEC §12: first_response_at is set by the first response the outside
// party can see - a reply, review, close, or merge. Labels and priority
// changes don't count (drives the aging view, §12.4). First response
// wins; never overwritten by a later one.
function markResponded(item: any) {
  item.first_response_at = item.first_response_at || Date.now()
}

module.exports = { loadItemForge, markResponded }
