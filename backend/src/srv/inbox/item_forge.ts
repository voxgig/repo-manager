// Shared by every item-intent action (approve/merge/comment/label/close):
// load the WorkItem and derive the repo_id/pr_id/forge triple every
// aim:forge,*,forge:<source> message needs. Not itself a message - no
// pattern in msg.aon points at this file, so MakeSrv never loads it.

module.exports = async function loadItemForge(seneca: any, id: string) {
  const item = await seneca.entity('rpm/item').load$(id)
  if (!item) return null
  return { item, repo_id: item.repo, pr_id: item.subject_id, forge: item.source }
}
