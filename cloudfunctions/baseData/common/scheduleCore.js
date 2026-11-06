// 排课核心纯逻辑（不依赖数据库，便于单测）
// 时段内部表示：分钟数区间 [startMin, endMin)
// slots 按 kind 区分：
//   kind: 'normal'  → 可用时段，参与 isCovered 覆盖检查
//   kind: 'blocked' → 不接课时段，像 sessions 一样算冲突占用
// 2026-11-06 新增 blocked slot 支持

const { toMinutes, weekdayOf, overlaps, covers, generateSeriesDates } = require('./timeUtils')

// 占用档期的课程状态：待确认 + 已确认
const BLOCKING_STATUS = ['pending', 'confirmed']

/**
 * 只取 normal 可用时段，排除 blocked（blocked 不参与"覆盖"检查，单独走冲突检查）
 */
function normalSlots(slots) {
  return (slots || []).filter(s => (s.kind || 'normal') !== 'blocked')
}

/**
 * 只取 blocked 时段，用于冲突检查
 */
function blockedSlots(slots) {
  return (slots || []).filter(s => (s.kind || 'normal') === 'blocked')
}

/**
 * 计算排课需求的每一次上课时间点
 * @returns [{ date, weekday, startMin, endMin }]
 */
function buildOccurrences({ type, date, weekday, startTime, duration, totalSessions, fromDate }) {
  const startMin = toMinutes(startTime)
  const endMin = startMin + duration
  if (type === 'trial') {
    return [{ date, weekday: weekdayOf(date), startMin, endMin }]
  }
  // regular：从 fromDate 起的 totalSessions 个 weekday
  const dates = generateSeriesDates(fromDate, weekday, totalSessions)
  return dates.map(d => ({ date: d, weekday, startMin, endMin }))
}

// 单个可用时段是否覆盖某次上课
function slotCoversOccurrence(slot, occ) {
  if (slot.type === 'weekly') {
    if (slot.weekday !== occ.weekday) return false
  } else if (slot.type === 'date') {
    if (slot.date !== occ.date) return false
  } else {
    return false
  }
  return covers(toMinutes(slot.startTime), toMinutes(slot.endTime), occ.startMin, occ.endMin)
}

// 老师的 normal 可用时段是否覆盖某次上课（blocked 不参与覆盖）
function isCovered(availSlots, occ) {
  return normalSlots(availSlots).some(s => slotCoversOccurrence(s, occ))
}

// blocked slot 是否与某次上课冲突（和 sessions 冲突逻辑一样）
function blockedSlotConflictsOccurrence(slot, occ) {
  if (slot.type === 'weekly') {
    if (slot.weekday !== occ.weekday) return false
    return overlaps(toMinutes(slot.startTime), toMinutes(slot.endTime), occ.startMin, occ.endMin)
  }
  if (slot.type === 'date') {
    if (slot.date !== occ.date) return false
    return overlaps(toMinutes(slot.startTime), toMinutes(slot.endTime), occ.startMin, occ.endMin)
  }
  return false
}

// 是否有 blocked 时段与某次上课冲突
function hasBlockedConflict(blockeds, occ) {
  return blockeds.some(s => blockedSlotConflictsOccurrence(s, occ))
}

// 单条 session 是否与某次上课冲突（同日期且时段相交）
function sessionConflictsWithOcc(session, occ) {
  if (session.date !== occ.date) return false
  return overlaps(toMinutes(session.startTime), toMinutes(session.endTime), occ.startMin, occ.endMin)
}

// 某次上课是否与会话列表冲突（sessions 需已过滤为占用状态）
function hasConflict(sessions, occ) {
  return sessions.some(s => sessionConflictsWithOcc(s, occ))
}

/**
 * 筛选候选老师（纯函数）
 * @param requirements  buildOccurrences 的入参
 * @param candidates    [{ teacherId, campuses:[campusId], slots:[全部 availabilities 含 kind], sessions:[占用session] }]
 * @returns 通过全部条件的 teacherId 数组
 */
function filterCandidates(requirements, candidates) {
  const occurrences = buildOccurrences(requirements)
  return candidates
    .filter(c => c.campuses.includes(requirements.campusId))
    // normal slots 覆盖所有 occ
    .filter(c => occurrences.every(occ => isCovered(c.slots, occ)))
    // sessions 不冲突
    .filter(c => {
      const blocking = (c.sessions || []).filter(s => BLOCKING_STATUS.includes(s.status))
      return occurrences.every(occ => !hasConflict(blocking, occ))
    })
    // blocked slots 不冲突（2026-11-06 新增）
    .filter(c => {
      const blocked = blockedSlots(c.slots)
      if (!blocked.length) return true
      return occurrences.every(occ => !hasBlockedConflict(blocked, occ))
    })
    .map(c => c.teacherId)
}

// 新可用时段是否与同时域的既有时段重叠（weekly 按星期、date 按日期区分时域）
// kind 不同也可能重叠（normal 和 blocked 可以时段重叠，语义上不一样，这里只检查同 kind）
function slotOverlapsExisting(existingSlots, candidate) {
  return existingSlots.some(s => {
    // 同 kind 才检查重叠（normal 和 blocked 可以时间重叠，比如可用时间内特意标记某周 blocked）
    if ((s.kind || 'normal') !== (candidate.kind || 'normal')) return false
    if (s.type !== candidate.type) return false
    if (s.type === 'weekly' && s.weekday !== candidate.weekday) return false
    if (s.type === 'date' && s.date !== candidate.date) return false
    return overlaps(
      toMinutes(s.startTime), toMinutes(s.endTime),
      toMinutes(candidate.startTime), toMinutes(candidate.endTime)
    )
  })
}

module.exports = {
  BLOCKING_STATUS,
  buildOccurrences,
  slotCoversOccurrence,
  isCovered,
  blockedSlotConflictsOccurrence,
  hasBlockedConflict,
  sessionConflictsWithOcc,
  hasConflict,
  filterCandidates,
  slotOverlapsExisting,
  normalSlots,
  blockedSlots
}
