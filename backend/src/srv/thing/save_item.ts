//// Example action: create or update a 'thing' item. The @seneca/owner
//// plugin fills owner_id from the signed-in user automatically.

// module.exports = function make_save_item() {
//   return async function save_item(this: any, msg: any) {
//     const seneca = this
//
//     const data = Object.assign({}, msg.item)
//     const now = Date.now()
//
//     if (null == data.id) {
//       data.t_c = now
//     }
//     data.t_m = now
//
//     const item = await seneca.entity('app/thing').data$(data).save$()
//
//     return { ok: !!item, item }
//   }
// }
