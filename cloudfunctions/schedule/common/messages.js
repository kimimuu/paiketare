// 站内消息发送辅助（跨云函数共享）
// 所有云函数内部直接调用 sendMessage() 即可落库，无需走 RPC

function sendMessageFactory(insertOne) {
  return async function sendMessage({ toId, fromId = '', type = '', content, linkType = '', linkId = '' }) {
    try {
      await insertOne('messages', {
        fromId, toId, type, content,
        linkType, linkId,
        read: false
      })
    } catch (e) {
      console.warn('[sendMessage] failed:', e.message)
    }
  }
}

module.exports = { sendMessageFactory }
