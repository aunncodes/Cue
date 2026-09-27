import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
  Repeat2,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { db } from './db'
import { parseLocally, refineWithServer } from './ai'
import { describeRecurrence, nextOccurrence } from './recurrence'
import type { Completion, CueItem, RecurrenceMode, RecurrenceUnit } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function endOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

function itemTime(item: CueItem) {
  return item.scheduledAt ?? item.dueAt
}

function formatDay(dateString: string) {
  const value = new Date(dateString)
  const today = startOfDay(new Date())
  const target = startOfDay(value)
  const delta = Math.round((target.getTime() - today.getTime()) / DAY_MS)

  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(value)
}

function formatTime(dateString: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateString))
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function itemMeta(item: CueItem) {
  const parts: { icon: 'clock' | 'repeat'; text: string; event?: boolean }[] = []

  if (item.scheduledAt) {
    parts.push({
      icon: 'clock',
      text: `${formatDay(item.scheduledAt)} · ${formatTime(item.scheduledAt)}`,
      event: true,
    })
  } else if (item.dueAt) {
    const overdue = new Date(item.dueAt).getTime() < Date.now()
    parts.push({
      icon: 'clock',
      text: `${overdue ? 'Overdue · ' : ''}${formatDay(item.dueAt)}`,
    })
  }

  if (item.durationMinutes) {
    parts.push({ icon: 'clock', text: formatDuration(item.durationMinutes) })
  }

  if (item.recurrence) {
    parts.push({ icon: 'repeat', text: describeRecurrence(item.recurrence) })
  }

  return parts
}

function toDateInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toTimeInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function combineLocalDateTime(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hour, minute] = timeValue.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function getDefaultWeekday(item: CueItem) {
  if (item.recurrence?.daysOfWeek.length) return item.recurrence.daysOfWeek[0]
  const value = itemTime(item)
  return value ? new Date(value).getDay() : new Date().getDay()
}

function CueMark() {
  return (
    <svg className="cue-mark-svg" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="cue-stick" x1="38" y1="8" x2="14" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b9a9ff" />
          <stop offset="0.42" stopColor="#ff8b86" />
          <stop offset="0.72" stopColor="#f6d66f" />
          <stop offset="1" stopColor="#79dfbf" />
        </linearGradient>
      </defs>
      <path d="M38.8 6.8 42 10 18.5 33.5l-3.2-3.2L38.8 6.8Z" fill="url(#cue-stick)" />
      <path d="m15.2 30.4 3.1 3.1-3.4 3.4-3.1-3.1 3.4-3.4Z" fill="#f2fbf6" />
      <circle cx="9.7" cy="38" r="5.7" fill="#f2fbf6" />
      <circle cx="9.7" cy="38" r="2.2" fill="#79dfbf" />
    </svg>
  )
}

type Burst = { id: number; x: number; y: number }

const confettiPieces = [
  [-62, -72, -140, '#f6d66f'],
  [-35, -92, -80, '#ff8b86'],
  [-10, -78, 120, '#79dfbf'],
  [18, -96, 75, '#b9a9ff'],
  [45, -76, 155, '#f6d66f'],
  [68, -55, -110, '#ff8b86'],
  [-76, -35, 95, '#79dfbf'],
  [-48, -45, 180, '#b9a9ff'],
  [58, -30, -45, '#79dfbf'],
  [78, -14, 130, '#f6d66f'],
  [-70, 4, -155, '#ff8b86'],
  [-34, 16, 65, '#f6d66f'],
  [5, 18, -95, '#b9a9ff'],
  [42, 13, 145, '#79dfbf'],
  [69, 9, -60, '#ff8b86'],
] as const

function Confetti({ bursts }: { bursts: Burst[] }) {
  return (
    <div className="confetti-layer" aria-hidden="true">
      {bursts.flatMap((burst) =>
        confettiPieces.map(([dx, dy, rotate, color], index) => (
          <motion.span
            key={`${burst.id}-${index}`}
            className="confetti-piece"
            style={{
              left: burst.x,
              top: burst.y,
              background: color,
              '--confetti-radius': index % 3 === 0 ? '50%' : '3px',
            } as CSSProperties}
            initial={{ x: 0, y: 0, rotate: 0, scale: 0.65, opacity: 1 }}
            animate={{ x: dx, y: dy + 34, rotate, scale: [0.65, 1.05, 0.72], opacity: [1, 1, 0] }}
            transition={{ duration: 0.78, ease: [0.18, 0.8, 0.25, 1] }}
          />
        )),
      )}
    </div>
  )
}

type UndoAction =
  | {
      kind: 'complete'
      label: string
      item: CueItem
      completionId: number
    }
  | {
      kind: 'delete'
      label: string
      item: CueItem
      completions: Completion[]
    }

function ItemEditor({
  item,
  onUpdate,
  onDelete,
}: {
  item: CueItem
  onUpdate: (item: CueItem, patch: Partial<CueItem>) => void
  onDelete: (item: CueItem) => void
}) {
  const value = itemTime(item)
  const dateValue = toDateInput(value)
  const timeValue = toTimeInput(item.scheduledAt)

  const setKind = (kind: CueItem['kind']) => {
    if (kind === item.kind) return

    if (kind === 'event') {
      const scheduledAt = item.dueAt ?? combineLocalDateTime(toDateInput(new Date().toISOString()), '09:00')
      onUpdate(item, {
        kind,
        scheduledAt,
        dueAt: null,
        flexibility: 'hard',
      })
      return
    }

    onUpdate(item, {
      kind,
      dueAt: item.scheduledAt,
      scheduledAt: null,
      flexibility: 'flexible',
    })
  }

  const setDate = (nextDate: string) => {
    if (!nextDate) {
      onUpdate(item, item.kind === 'event' ? { scheduledAt: null } : { dueAt: null })
      return
    }

    if (item.kind === 'event') {
      onUpdate(item, { scheduledAt: combineLocalDateTime(nextDate, timeValue || '09:00') })
    } else {
      onUpdate(item, { dueAt: combineLocalDateTime(nextDate, '17:00') })
    }
  }

  const setTime = (nextTime: string) => {
    if (item.kind !== 'event') return
    const nextDate = dateValue || toDateInput(new Date().toISOString())
    onUpdate(item, { scheduledAt: combineLocalDateTime(nextDate, nextTime || '09:00') })
  }

  const setRepeatUnit = (unit: '' | RecurrenceUnit) => {
    if (!unit) {
      onUpdate(item, { recurrence: null })
      return
    }

    onUpdate(item, {
      recurrence: {
        interval: item.recurrence?.interval ?? 1,
        unit,
        daysOfWeek: unit === 'week' ? [getDefaultWeekday(item)] : [],
        mode: item.recurrence?.mode ?? 'schedule',
      },
    })
  }

  return (
    <motion.div
      className="task-editor"
      initial={{ opacity: 0, height: 0, y: -6 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        className="editor-title"
        value={item.title}
        onChange={(event) => onUpdate(item, { title: event.target.value })}
        aria-label="Task title"
      />

      <div className="editor-grid">
        <label>
          <span>Type</span>
          <div className="segmented-control">
            <button type="button" className={item.kind === 'task' ? 'active' : ''} onClick={() => setKind('task')}>Task</button>
            <button type="button" className={item.kind === 'event' ? 'active' : ''} onClick={() => setKind('event')}>Event</button>
          </div>
        </label>

        <label>
          <span>Date</span>
          <input type="date" value={dateValue} onChange={(event) => setDate(event.target.value)} />
        </label>

        {item.kind === 'event' && (
          <label>
            <span>Time</span>
            <input type="time" value={timeValue} onChange={(event) => setTime(event.target.value)} />
          </label>
        )}

        <label>
          <span>Duration</span>
          <div className="duration-field">
            <input
              type="number"
              min="1"
              step="5"
              value={item.durationMinutes ?? ''}
              placeholder="30"
              onChange={(event) => {
                const value = Number(event.target.value)
                onUpdate(item, { durationMinutes: value > 0 ? Math.round(value) : null })
              }}
            />
            <span>min</span>
          </div>
        </label>

        <label>
          <span>Repeat</span>
          <select value={item.recurrence?.unit ?? ''} onChange={(event) => setRepeatUnit(event.target.value as '' | RecurrenceUnit)}>
            <option value="">Never</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>

        {item.recurrence && (
          <>
            <label>
              <span>Every</span>
              <div className="repeat-interval">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={item.recurrence.interval}
                  onChange={(event) => {
                    const interval = Math.max(1, Number(event.target.value) || 1)
                    onUpdate(item, { recurrence: { ...item.recurrence!, interval } })
                  }}
                />
                <span>{item.recurrence.unit}{item.recurrence.interval === 1 ? '' : 's'}</span>
              </div>
            </label>

            {item.recurrence.unit === 'week' && (
              <label>
                <span>Day</span>
                <select
                  value={getDefaultWeekday(item)}
                  onChange={(event) => onUpdate(item, {
                    recurrence: { ...item.recurrence!, daysOfWeek: [Number(event.target.value)] },
                  })}
                >
                  {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </label>
            )}

            <label>
              <span>Mode</span>
              <select
                value={item.recurrence.mode}
                onChange={(event) => onUpdate(item, {
                  recurrence: { ...item.recurrence!, mode: event.target.value as RecurrenceMode },
                })}
              >
                <option value="schedule">On schedule</option>
                <option value="after_completion">After done</option>
              </select>
            </label>
          </>
        )}
      </div>

      <button type="button" className="delete-button" onClick={() => onDelete(item)}>
        <Trash2 size={14} /> Delete
      </button>
    </motion.div>
  )
}

function ItemRow({
  item,
  selected,
  expanded,
  completing,
  onSelect,
  onToggleExpanded,
  onComplete,
  onDelete,
  onUpdate,
  registerRow,
}: {
  item: CueItem
  selected: boolean
  expanded: boolean
  completing: boolean
  onSelect: (item: CueItem) => void
  onToggleExpanded: (item: CueItem) => void
  onComplete: (item: CueItem, origin: { x: number; y: number }) => void
  onDelete: (item: CueItem) => void
  onUpdate: (item: CueItem, patch: Partial<CueItem>) => void
  registerRow: (id: number, node: HTMLDivElement | null) => void
}) {
  const meta = itemMeta(item)
  const id = item.id!

  const complete = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    onComplete(item, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }

  return (
    <motion.div
      ref={(node) => registerRow(id, node)}
      layout
      tabIndex={0}
      role="button"
      aria-expanded={expanded}
      className={`task-row ${item.kind === 'event' ? 'task-row-event' : ''} ${selected ? 'task-row-selected' : ''} ${expanded ? 'task-row-expanded' : ''}`}
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 28, scale: 0.98, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 430, damping: 31 }}
      onFocus={() => onSelect(item)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, input, select')) return
        onSelect(item)
        onToggleExpanded(item)
      }}
    >
      <motion.button
        type="button"
        className={`check-button ${completing ? 'checking' : ''}`}
        onClick={complete}
        whileTap={{ scale: 0.78 }}
        disabled={completing}
        aria-label={`Complete ${item.title}`}
      >
        <Check size={15} strokeWidth={3} />
      </motion.button>

      <div className="task-copy">
        <div className="task-title">{item.title}</div>
        {meta.length > 0 && (
          <div className="task-meta">
            {meta.map((part, index) => (
              <span key={`${part.text}-${index}`} className={part.event ? 'event-meta' : undefined}>
                {part.icon === 'repeat' ? <Repeat2 size={12} /> : <Clock3 size={12} />}
                {part.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`row-menu ${expanded ? 'open' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(item)
          onToggleExpanded(item)
        }}
        aria-label={expanded ? 'Close task details' : 'Open task details'}
      >
        <ChevronDown size={17} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && <ItemEditor item={item} onUpdate={onUpdate} onDelete={onDelete} />}
      </AnimatePresence>
    </motion.div>
  )
}

function Section({
  title,
  tone,
  items,
  selectedId,
  expandedId,
  completingIds,
  onSelect,
  onToggleExpanded,
  onComplete,
  onDelete,
  onUpdate,
  registerRow,
}: {
  title: string
  tone: 'sun' | 'coral' | 'mint' | 'violet'
  items: CueItem[]
  selectedId: number | null
  expandedId: number | null
  completingIds: Set<number>
  onSelect: (item: CueItem) => void
  onToggleExpanded: (item: CueItem) => void
  onComplete: (item: CueItem, origin: { x: number; y: number }) => void
  onDelete: (item: CueItem) => void
  onUpdate: (item: CueItem, patch: Partial<CueItem>) => void
  registerRow: (id: number, node: HTMLDivElement | null) => void
}) {
  if (!items.length) return null

  return (
    <motion.section layout className={`task-section section-${tone}`}>
      <div className="section-title">
        <span className="section-dot" />
        <h2>{title}</h2>
      </div>
      <div className="task-list">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              expanded={expandedId === item.id}
              completing={completingIds.has(item.id!)}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
              onComplete={onComplete}
              onDelete={onDelete}
              onUpdate={onUpdate}
              registerRow={registerRow}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

export default function App() {
  const items = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray(), []) ?? []
  const [draft, setDraft] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [completingIds, setCompletingIds] = useState<Set<number>>(new Set())
  const [bursts, setBursts] = useState<Burst[]>([])
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef(new Map<number, HTMLDivElement>())
  const undoTimer = useRef<number | null>(null)
  const burstId = useRef(0)

  const activeItems = useMemo(() => items.filter((item) => !item.completedAt), [items])

  const grouped = useMemo(() => {
    const now = new Date()
    const todayEnd = endOfDay(now)
    const soonEnd = new Date(todayEnd.getTime() + 7 * DAY_MS)

    const byTime = (a: CueItem, b: CueItem) => {
      const aTime = itemTime(a)
      const bTime = itemTime(b)
      if (!aTime && !bTime) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (!aTime) return 1
      if (!bTime) return -1
      return new Date(aTime).getTime() - new Date(bTime).getTime()
    }

    return {
      today: activeItems.filter((item) => {
        const time = itemTime(item)
        return time && new Date(time) <= todayEnd
      }).sort(byTime),
      soon: activeItems.filter((item) => {
        const time = itemTime(item)
        if (!time) return false
        const value = new Date(time)
        return value > todayEnd && value <= soonEnd
      }).sort(byTime),
      anytime: activeItems.filter((item) => !itemTime(item)).sort(byTime),
      later: activeItems.filter((item) => {
        const time = itemTime(item)
        return time && new Date(time) > soonEnd
      }).sort(byTime),
    }
  }, [activeItems])

  const orderedItems = useMemo(
    () => [...grouped.today, ...grouped.soon, ...grouped.anytime, ...grouped.later],
    [grouped],
  )

  const orderedIds = useMemo(() => orderedItems.map((item) => item.id!), [orderedItems])

  const registerRow = (id: number, node: HTMLDivElement | null) => {
    if (node) rowRefs.current.set(id, node)
    else rowRefs.current.delete(id)
  }

  const focusItem = (id: number) => {
    setSelectedId(id)
    requestAnimationFrame(() => rowRefs.current.get(id)?.focus({ preventScroll: true }))
  }

  const moveSelection = (direction: -1 | 1) => {
    if (!orderedIds.length) return
    const index = selectedId === null ? -1 : orderedIds.indexOf(selectedId)
    const nextIndex = index === -1
      ? direction === 1 ? 0 : orderedIds.length - 1
      : Math.max(0, Math.min(orderedIds.length - 1, index + direction))
    focusItem(orderedIds[nextIndex])
  }

  const showUndo = (action: UndoAction) => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    setUndoAction(action)
    undoTimer.current = window.setTimeout(() => setUndoAction(null), 5200)
  }

  const celebrate = (origin: { x: number; y: number }) => {
    const id = ++burstId.current
    setBursts((current) => [...current, { id, ...origin }])
    window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id))
    }, 900)
  }

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined)
    return () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current)
    }
  }, [])

  useEffect(() => {
    if (selectedId !== null && !orderedIds.includes(selectedId)) {
      setSelectedId(orderedIds[0] ?? null)
      if (expandedId === selectedId) setExpandedId(null)
    }
  }, [orderedIds, selectedId, expandedId])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
      const interactive = typing || tag === 'BUTTON' || tag === 'A'

      if (event.key === '/' && !interactive) {
        event.preventDefault()
        inputRef.current?.focus()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        return
      }

      if (interactive) {
        if (event.key === 'Escape') {
          ;(target as HTMLElement)?.blur()
          setExpandedId(null)
        }
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(-1)
      } else if (event.key === 'Home' && orderedIds.length) {
        event.preventDefault()
        focusItem(orderedIds[0])
      } else if (event.key === 'End' && orderedIds.length) {
        event.preventDefault()
        focusItem(orderedIds[orderedIds.length - 1])
      } else if (event.key === 'Enter' && selectedId !== null) {
        event.preventDefault()
        setExpandedId((current) => current === selectedId ? null : selectedId)
      } else if (event.key === ' ' && selectedId !== null) {
        event.preventDefault()
        const item = orderedItems.find((candidate) => candidate.id === selectedId)
        const row = rowRefs.current.get(selectedId)
        if (item && row) {
          const rect = row.getBoundingClientRect()
          void completeItem(item, { x: rect.left + 22, y: rect.top + 31 })
        }
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId !== null) {
        event.preventDefault()
        const item = orderedItems.find((candidate) => candidate.id === selectedId)
        if (item) void deleteItem(item)
      } else if (event.key === 'Escape') {
        setExpandedId(null)
        setSelectedId(null)
        ;(document.activeElement as HTMLElement | null)?.blur?.()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  async function addItem(event: FormEvent) {
    event.preventDefault()
    const input = draft.trim()
    if (!input) return

    setDraft('')
    inputRef.current?.focus()

    const local = parseLocally(input)
    const now = new Date().toISOString()
    const id = await db.items.add({
      ...local,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    void refineWithServer(input).then(async (refined) => {
      if (!refined) return
      const current = await db.items.get(id)
      if (!current || current.completedAt || current.updatedAt !== now) return

      await db.items.update(id, {
        ...refined,
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async function updateItem(item: CueItem, patch: Partial<CueItem>) {
    if (!item.id) return
    await db.items.update(item.id, { ...patch, updatedAt: new Date().toISOString() })
  }

  async function completeItem(item: CueItem, origin: { x: number; y: number }) {
    if (!item.id || completingIds.has(item.id)) return
    const id = item.id

    setCompletingIds((current) => new Set(current).add(id))
    celebrate(origin)
    await new Promise((resolve) => window.setTimeout(resolve, 160))

    const now = new Date()
    let completionId: number | undefined

    if (item.recurrence) {
      const next = nextOccurrence(item, now)
      await db.transaction('rw', db.items, db.completions, async () => {
        completionId = await db.completions.add({
          itemId: id,
          completedAt: now.toISOString(),
          occurrenceAt: itemTime(item),
        })
        await db.items.update(id, {
          scheduledAt: item.scheduledAt ? next : null,
          dueAt: item.dueAt ? next : null,
          updatedAt: now.toISOString(),
        })
      })
    } else {
      await db.transaction('rw', db.items, db.completions, async () => {
        await db.items.update(id, {
          completedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        })
        completionId = await db.completions.add({
          itemId: id,
          completedAt: now.toISOString(),
          occurrenceAt: itemTime(item),
        })
      })
    }

    if (completionId === undefined) {
      throw new Error('Failed to record completion')
    }

    setCompletingIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setExpandedId((current) => current === id ? null : current)
    showUndo({ kind: 'complete', label: 'Done', item, completionId })
  }

  async function deleteItem(item: CueItem) {
    if (!item.id) return
    const id = item.id
    const completions = await db.completions.where('itemId').equals(id).toArray()

    await db.transaction('rw', db.items, db.completions, async () => {
      await db.items.delete(id)
      await db.completions.where('itemId').equals(id).delete()
    })

    setExpandedId((current) => current === id ? null : current)
    showUndo({ kind: 'delete', label: 'Deleted', item, completions })
  }

  async function undoLastAction() {
    if (!undoAction) return
    if (undoTimer.current) window.clearTimeout(undoTimer.current)

    if (undoAction.kind === 'complete') {
      await db.transaction('rw', db.items, db.completions, async () => {
        await db.items.put({ ...undoAction.item, updatedAt: new Date().toISOString() })
        await db.completions.delete(undoAction.completionId)
      })
      focusItem(undoAction.item.id!)
    } else {
      await db.transaction('rw', db.items, db.completions, async () => {
        await db.items.put(undoAction.item)
        if (undoAction.completions.length) await db.completions.bulkPut(undoAction.completions)
      })
      focusItem(undoAction.item.id!)
    }

    setUndoAction(null)
  }

  const sectionProps = {
    selectedId,
    expandedId,
    completingIds,
    onSelect: (item: CueItem) => setSelectedId(item.id ?? null),
    onToggleExpanded: (item: CueItem) => setExpandedId((current) => current === item.id ? null : item.id ?? null),
    onComplete: (item: CueItem, origin: { x: number; y: number }) => { void completeItem(item, origin) },
    onDelete: (item: CueItem) => { void deleteItem(item) },
    onUpdate: (item: CueItem, patch: Partial<CueItem>) => { void updateItem(item, patch) },
    registerRow,
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />
      <Confetti bursts={bursts} />

      <header className="topbar">
        <motion.a
          className="brand"
          href="#"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          aria-label="Cue home"
        >
          <span className="brand-mark"><CueMark /></span>
          <span>Cue</span>
        </motion.a>
      </header>

      <main className="board">
        <form className="composer" onSubmit={addItem}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.blur()
                setDraft('')
              }
            }}
            placeholder="Add a task..."
            autoComplete="off"
            spellCheck="true"
            aria-label="Add a task"
          />
          <AnimatePresence>
            {draft.trim() && (
              <motion.button
                type="submit"
                className="submit-button"
                initial={{ opacity: 0, scale: 0.72, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.72, rotate: 8 }}
                whileHover={{ y: -2, rotate: 3 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Add task"
              >
                <ArrowUp size={20} strokeWidth={3} />
              </motion.button>
            )}
          </AnimatePresence>
        </form>

        <div className="sections">
          <Section title="Today" tone="sun" items={grouped.today} {...sectionProps} />
          <Section title="Soon" tone="coral" items={grouped.soon} {...sectionProps} />
          <Section title="Anytime" tone="mint" items={grouped.anytime} {...sectionProps} />
          <Section title="Later" tone="violet" items={grouped.later} {...sectionProps} />
        </div>
      </main>

      <AnimatePresence>
        {undoAction && (
          <motion.div
            className="undo-toast"
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          >
            <span>{undoAction.label}</span>
            <button type="button" onClick={() => void undoLastAction()}>
              <RotateCcw size={14} /> Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
