import { db } from './db'
import type { Completion, CueItem } from './types'

type SyncedItem = Omit<CueItem, 'id'>
type SyncedCompletion = Omit<Completion, 'id' | 'itemId'>

function withoutLocalItemId(item: CueItem): SyncedItem {
  const { id: _id, ...record } = item
  return record
}

function withoutLocalCompletionIds(completion: Completion): SyncedCompletion {
  const { id: _id, itemId: _itemId, ...record } = completion
  return record
}

function isNewer(remote: { updatedAt: string }, local: { updatedAt: string }) {
  return new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()
}

export async function syncCueData(token: string | null) {
  if (!token) return false

  const [items, completions] = await Promise.all([
    db.items.toArray(),
    db.completions.toArray(),
  ])

  let response: Response
  try {
    response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: items.map(withoutLocalItemId),
        completions: completions.map(withoutLocalCompletionIds),
      }),
    })
  } catch {
    return false
  }

  if (!response.ok) return false

  const data = await response.json() as {
    items: SyncedItem[]
    completions: SyncedCompletion[]
  }

  await db.transaction('rw', db.items, db.completions, async () => {
    for (const remote of data.items) {
      const local = await db.items.where('syncId').equals(remote.syncId).first()

      if (!local) {
        await db.items.add(remote)
      } else if (isNewer(remote, local)) {
        await db.items.update(local.id!, remote)
      }
    }

    const itemIds = new Map<string, number>()
    const mergedItems = await db.items.toArray()
    for (const item of mergedItems) {
      if (item.id !== undefined) itemIds.set(item.syncId, item.id)
    }

    for (const remote of data.completions) {
      const itemId = itemIds.get(remote.itemSyncId)
      if (itemId === undefined) continue

      const local = await db.completions.where('syncId').equals(remote.syncId).first()
      const record = { ...remote, itemId }

      if (!local) {
        await db.completions.add(record)
      } else if (isNewer(remote, local)) {
        await db.completions.update(local.id!, record)
      }
    }
  })

  return true
}
