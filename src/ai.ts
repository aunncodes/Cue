import type { ParsedCueItem, RecurrenceRule } from './types'

const weekdays = [
  ['sunday', 0],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6],
] as const

function nextWeekday(day: number, hour = 12, minute = 0) {
  const now = new Date()
  const result = new Date(now)
  result.setHours(hour, minute, 0, 0)
  let delta = (day - now.getDay() + 7) % 7
  if (delta === 0 && result <= now) delta = 7
  result.setDate(result.getDate() + delta)
  return result
}

function parseTime(input: string) {
  const match = input.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (!match) return null

  let hour = Number(match[1]) % 12
  if (match[3].toLowerCase() === 'pm') hour += 12
  return { hour, minute: Number(match[2] ?? 0) }
}

function parseDuration(input: string) {
  const hourMatch = input.match(/(?:~|for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60)

  const minuteMatch = input.match(/(?:~|for\s+)?(\d+)\s*(?:m|min|mins|minute|minutes)\b/i)
  return minuteMatch ? Number(minuteMatch[1]) : null
}

function cleanTitle(input: string) {
  return input
    .replace(/\b(?:every|each)\s+(?:\d+\s+)?(?:day|days|week|weeks|month|months|weekday|weekdays|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
    .replace(/\bafter\s+(?:i\s+)?(?:do|finish|complete)(?:\s+it)?\b/gi, '')
    .replace(/\bafter\s+completion\b/gi, '')
    .replace(/\bafter\s+i\s+last\s+do\s+it\b/gi, '')
    .replace(/\b(today|tomorrow|tonight|this\s+week|sometime)\b/gi, '')
    .replace(/\bby\s+(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
    .replace(/\b(?:on\s+)?(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/(?:~|for\s+)?\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s-]+|[,\s-]+$/g, '')
    .trim()
}

export function parseLocally(input: string): ParsedCueItem {
  const lower = input.toLowerCase()
  const now = new Date()
  const time = parseTime(input)
  let target: Date | null = null
  let dueAt: string | null = null
  let scheduledAt: string | null = null

  if (lower.includes('tomorrow')) {
    target = new Date(now)
    target.setDate(target.getDate() + 1)
    target.setHours(time?.hour ?? 17, time?.minute ?? 0, 0, 0)
  } else if (lower.includes('today') || lower.includes('tonight')) {
    target = new Date(now)
    target.setHours(time?.hour ?? (lower.includes('tonight') ? 20 : 17), time?.minute ?? 0, 0, 0)
  } else {
    const weekday = weekdays.find(([name]) => lower.includes(name))
    if (weekday) target = nextWeekday(weekday[1], time?.hour ?? 17, time?.minute ?? 0)
  }

  const hasExplicitClock = Boolean(time)
  const eventWords = /\b(meeting|appointment|class|call|flight|interview|reservation|practice|game)\b/i.test(input)
  const kind = hasExplicitClock && (target || eventWords) ? 'event' : 'task'

  if (target) {
    if (kind === 'event') scheduledAt = target.toISOString()
    else dueAt = target.toISOString()
  }

  const recurring = /\b(every|each)\b/i.test(input)
  let recurrence: RecurrenceRule | null = null

  if (recurring) {
    const intervalMatch = lower.match(/\b(?:every|each)\s+(\d+)\s+(day|days|week|weeks|month|months)\b/)
    const namedDay = weekdays.find(([name]) => lower.includes(`every ${name}`) || lower.includes(`each ${name}`))
    const isWeekdays = /\b(?:every|each)\s+weekdays?\b/.test(lower)
    const mode = /after\s+(?:i\s+)?(?:do|finish|complete)|after\s+completion|after\s+i\s+last/i.test(lower)
      ? 'after_completion'
      : 'schedule'

    if (intervalMatch) {
      recurrence = {
        interval: Number(intervalMatch[1]),
        unit: intervalMatch[2].startsWith('day') ? 'day' : intervalMatch[2].startsWith('week') ? 'week' : 'month',
        daysOfWeek: [],
        mode,
      }
    } else if (isWeekdays) {
      recurrence = { interval: 1, unit: 'week', daysOfWeek: [1, 2, 3, 4, 5], mode }
    } else if (namedDay) {
      recurrence = { interval: 1, unit: 'week', daysOfWeek: [namedDay[1]], mode }
    } else if (/\b(?:every|each)\s+month\b/.test(lower)) {
      recurrence = { interval: 1, unit: 'month', daysOfWeek: [], mode }
    } else if (/\b(?:every|each)\s+week\b/.test(lower)) {
      recurrence = { interval: 1, unit: 'week', daysOfWeek: [], mode }
    } else {
      recurrence = { interval: 1, unit: 'day', daysOfWeek: [], mode }
    }
  }

  if (recurrence && !target) {
    const namedDay = weekdays.find(([name]) => lower.includes(name))
    if (namedDay) {
      target = nextWeekday(namedDay[1], time?.hour ?? 18, time?.minute ?? 0)
      if (hasExplicitClock && eventWords) scheduledAt = target.toISOString()
      else dueAt = target.toISOString()
    }
  }

  return {
    title: cleanTitle(input) || input.trim(),
    kind,
    dueAt,
    scheduledAt,
    durationMinutes: parseDuration(input),
    flexibility: kind === 'event' || /\b(hard|must|deadline)\b/i.test(input) ? 'hard' : 'flexible',
    recurrence,
  }
}

function normalizeServerItem(value: unknown): ParsedCueItem | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>

  if (typeof item.title !== 'string') return null
  if (item.kind !== 'task' && item.kind !== 'event') return null
  if (item.flexibility !== 'flexible' && item.flexibility !== 'hard') return null

  const dueAt = typeof item.dueAt === 'string' && item.dueAt ? new Date(item.dueAt).toISOString() : null
  const scheduledAt = typeof item.scheduledAt === 'string' && item.scheduledAt
    ? new Date(item.scheduledAt).toISOString()
    : null
  const durationMinutes = typeof item.durationMinutes === 'number' && item.durationMinutes > 0
    ? Math.round(item.durationMinutes)
    : null

  let recurrence: RecurrenceRule | null = null
  if (item.recurrence && typeof item.recurrence === 'object') {
    const rule = item.recurrence as Record<string, unknown>
    if (
      typeof rule.interval === 'number' &&
      (rule.unit === 'day' || rule.unit === 'week' || rule.unit === 'month') &&
      Array.isArray(rule.daysOfWeek) &&
      (rule.mode === 'schedule' || rule.mode === 'after_completion')
    ) {
      recurrence = {
        interval: Math.max(1, Math.round(rule.interval)),
        unit: rule.unit,
        daysOfWeek: rule.daysOfWeek.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6),
        mode: rule.mode,
      }
    }
  }

  return {
    title: item.title.trim(),
    kind: item.kind,
    dueAt,
    scheduledAt,
    durationMinutes,
    flexibility: item.kind === 'event' ? 'hard' : item.flexibility,
    recurrence,
  }
}

let serverAIAvailable = true

export async function refineWithServer(input: string, token: string | null): Promise<ParsedCueItem | null> {
  if (!serverAIAvailable || !token) return null
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 6000)

  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        input,
        now: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 404) serverAIAvailable = false
      return null
    }
    return normalizeServerItem(await response.json())
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}
