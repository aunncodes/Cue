import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, Check, Clock3, Ellipsis, Repeat2, Trash2 } from 'lucide-react'
import { db } from './db'
import { parseLocally, refineWithServer } from './ai'
import { describeRecurrence, nextOccurrence } from './recurrence'
import type { CueItem } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

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

function ItemRow({
  item,
  onComplete,
  onDelete,
}: {
  item: CueItem
  onComplete: (item: CueItem) => void
  onDelete: (item: CueItem) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const meta = itemMeta(item)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 26, scale: 0.98, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 430, damping: 31 }}
      className={`task-row ${item.kind === 'event' ? 'task-row-event' : ''}`}
    >
      <motion.button
        type="button"
        className="check-button"
        onClick={() => onComplete(item)}
        whileTap={{ scale: 0.82 }}
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

      <div className="row-menu-wrap">
        <button
          type="button"
          className="row-menu"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Task actions"
        >
          <Ellipsis size={18} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="context-menu"
              initial={{ opacity: 0, y: -5, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.96 }}
              transition={{ duration: 0.12 }}
            >
              <button type="button" onClick={() => onDelete(item)}>
                <Trash2 size={14} /> Delete
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function Section({
  title,
  tone,
  items,
  onComplete,
  onDelete,
}: {
  title: string
  tone: 'sun' | 'coral' | 'mint' | 'violet'
  items: CueItem[]
  onComplete: (item: CueItem) => void
  onDelete: (item: CueItem) => void
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
              onComplete={onComplete}
              onDelete={onDelete}
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined)

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (event.key === '/' && !typing) {
        event.preventDefault()
        inputRef.current?.focus()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
      if (!current || current.completedAt) return

      await db.items.update(id, {
        ...refined,
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async function completeItem(item: CueItem) {
    if (!item.id) return
    const now = new Date()

    if (item.recurrence) {
      const next = nextOccurrence(item, now)
      await db.transaction('rw', db.items, db.completions, async () => {
        await db.completions.add({
          itemId: item.id!,
          completedAt: now.toISOString(),
          occurrenceAt: itemTime(item),
        })
        await db.items.update(item.id!, {
          scheduledAt: item.scheduledAt ? next : null,
          dueAt: item.dueAt ? next : null,
          updatedAt: now.toISOString(),
        })
      })
      return
    }

    await db.transaction('rw', db.items, db.completions, async () => {
      await db.items.update(item.id!, {
        completedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      await db.completions.add({
        itemId: item.id!,
        completedAt: now.toISOString(),
        occurrenceAt: itemTime(item),
      })
    })
  }

  async function deleteItem(item: CueItem) {
    if (!item.id) return
    await db.transaction('rw', db.items, db.completions, async () => {
      await db.items.delete(item.id!)
      await db.completions.where('itemId').equals(item.id!).delete()
    })
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <header className="topbar">
        <motion.a
          className="brand"
          href="#"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          aria-label="Cue home"
        >
          <span className="brand-mark" aria-hidden="true">›</span>
          <span>Cue</span>
        </motion.a>
      </header>

      <main className="board">
        <form className="composer" onSubmit={addItem}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
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
          <Section title="Today" tone="sun" items={grouped.today} onComplete={completeItem} onDelete={deleteItem} />
          <Section title="Soon" tone="coral" items={grouped.soon} onComplete={completeItem} onDelete={deleteItem} />
          <Section title="Anytime" tone="mint" items={grouped.anytime} onComplete={completeItem} onDelete={deleteItem} />
          <Section title="Later" tone="violet" items={grouped.later} onComplete={completeItem} onDelete={deleteItem} />
        </div>
      </main>
    </div>
  )
}
