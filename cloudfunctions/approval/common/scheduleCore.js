// 排课核心纯逻辑（不依赖数据库，便于单测）
// 时段内部表示：分钟数区间 [startMin, endMin)
const { toMinutes, weekdayOf, overlaps, covers, generateSeriesDates } = require('./timeUtils')

// 占用档期的课程状态：待确认 + 已确认
const BLOCKING_STATUS = ['pending', 'confirmed']

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

// 老师的全部可用时段（规律+临时）是否覆盖某次上课
function isCovered(availSlots, occ) {
  return availSlots.some(s => slotCoversOccurrence(s, occ))
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
 * @param candidates    [{ teacherId, campuses:[campusId], slots:[可用时段], sessions:[占用session] }]
 * @returns 通过全部条件的 teacherId 数组
 */
function filterCandidates(requirements, candidates) {
  const occurrences = buildOccurrences(requirements)
  return candidates
    .filter(c => c.campuses.includes(requirements.campusId))
    .filter(c => occurrences.every(occ => isCovered(c.slots, occ)))
    .filter(c => {
      const blocking = (c.sessions || []).filter(s => BLOCKING_STATUS.includes(s.status))
      return occurrences.every(occ => !hasConflict(blocking, occ))
    })
    .map(c => c.teacherId)
}

// 新可用时段是否与同时域的既有时段重叠（weekly 按星期、date 按日期区分时域）
function slotOverlapsExisting(existingSlots, candidate) {
  return existingSlots.some(s => {
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
  sessionConflictsWithOcc,
  hasConflict,
  filterCandidates,
  slotOverlapsExisting
}
