import { describe, it, expect } from 'vitest'
const {
  buildOccurrences, filterCandidates, slotOverlapsExisting, BLOCKING_STATUS
} = require('../scheduleCore')

// ---- 公共测试夹具 ----
// 2026-10-26 是周一
const CAMPUS_A = 'campus-a'
const CAMPUS_B = 'campus-b'

// 体验课需求：周一 2026-10-26 19:00-19:30
const TRIAL_REQ = {
  campusId: CAMPUS_A, type: 'trial',
  date: '2026-10-26', startTime: '19:00', duration: 30
}

// 正式课需求：每周一 18:00 起 2h，共 3 次，从 2026-10-26 起
const REGULAR_REQ = {
  campusId: CAMPUS_A, type: 'regular',
  weekday: 1, startTime: '18:00', duration: 120,
  totalSessions: 3, fromDate: '2026-10-26'
}

function teacher(overrides) {
  return {
    teacherId: 't1',
    campuses: [CAMPUS_A],
    slots: [{ type: 'weekly', weekday: 1, startTime: '18:00', endTime: '21:00' }],
    sessions: [],
    ...overrides
  }
}

describe('buildOccurrences', () => {
  it('体验课生成单次时间点', () => {
    const occ = buildOccurrences(TRIAL_REQ)
    expect(occ).toHaveLength(1)
    expect(occ[0]).toEqual({ date: '2026-10-26', weekday: 1, startMin: 1140, endMin: 1170 })
  })

  it('正式课生成 N 次系列时间点', () => {
    const occ = buildOccurrences(REGULAR_REQ)
    expect(occ).toHaveLength(3)
    expect(occ.map(o => o.date)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
    expect(occ[0]).toMatchObject({ startMin: 1080, endMin: 1200 }) // 18:00-20:00
  })
})

describe('filterCandidates - 校区匹配', () => {
  it('校区不符的老师被排除', () => {
    const result = filterCandidates(TRIAL_REQ, [teacher({ campuses: [CAMPUS_B] })])
    expect(result).toEqual([])
  })

  it('多校区老师匹配任一校区即入选', () => {
    const result = filterCandidates(TRIAL_REQ, [teacher({ campuses: [CAMPUS_B, CAMPUS_A] })])
    expect(result).toEqual(['t1'])
  })
})

describe('filterCandidates - 时间覆盖', () => {
  it('规律时间完整覆盖需求则入选（整点边界恰好相等）', () => {
    // 需求 19:00-19:30，时段 18:00-21:00
    expect(filterCandidates(TRIAL_REQ, [teacher()])).toEqual(['t1'])
  })

  it('规律时间部分覆盖（时段短于需求）则排除', () => {
    const t = teacher({
      slots: [{ type: 'weekly', weekday: 1, startTime: '18:00', endTime: '19:15' }]
    })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual([])
  })

  it('星期不匹配的规律时间不入选', () => {
    const t = teacher({
      slots: [{ type: 'weekly', weekday: 2, startTime: '18:00', endTime: '21:00' }]
    })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual([])
  })

  it('临时时间日期精确匹配可覆盖', () => {
    const t = teacher({
      slots: [{ type: 'date', date: '2026-10-26', startTime: '19:00', endTime: '19:30' }]
    })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual(['t1'])
  })

  it('临时时间日期不匹配不入选', () => {
    const t = teacher({
      slots: [{ type: 'date', date: '2026-10-27', startTime: '18:00', endTime: '21:00' }]
    })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual([])
  })

  it('规律+临时可组合：系列课不同次由不同类型覆盖', () => {
    const t = teacher({
      slots: [
        { type: 'weekly', weekday: 1, startTime: '18:00', endTime: '20:00' }, // 覆盖第1次(10-26)
        { type: 'weekly', weekday: 1, startTime: '18:00', endTime: '19:00' }, // 仅1h，不覆盖2h需求
        { type: 'date', date: '2026-11-02', startTime: '18:00', endTime: '20:00' }, // 补第2次
        { type: 'date', date: '2026-11-09', startTime: '18:00', endTime: '20:00' } // 补第3次
      ]
    })
    // 第一条规律时段 18-20 可覆盖全部3次，实际已足够
    expect(filterCandidates(REGULAR_REQ, [t])).toEqual(['t1'])
  })
})

describe('filterCandidates - 冲突排除', () => {
  const conflictSession = (overrides) => ({
    date: '2026-10-26', startTime: '19:00', endTime: '19:30',
    status: 'confirmed', ...overrides
  })

  it('已确认课程与需求时段重叠 → 排除', () => {
    const t = teacher({ sessions: [conflictSession()] })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual([])
  })

  it('待确认课程也算冲突 → 排除', () => {
    const t = teacher({ sessions: [conflictSession({ status: 'pending' })] })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual([])
  })

  it('已取消课程不算冲突 → 入选', () => {
    const t = teacher({ sessions: [conflictSession({ status: 'cancelled' })] })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual(['t1'])
  })

  it('已完成课程不算冲突 → 入选', () => {
    const t = teacher({ sessions: [conflictSession({ status: 'completed' })] })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual(['t1'])
  })

  it('端点相接不算冲突：已有课 18:30-19:00，需求 19:00-19:30 → 入选', () => {
    const t = teacher({
      sessions: [conflictSession({ startTime: '18:30', endTime: '19:00' })]
    })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual(['t1'])
  })

  it('不同日期的同时段课程不冲突 → 入选', () => {
    const t = teacher({ sessions: [conflictSession({ date: '2026-10-27' })] })
    expect(filterCandidates(TRIAL_REQ, [t])).toEqual(['t1'])
  })
})

describe('filterCandidates - 正式课系列校验', () => {
  it('系列第N次与其他课冲突 → 整个系列不可排', () => {
    const t = teacher({
      sessions: [{
        date: '2026-11-02', startTime: '19:00', endTime: '20:00', status: 'confirmed'
      }] // 与第2次课 18:00-20:00 冲突
    })
    expect(filterCandidates(REGULAR_REQ, [t])).toEqual([])
  })

  it('系列第N次不被可用时间覆盖 → 排除', () => {
    // 临时时间只覆盖前两次，第3次(11-09)无覆盖
    const t = teacher({
      slots: [
        { type: 'date', date: '2026-10-26', startTime: '18:00', endTime: '20:00' },
        { type: 'date', date: '2026-11-02', startTime: '18:00', endTime: '20:00' }
      ]
    })
    expect(filterCandidates(REGULAR_REQ, [t])).toEqual([])
  })

  it('系列全部满足 → 入选', () => {
    expect(filterCandidates(REGULAR_REQ, [teacher()])).toEqual(['t1'])
  })

  it('1h 时长正式课：覆盖边界判定正确', () => {
    const req = { ...REGULAR_REQ, duration: 60 } // 18:00-19:00
    const t = teacher({
      slots: [{ type: 'weekly', weekday: 1, startTime: '18:00', endTime: '19:00' }] // 恰好1h
    })
    expect(filterCandidates(req, [t])).toEqual(['t1'])
  })

  it('1.5h 时长正式课：1h 时段不够 → 排除', () => {
    const req = { ...REGULAR_REQ, duration: 90 }
    const t = teacher({
      slots: [{ type: 'weekly', weekday: 1, startTime: '18:00', endTime: '19:00' }]
    })
    expect(filterCandidates(req, [t])).toEqual([])
  })
})

describe('filterCandidates - 多老师混合', () => {
  it('只有全部条件满足的老师入选，候选列表保持传入顺序（不排序）', () => {
    const ok = teacher({ teacherId: 'ok' })
    const wrongCampus = teacher({ teacherId: 'wrong-campus', campuses: [CAMPUS_B] })
    const noTime = teacher({ teacherId: 'no-time', slots: [] })
    const conflicted = teacher({
      teacherId: 'conflicted',
      sessions: [{ date: '2026-10-26', startTime: '19:00', endTime: '19:30', status: 'pending' }]
    })
    const ok2 = teacher({ teacherId: 'ok2' })
    const result = filterCandidates(TRIAL_REQ, [ok, wrongCampus, noTime, conflicted, ok2])
    expect(result).toEqual(['ok', 'ok2'])
  })
})

describe('slotOverlapsExisting - 录入时段重叠校验', () => {
  const existing = [
    { type: 'weekly', weekday: 1, startTime: '18:00', endTime: '20:00' },
    { type: 'date', date: '2026-10-26', startTime: '10:00', endTime: '12:00' }
  ]

  it('同星期规律时段重叠 → true', () => {
    expect(slotOverlapsExisting(existing, { type: 'weekly', weekday: 1, startTime: '19:00', endTime: '21:00' })).toBe(true)
  })

  it('不同星期规律时段不重叠 → false', () => {
    expect(slotOverlapsExisting(existing, { type: 'weekly', weekday: 2, startTime: '18:00', endTime: '20:00' })).toBe(false)
  })

  it('同日期临时时段端点相接 → false', () => {
    expect(slotOverlapsExisting(existing, { type: 'date', date: '2026-10-26', startTime: '12:00', endTime: '13:00' })).toBe(false)
  })

  it('规律与临时属不同时域，互不影响 → false', () => {
    expect(slotOverlapsExisting(existing, { type: 'date', date: '2026-10-26', startTime: '18:00', endTime: '20:00' })).toBe(false)
  })
})

describe('BLOCKING_STATUS', () => {
  it('仅 pending/confirmed 占用档期', () => {
    expect(BLOCKING_STATUS).toEqual(['pending', 'confirmed'])
  })
})
