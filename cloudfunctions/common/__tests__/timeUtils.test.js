import { describe, it, expect } from 'vitest'
const {
  toMinutes, toTimeStr, isValidTimeStr, isValidDateStr,
  weekdayOf, addDays, overlaps, covers, generateSeriesDates
} = require('../timeUtils')

describe('时间字符串解析', () => {
  it('HH:MM 与分钟数互转', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('18:30')).toBe(1110)
    expect(toMinutes('24:00')).toBe(1440)
    expect(toTimeStr(1110)).toBe('18:30')
    expect(toTimeStr(0)).toBe('00:00')
  })

  it('非法时间返回 NaN / 校验失败', () => {
    expect(toMinutes('25:00')).toBeNaN() // 跨天写法非法
    expect(toMinutes('18:60')).toBeNaN()
    expect(toMinutes('abc')).toBeNaN()
    expect(isValidTimeStr('9:30')).toBe(true)
    expect(isValidTimeStr('24:00')).toBe(true)
    expect(isValidTimeStr('24:01')).toBe(false)
  })

  it('日期校验', () => {
    expect(isValidDateStr('2026-10-26')).toBe(true)
    expect(isValidDateStr('2026-02-30')).toBe(false) // 不存在的日期
    expect(isValidDateStr('2026-2-6')).toBe(false)
  })
})

describe('日期计算', () => {
  it('weekdayOf 返回正确星期', () => {
    expect(weekdayOf('2026-10-26')).toBe(1) // 周一
    expect(weekdayOf('2026-10-25')).toBe(0) // 周日
  })

  it('addDays 跨月', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('generateSeriesDates 从当天开始（当天即目标星期）', () => {
    const dates = generateSeriesDates('2026-10-26', 1, 3) // 周一
    expect(dates).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
  })

  it('generateSeriesDates 起始日不是目标星期则顺延到下个', () => {
    const dates = generateSeriesDates('2026-10-26', 3, 2) // 从周一起找周三
    expect(dates).toEqual(['2026-10-28', '2026-11-04'])
  })
})

describe('区间重叠与覆盖', () => {
  it('端点相接不算重叠', () => {
    expect(overlaps(1080, 1140, 1140, 1200)).toBe(false) // 18-19 与 19-20
  })

  it('真实重叠判定', () => {
    expect(overlaps(1080, 1150, 1140, 1200)).toBe(true)
    expect(overlaps(1140, 1150, 1080, 1200)).toBe(true) // 包含
  })

  it('覆盖判定含边界相等', () => {
    expect(covers(1080, 1260, 1080, 1260)).toBe(true) // 恰好相等
    expect(covers(1080, 1260, 1081, 1260)).toBe(true)
    expect(covers(1080, 1260, 1079, 1260)).toBe(false)
    expect(covers(1080, 1260, 1080, 1261)).toBe(false)
  })
})
