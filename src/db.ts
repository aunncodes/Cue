import Dexie, { type EntityTable } from 'dexie'
import type {
  Completion,
  CueItem,
  CueMetadata,
  CueSuggestion,
  KnowledgeEdge,
  KnowledgeFact,
  KnowledgeNode,
  KnowledgeSource,
} from './types'

class CueDatabase extends Dexie {
  items!: EntityTable<CueItem, 'id'>
  completions!: EntityTable<Completion, 'id'>
  nodes!: EntityTable<KnowledgeNode, 'id'>
  edges!: EntityTable<KnowledgeEdge, 'id'>
  facts!: EntityTable<KnowledgeFact, 'id'>
  sources!: EntityTable<KnowledgeSource, 'id'>
  suggestions!: EntityTable<CueSuggestion, 'id'>
  metadata!: EntityTable<CueMetadata, 'key'>

  constructor() {
    super('cue')

    this.version(1).stores({
      items: '++id, kind, dueAt, scheduledAt, completedAt, createdAt, updatedAt',
      completions: '++id, itemId, completedAt',
    })

    this.version(2).stores({
      items: '++id, &syncId, kind, dueAt, scheduledAt, completedAt, createdAt, updatedAt, deletedAt',
      completions: '++id, &syncId, itemId, itemSyncId, completedAt, updatedAt, deletedAt',
      metadata: '&key',
    })

    this.version(3).stores({
      items: '++id, &syncId, kind, dueAt, scheduledAt, completedAt, createdAt, updatedAt, deletedAt',
      completions: '++id, &syncId, itemId, itemSyncId, completedAt, updatedAt, deletedAt',
      nodes: '&id, type, title, updatedAt, deletedAt',
      edges: '&id, fromId, toId, type, updatedAt, deletedAt',
      facts: '&id, subjectId, key, status, updatedAt, deletedAt',
      sources: '&id, kind, createdAt, updatedAt, deletedAt',
      suggestions: '&id, status, type, priority, createdAt, updatedAt, deletedAt',
      metadata: '&key',
    })
  }
}

export const db = new CueDatabase()
