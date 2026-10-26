// 探针2：验证 rdb 全套 API（insert/select/eq/in/neq/gte/lte/order/limit/update/delete/rpc）
const cloud = require('@cloudbase/node-sdk')

const app = cloud.init({
  env: process.env.TCB_ENV || cloud.SYMBOL_CURRENT_ENV
})
const rdb = app.rdb()

function step(name, fn) {
  return fn()
    .then(r => {
      console.log(`[ok] ${name}:`, JSON.stringify(r).slice(0, 500))
      return r
    })
    .catch(e => {
      console.log(`[ERR] ${name}: ${e.message}`)
      return { error: e.message }
    })
}

exports.main = async () => {
  const uid = 'probe-user-' + Date.now()

  // 1. rpc：连接身份
  await step('rpc_pg_identity_probe', async () => {
    const { data, error } = await rdb.rpc('pg_identity_probe')
    return { data, error }
  })

  // 2. insert（camelCase JSON 键，含 boolean）
  await step('insert_user', async () => {
    const { data, error } = await rdb.from('users').insert({
      id: uid,
      name: '探针老师',
      phone: '19900001111',
      salt: 's',
      hash: 'h',
      role: 'teacher',
      status: 'active',
      needChangePassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).select('id').single()
    return { data, error }
  })

  // 3. select 全行：看 JSON 键形态
  await step('select_row', async () => {
    const { data, error } = await rdb.from('users').select('*').eq('id', uid).limit(1)
    return { data, error }
  })

  // 4. eq + in + neq + gte/lte + order + limit/offset
  await step('filter_combo', async () => {
    const { data, error } = await rdb.from('users')
      .select('id, phone')
      .eq('role', 'teacher')
      .in('phone', ['19900001111', '19900002222'])
      .neq('id', 'xxx')
      .gte('createdAt', '2020-01-01')
      .lte('createdAt', '2030-01-01')
      .order('createdAt', { ascending: false })
      .range(0, 10)
    return { data, error }
  })

  // 5. update
  await step('update_row', async () => {
    const { data, error } = await rdb.from('users')
      .update({ status: 'pending', needChangePassword: false })
      .eq('id', uid)
      .select('id, status')
    return { data, error }
  })

  // 6. count 查询
  await step('count_head', async () => {
    const { count, error } = await rdb.from('users')
      .select('id', { count: 'exact', head: true })
      .eq('id', uid)
    return { count, error }
  })

  // 7. delete（清场）
  await step('delete_row', async () => {
    const { data, error } = await rdb.from('users').delete().eq('id', uid).select('id')
    return { data, error }
  })

  // 8. 分页 limit 大结果集（queryAll 场景模拟）
  await step('limit_offset', async () => {
    const { data, error } = await rdb.from('users').select('id').limit(1000)
    return { len: (data || []).length, error }
  })

  return { done: true }
}
