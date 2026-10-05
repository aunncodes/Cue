import { Redis } from '@upstash/redis'
import { authorizeRequest } from '../server/auth.js'

const MAX_RECORDS = 5000

function newer(a, b) {
  return new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b
}

function validRecords(value) {
  return Array.isArray(value) &&
    value.length <= MAX_RECORDS &&
    value.every((record) =>
      record &&
      typeof record === 'object' &&
      typeof record.syncId === 'string' &&
      typeof record.updatedAt === 'string'
    )
}

async function mergeHash(redis, key, incoming) {
  const current = await redis.hgetall(key) || {}
  const writes = {}

  for (const record of incoming) {
    const existing = current[record.syncId]
    const winner = existing ? newer(record, existing) : record
    current[record.syncId] = winner

    if (!existing || winner === record) {
      writes[record.syncId] = record
    }
  }

  if (Object.keys(writes).length) {
    await redis.hset(key, writes)
  }

  return Object.values(current)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const access = await authorizeRequest({
    authorization: req.headers.authorization,
    env: process.env,
  })

  if (!access.ok) {
    return res.status(access.status).json(access.body)
  }

  const redisUrl = process.env.KV_REST_API_URL?.trim()
  const redisToken = process.env.KV_REST_API_TOKEN?.trim()
  if (!redisUrl || !redisToken) {
    return res.status(503).json({ error: 'Sync is not configured' })
  }

  const items = req.body?.items
  const completions = req.body?.completions
  if (!validRecords(items) || !validRecords(completions)) {
    return res.status(400).json({ error: 'Invalid sync payload' })
  }

  try {
    const redis = new Redis({ url: redisUrl, token: redisToken })
    const prefix = `cue:sync:${access.userId}`

    const [mergedItems, mergedCompletions] = await Promise.all([
      mergeHash(redis, `${prefix}:items`, items),
      mergeHash(redis, `${prefix}:completions`, completions),
    ])

    return res.status(200).json({
      items: mergedItems,
      completions: mergedCompletions,
    })
  } catch (error) {
    console.error('Cue sync failed:', error)
    return res.status(503).json({ error: 'Sync is temporarily unavailable' })
  }
}
