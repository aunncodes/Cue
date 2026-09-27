export type ItemKind = 'task' | 'event'
export type Flexibility = 'flexible' | 'hard'
export type RecurrenceUnit = 'day' | 'week' | 'month'
export type RecurrenceMode = 'schedule' | 'after_completion'

export type RecurrenceRule = {
  interval: number
  unit: RecurrenceUnit
  daysOfWeek: number[]
  mode: RecurrenceMode
}

export type CueItem = {
  id?: number
  title: string
  kind: ItemKind
  dueAt: string | null
  scheduledAt: string | null
  durationMinutes: number | null
  flexibility: Flexibility
  recurrence: RecurrenceRule | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Completion = {
  id?: number
  itemId: number
  completedAt: string
  occurrenceAt: string | null
}

export type ParsedCueItem = Pick<
  CueItem,
  'title' | 'kind' | 'dueAt' | 'scheduledAt' | 'durationMinutes' | 'flexibility' | 'recurrence'
>
