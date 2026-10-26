// 时间工具：HH:MM 与分钟数互转、区间重叠/覆盖、日期序列生成
// 约定：时间字符串 'HH:MM'（24小时制），日期字符串 'YYYY-MM-DD'，星期 0=周日…6=周六

function isValidTimeStr(t) {
  if (typeof t !== 'string' || !/^\d{1,2}:\d{2}$/.test(t)) return false
  const [h, m] = t.split(':').map(Number)
  return h >= 0 && h <= 24 && m >= 0 && m < 60 && !(h === 24 && m > 0)
}

// '18:30' -> 1110；非法输入返回 NaN
function toMinutes(t) {
  if (!isValidTimeStr(t)) return NaN
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// 1110 -> '18:30'
function toTimeStr(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function isValidDateStr(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day
}

// 日期字符串 -> 星期几（0=周日）。用本地时间构造，避免时区/夏令时影响
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function formatDate(dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 日期 +n 天
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return formatDate(dt)
}

// 今天（服务器本地时区）
function todayStr() {
  return formatDate(new Date())
}

// 半开区间 [start,end) 是否相交；端点相接（如 18:00-19:00 与 19:00-20:00）不算重叠
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

// [availStart,availEnd) 是否完整覆盖 [needStart,needEnd)
function covers(availStart, availEnd, needStart, needEnd) {
  return availStart <= needStart && availEnd >= needEnd
}

// 生成系列日期：从 fromDate 起（含当天）找 count 个 weekday 对应的日期
function generateSeriesDates(fromDateStr, weekday, count) {
  const dates = []
  let cur = fromDateStr
  let delta = (weekday - weekdayOf(cur) + 7) % 7
  cur = addDays(cur, delta)
  while (dates.length < count) {
    dates.push(cur)
    cur = addDays(cur, 7)
  }
  return dates
}

module.exports = {
  isValidTimeStr,
  toMinutes,
  toTimeStr,
  isValidDateStr,
  weekdayOf,
  addDays,
  todayStr,
  overlaps,
  covers,
  generateSeriesDates
}
