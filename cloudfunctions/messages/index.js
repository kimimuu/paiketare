// messages 云函数：站内消息（查询/标记已读/未读数）
// 发送消息由各业务云函数内部直接 insertOne，不走此 handler

const { F, queryAll, updateById, rdb } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 消息类型展示名
const TYPE_LABEL = {
  approval_approved: '审批通过',
  approval_rejected: '审批驳回',
  new_approval: '新审批待处理',
  course_new_pending: '新课待确认',
  session_rescheduled: '课程调整',
  teacher_changed: '课程移交',
  new_teacher_assigned: '新分配课程',
  course_cancelled: '停课通知',
  course_confirmed: '课程已确认',
  course_rejected: '课程被拒绝'
}

function formatMessage(m) {
  return {
    messageId: m.id,
    type: m.type || '',
    typeLabel: TYPE_LABEL[m.type] || '系统消息',
    content: m.content || '',
    linkType: m.linkType || '',
    linkId: m.linkId || '',
    read: !!m.read,
    readAt: m.readAt || null,
    createdAt: m.createdAt
  }
}

// 消息列表（老师→自己的；管理员→全部或指定用户）
async function list(event) {
  const payload = requireAuth(event)
  const { limit = 50, offset = 0, onlyUnread } = event

  const where = {}
  if (payload.role === 'teacher') {
    where.toId = payload.uid
  } else {
    if (event.userId) where.toId = event.userId
  }
  if (onlyUnread) where.read = false

  const all = await queryAll('messages', where, {
    orderBy: 'createdAt', orderDir: 'desc',
    limit: Number(limit) + Number(offset)
  })
  return {
    list: all.slice(Number(offset)).map(formatMessage)
  }
}

// 未读数（老师端底部导航红点用）
async function unreadCount(event) {
  const payload = requireAuth(event, 'teacher')
  const all = await queryAll('messages', { toId: payload.uid, read: false })
  return { count: all.length }
}

// 标记单条已读
async function markRead(event) {
  const payload = requireAuth(event, 'teacher')
  const { messageId } = event
  if (!messageId) bad('参数错误')
  const rows = await queryAll('messages', { id: messageId }, { limit: 1 })
  if (!rows.length) bad('消息不存在')
  if (rows[0].toId !== payload.uid) throw Object.assign(new Error('无权操作'), { code: 403 })
  if (!rows[0].read) {
    await rdb.from('messages').update({ read: true, readAt: new Date().toISOString() }).eq('id', messageId)
  }
  return { done: true }
}

// 全部已读
async function markAllRead(event) {
  const payload = requireAuth(event, 'teacher')
  const rows = await queryAll('messages', { toId: payload.uid, read: false })
  const unreadIds = rows.map(r => r.id)
  if (unreadIds.length) {
    const now = new Date().toISOString()
    await rdb.from('messages').update({ read: true, readAt: now }).in('id', unreadIds)
  }
  return { done: true, marked: unreadIds.length }
}

const handlers = { list, unreadCount, markRead, markAllRead }

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
