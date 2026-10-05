import Dexie, { type EntityTable } from 'dexie'
import type { Completion, CueItem, CueMetadata } from './types'

class CueDatabase extends Dexie {
  items!: EntityTable<CueItem, 'id'>
  completions!: EntityTable<Completion, 'id'>
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
  }
}

export const db = new CueDatabase()
