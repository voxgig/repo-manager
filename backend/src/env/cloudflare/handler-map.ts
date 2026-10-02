// Static stand-in for @seneca/reload's file-scanning make() - see
// static-srv.ts's own comment for why. One entry per message pattern in
// msg.aon's aim:inbox / aim:web,on:inbox blocks, keyed exactly the way
// @voxgig/system's actpath() derives it: './' + the pattern's last segment
// with ':' replaced by '_' (or the pattern's own explicit `file:` override,
// which is already this same name for every aim:web,on:inbox entry).
// item_forge.ts/detect.ts/check_policy.ts aren't listed - they're plain
// helper modules imported by the files below, not messages of their own
// (see each file's own module comment).

import type { HandlerMap } from './static-srv'

const inboxHandlers: HandlerMap = {
  './sync_item': require('../../srv/inbox/sync_item'),
  './list_item': require('../../srv/inbox/list_item'),
  './dismiss_item': require('../../srv/inbox/dismiss_item'),
  './undo_item': require('../../srv/inbox/undo_item'),
  './list_reply': require('../../srv/inbox/list_reply'),
  './list_pr': require('../../srv/inbox/list_pr'),
  './list_issue': require('../../srv/inbox/list_issue'),
  './list_drift': require('../../srv/inbox/list_drift'),
  './list_external': require('../../srv/inbox/list_external'),
  './load_pr': require('../../srv/inbox/load_pr'),
  './approve_item': require('../../srv/inbox/approve_item'),
  './merge_item': require('../../srv/inbox/merge_item'),
  './comment_item': require('../../srv/inbox/comment_item'),
  './label_item': require('../../srv/inbox/label_item'),
  './close_item': require('../../srv/inbox/close_item'),
  './snooze_item': require('../../srv/inbox/snooze_item'),

  './web_sync_item': require('../../srv/inbox/web_sync_item'),
  './web_list_item': require('../../srv/inbox/web_list_item'),
  './web_dismiss_item': require('../../srv/inbox/web_dismiss_item'),
  './web_undo_item': require('../../srv/inbox/web_undo_item'),
  './web_list_reply': require('../../srv/inbox/web_list_reply'),
  './web_approve_item': require('../../srv/inbox/web_approve_item'),
  './web_merge_item': require('../../srv/inbox/web_merge_item'),
  './web_comment_item': require('../../srv/inbox/web_comment_item'),
  './web_label_item': require('../../srv/inbox/web_label_item'),
  './web_close_item': require('../../srv/inbox/web_close_item'),
  './web_snooze_item': require('../../srv/inbox/web_snooze_item'),
  './web_list_pr': require('../../srv/inbox/web_list_pr'),
  './web_list_issue': require('../../srv/inbox/web_list_issue'),
  './web_list_drift': require('../../srv/inbox/web_list_drift'),
  './web_list_external': require('../../srv/inbox/web_list_external'),
  './web_load_pr': require('../../srv/inbox/web_load_pr'),
}

const authHandlers: HandlerMap = {
  './signin_user': require('../../srv/auth/signin_user'),
  './signout_user': require('../../srv/auth/signout_user'),
  './load_auth': require('../../srv/auth/load_auth'),

  './web_signin_user': require('../../srv/auth/web_signin_user'),
  './web_signout_user': require('../../srv/auth/web_signout_user'),
  './web_load_auth': require('../../srv/auth/web_load_auth'),
}

export { inboxHandlers, authHandlers }
