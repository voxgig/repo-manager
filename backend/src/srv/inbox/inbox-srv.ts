// Inbox service: sync -> derive -> store -> dismiss (SPEC.REPO-MANAGER.md §12).
// MakeSrv auto-loads one action file per message declared in srv.aon's 'in'.

import { MakeSrv } from '@voxgig/system'

module.exports = MakeSrv('inbox', require)
