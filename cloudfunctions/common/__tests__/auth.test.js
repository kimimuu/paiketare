import { describe, it, expect } from 'vitest'
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../auth')

describe('密码哈希', () => {
  it('相同密码每次生成不同盐，但均可校验通过', () => {
    const a = hashPassword('123456')
    const b = hashPassword('123456')
    expect(a.salt).not.toBe(b.salt)
    expect(verifyPassword('123456', a.salt, a.hash)).toBe(true)
    expect(verifyPassword('123456', b.salt, b.hash)).toBe(true)
  })

  it('错误密码校验失败', () => {
    const { salt, hash } = hashPassword('123456')
    expect(verifyPassword('654321', salt, hash)).toBe(false)
  })
})

describe('token', () => {
  it('签发的 token 可校验并还原 payload', () => {
    const token = signToken({ uid: 'u1', role: 'teacher', name: '张三' })
    const payload = verifyToken(token)
    expect(payload.uid).toBe('u1')
    expect(payload.role).toBe('teacher')
  })

  it('篡改的 token 校验失败', () => {
    const token = signToken({ uid: 'u1', role: 'teacher' })
    const [encoded] = token.split('.')
    expect(verifyToken(`${encoded}.tamperedsig`)).toBeNull()
  })

  it('过期 token 校验失败', () => {
    const token = signToken({ uid: 'u1' }, -10)
    expect(verifyToken(token)).toBeNull()
  })

  it('非法格式返回 null', () => {
    expect(verifyToken('not-a-token')).toBeNull()
    expect(verifyToken('')).toBeNull()
    expect(verifyToken(null)).toBeNull()
  })
})
