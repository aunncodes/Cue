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
  syncId: string
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
  deletedAt: string | null
}

export type Completion = {
  id?: number
  syncId: string
  itemId: number
  itemSyncId: string
  completedAt: string
  occurrenceAt: string | null
  updatedAt: string
  deletedAt: string | null
}

export type CueMetadata = {
  key: string
  value: number
}

export type ParsedCueItem = Pick<
  CueItem,
  'title' | 'kind' | 'dueAt' | 'scheduledAt' | 'durationMinutes' | 'flexibility' | 'recurrence'
>
