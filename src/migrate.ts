import { db } from './db'
import type { Completion, CueItem } from './types'

const DATA_VERSION_KEY = 'dataVersion'
export const CURRENT_DATA_VERSION = 2

type LegacyCueItem = CueItem & {
  syncId?: string
  deletedAt?: string | null
}

type LegacyCompletion = Completion & {
  syncId?: string
  itemSyncId?: string
  updatedAt?: string
  deletedAt?: string | null
}

async function migrateToVersion2() {
  const items = await db.items.toArray() as LegacyCueItem[]
  const itemSyncIds = new Map<number, string>()

  for (const item of items) {
    if (item.id === undefined) continue

    const syncId = item.syncId || crypto.randomUUID()
    itemSyncIds.set(item.id, syncId)

    await db.items.update(item.id, {
      syncId,
      deletedAt: item.deletedAt ?? null,
    })
  }

  const completions = await db.completions.toArray() as LegacyCompletion[]

  for (const completion of completions) {
    if (completion.id === undefined) continue

    const itemSyncId = completion.itemSyncId || itemSyncIds.get(completion.itemId)
    const orphaned = !itemSyncId
    const updatedAt = completion.updatedAt || completion.completedAt

    await db.completions.update(completion.id, {
      syncId: completion.syncId || crypto.randomUUID(),
      itemSyncId: itemSyncId || crypto.randomUUID(),
      updatedAt,
      deletedAt: completion.deletedAt ?? (orphaned ? updatedAt : null),
    })
  }
}

const migrations = new Map<number, () => Promise<void>>([
  [2, migrateToVersion2],
])

export async function migrateDatabase() {
  await db.open()

  const stored = await db.metadata.get(DATA_VERSION_KEY)
  let version = typeof stored?.value === 'number' ? stored.value : 1

  if (version > CURRENT_DATA_VERSION) {
    throw new Error(`Cue data version ${version} is newer than this app supports (${CURRENT_DATA_VERSION}).`)
  }

  while (version < CURRENT_DATA_VERSION) {
    const nextVersion = version + 1
    const migrate = migrations.get(nextVersion)

    if (!migrate) {
      throw new Error(`Missing Cue data migration for version ${nextVersion}.`)
    }

    await db.transaction('rw', db.items, db.completions, db.metadata, async () => {
      await migrate()
      await db.metadata.put({ key: DATA_VERSION_KEY, value: nextVersion })
    })

    version = nextVersion
  }
}
