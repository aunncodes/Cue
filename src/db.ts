import Dexie, { type EntityTable } from 'dexie'
import type { Completion, CueItem } from './types'

class CueDatabase extends Dexie {
  items!: EntityTable<CueItem, 'id'>
  completions!: EntityTable<Completion, 'id'>

  constructor() {
    super('cue')
    this.version(1).stores({
      items: '++id, kind, dueAt, scheduledAt, completedAt, createdAt, updatedAt',
      completions: '++id, itemId, completedAt',
    })
  }
}

export const db = new CueDatabase()
