import type { CueItem, RecurrenceRule } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function addMonths(date: Date, count: number) {
  const copy = new Date(date)
  const day = copy.getDate()
  copy.setDate(1)
  copy.setMonth(copy.getMonth() + count)
  const finalDay = Math.min(day, new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate())
  copy.setDate(finalDay)
  return copy
}

function nextWeeklyDay(base: Date, rule: RecurrenceRule) {
  const days = [...rule.daysOfWeek].sort((a, b) => a - b)
  if (!days.length) {
    const next = new Date(base)
    next.setDate(next.getDate() + 7 * rule.interval)
    return next
  }

  for (let offset = 1; offset <= 7 * Math.max(rule.interval, 1); offset += 1) {
    const candidate = new Date(base.getTime() + offset * DAY_MS)
    if (!days.includes(candidate.getDay())) continue

    if (rule.interval === 1) return candidate

    const weeksSince = Math.floor(offset / 7)
    if (weeksSince >= rule.interval - 1) return candidate
  }

  const fallback = new Date(base)
  fallback.setDate(fallback.getDate() + 7 * rule.interval)
  return fallback
}

export function nextOccurrence(item: CueItem, completedAt = new Date()): string | null {
  if (!item.recurrence) return null

  const anchorValue = item.scheduledAt ?? item.dueAt
  const anchor = item.recurrence.mode === 'after_completion' || !anchorValue
    ? new Date(completedAt)
    : new Date(anchorValue)

  let next: Date
  switch (item.recurrence.unit) {
    case 'day':
      next = new Date(anchor)
      next.setDate(next.getDate() + item.recurrence.interval)
      break
    case 'week':
      next = nextWeeklyDay(anchor, item.recurrence)
      break
    case 'month':
      next = addMonths(anchor, item.recurrence.interval)
      break
  }

  return next.toISOString()
}

export function describeRecurrence(rule: RecurrenceRule) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (rule.unit === 'week' && rule.daysOfWeek.length) {
    const days = rule.daysOfWeek.map((day) => dayNames[day]).join(', ')
    return rule.interval === 1 ? `Every ${days}` : `Every ${rule.interval} weeks · ${days}`
  }

  const unit = rule.interval === 1 ? rule.unit : `${rule.unit}s`
  const prefix = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}`
  return rule.mode === 'after_completion' ? `${prefix} after done` : prefix
}
