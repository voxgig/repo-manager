// Thin client over the Seneca bus.
//
// EVERY message the browser sends is an aim:web message: that is the only
// namespace the backend gateway accepts (see backend/src/env/web/web.ts),
// and each one is a declared proxy that forwards to the real service
// message. Entity CRUD still lands on the ONE generic backend service, so
// the same four calls serve every entity in the model.

import { bus } from './bus.js'

// ---- generic entity CRUD ------------------------------------------------

async function list(ent, q) {
  const r = await bus.post({ aim: 'web', on: 'ent', cmd: 'list', ent, q: q || {} })
  return (r && r.ok && r.list) || []
}

async function load(ent, id) {
  const r = await bus.post({ aim: 'web', on: 'ent', cmd: 'load', ent, id })
  return r && r.ok ? r.item : null
}

async function save(ent, item) {
  return bus.post({ aim: 'web', on: 'ent', cmd: 'save', ent, item })
}

async function remove(ent, id) {
  return bus.post({ aim: 'web', on: 'ent', cmd: 'remove', ent, id })
}

// Users, for reference pickers (read-only, public fields).
async function users() {
  return list('sys/user')
}

// ---- auth / settings ----------------------------------------------------

async function loadAuth() {
  return bus.post('aim:web,on:auth,load:auth')
}

async function signin(email, password) {
  return bus.post('aim:web,on:auth,signin:user', { email, password })
}

async function signout() {
  return bus.post('aim:web,on:auth,signout:user')
}

async function changePass(password) {
  return bus.post({ aim: 'web', on: 'auth', change: 'pass', password })
}

async function updateUser(data) {
  return bus.post({ aim: 'web', on: 'auth', update: 'user', data })
}

async function remindPass(email) {
  return bus.post({ aim: 'web', on: 'auth', remind: 'pass', email })
}

// ---- API access keys (REST API auth; Settings & security) ---------------

async function createApikey(name) {
  return bus.post({ aim: 'web', on: 'auth', create: 'apikey', name })
}

async function listApikeys() {
  return bus.post({ aim: 'web', on: 'auth', list: 'apikey' })
}

async function revokeApikey(id) {
  return bus.post({ aim: 'web', on: 'auth', revoke: 'apikey', id })
}

// ---- inbox (SPEC.REPO-MANAGER.md §12) ------------------------------------

async function listInbox(state) {
  const r = await bus.post({ aim: 'web', on: 'inbox', list: 'item', state })
  return (r && r.ok && r.items) || []
}

async function dismissItem(id) {
  return bus.post({ aim: 'web', on: 'inbox', dismiss: 'item', id })
}

async function syncNow() {
  return bus.post({ aim: 'web', on: 'inbox', sync: 'item' })
}

// Pull requests / Issues nav views: raw fleet browse, not the derived queue.
async function listPulls() {
  const r = await bus.post({ aim: 'web', on: 'inbox', list: 'pr' })
  return (r && r.ok && r.prs) || []
}

async function listIssues() {
  const r = await bus.post({ aim: 'web', on: 'inbox', list: 'issue' })
  return (r && r.ok && r.issues) || []
}

// PR detail view (03-pr-item.png): the single-PR load, carrying body/diff
// stats/mergeability that list:pr's/list:item's rows don't.
async function loadPr(repo_id, pr_id) {
  const r = await bus.post({ aim: 'web', on: 'inbox', load: 'pr', repo_id, pr_id })
  return r && r.ok ? r.pr : null
}

// Item intents (SPEC §13.2) - each translates to a forge call behind the
// gateway; the browser only ever posts the app-nouned aim:web,on:inbox,*.

async function approveItem(id, body) {
  return bus.post({ aim: 'web', on: 'inbox', approve: 'item', id, body })
}

async function mergeItem(id, merge_method) {
  return bus.post({ aim: 'web', on: 'inbox', merge: 'item', id, merge_method })
}

async function commentItem(id, body) {
  return bus.post({ aim: 'web', on: 'inbox', comment: 'item', id, body })
}

async function labelItem(id, labels) {
  return bus.post({ aim: 'web', on: 'inbox', label: 'item', id, labels })
}

async function closeItem(id, reason) {
  return bus.post({ aim: 'web', on: 'inbox', close: 'item', id, reason })
}

async function snoozeItem(id, until) {
  return bus.post({ aim: 'web', on: 'inbox', snooze: 'item', id, until })
}

// Undo (SPEC §13.3) - only ever called with the kind of the action just
// taken (dismiss/snooze); the backend refuses anything else (undo_item.ts).
async function undoItem(id, kind) {
  return bus.post({ aim: 'web', on: 'inbox', undo: 'item', id, kind })
}

// Saved replies (SPEC §12.4) - seeded server-side on first call.
async function listReplies() {
  const r = await bus.post({ aim: 'web', on: 'inbox', list: 'reply' })
  return (r && r.ok && r.replies) || []
}

export {
  list,
  load,
  save,
  remove,
  users,
  listInbox,
  dismissItem,
  syncNow,
  listPulls,
  listIssues,
  loadPr,
  approveItem,
  mergeItem,
  commentItem,
  labelItem,
  closeItem,
  snoozeItem,
  undoItem,
  listReplies,
  loadAuth,
  signin,
  signout,
  changePass,
  updateUser,
  remindPass,
  createApikey,
  listApikeys,
  revokeApikey,
}
