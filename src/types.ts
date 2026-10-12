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
  relatedNodeIds: string[]
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

export type KnowledgeNode = {
  id: string
  type: string
  title: string
  summary: string
  aliases: string[]
  confidence: number
  sourceIds: string[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type KnowledgeEdge = {
  id: string
  fromId: string
  toId: string
  type: string
  confidence: number
  sourceId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type KnowledgeFact = {
  id: string
  subjectId: string
  key: string
  value: string
  note: string | null
  confidence: number
  sourceId: string | null
  status: 'current' | 'outdated'
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type KnowledgeSource = {
  id: string
  kind: 'input' | 'clarification' | 'import'
  content: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type SuggestionStatus = 'pending' | 'answered' | 'dismissed'

export type CueSuggestion = {
  id: string
  type: string
  question: string
  options: string[]
  priority: number
  sourceId: string | null
  status: SuggestionStatus
  answer: string | null
  createdAt: string
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

export type LunaEntity = {
  existingId: string | null
  type: string
  title: string
  summary: string
  confidence: number
}

export type LunaFact = {
  entityIndex: number
  key: string
  value: string
  note: string | null
  confidence: number
}

export type LunaRelation = {
  fromEntityIndex: number
  toEntityIndex: number
  type: string
  confidence: number
}

export type LunaSuggestion = {
  type: string
  question: string
  options: string[]
  priority: number
}

export type LunaUnderstanding = {
  kind: 'task' | 'context' | 'both'
  action: ParsedCueItem | null
  entities: LunaEntity[]
  facts: LunaFact[]
  relations: LunaRelation[]
  taskEntityIndexes: number[]
  suggestions: LunaSuggestion[]
}
