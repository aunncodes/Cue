import { verifyToken } from '@clerk/backend'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function splitCsv(value) {
  if (typeof value !== 'string') return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function bearerToken(value) {
  const header = Array.isArray(value) ? value[0] : value
  if (typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function addVercelParty(parties, host) {
  if (!host) return
  const cleanHost = String(host).replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (cleanHost) parties.add(`https://${cleanHost}`)
}

function authorizedParties(env) {
  const parties = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...splitCsv(env.CUE_AUTHORIZED_PARTIES),
  ])

  addVercelParty(parties, env.VERCEL_URL)
  addVercelParty(parties, env.VERCEL_PROJECT_PRODUCTION_URL)
  addVercelParty(parties, env.VERCEL_BRANCH_URL)

  return [...parties]
}

function resetSeconds(result) {
  return result.reset > 1_000_000_000_000 ? Math.ceil(result.reset / 1000) : result.reset
}

function rateHeaders(prefix, result) {
  const reset = resetSeconds(result)
  return {
    [`X-RateLimit-${prefix}-Limit`]: String(result.limit),
    [`X-RateLimit-${prefix}-Remaining`]: String(Math.max(0, result.remaining)),
    [`X-RateLimit-${prefix}-Reset`]: String(reset),
  }
}

function retryAfter(result) {
  return String(Math.max(1, resetSeconds(result) - Math.floor(Date.now() / 1000)))
}

function error(status, message, headers = {}) {
  return { ok: false, status, body: { error: message }, headers }
}

export async function authorizeAiRequest({ authorization, clientIp, env = process.env }) {
  const secretKey = env.CLERK_SECRET_KEY?.trim()
  if (!secretKey) return error(503, 'Authentication is not configured')

  const token = bearerToken(authorization)
  if (!token) return error(401, 'Sign in to use AI parsing')

  let verified
  try {
    verified = await verifyToken(token, {
      secretKey,
      authorizedParties: authorizedParties(env),
    })
  } catch (authError) {
    console.warn('Cue auth rejected a request:', authError instanceof Error ? authError.message : authError)
    return error(401, 'Invalid session')
  }

  const userId = verified.sub
  if (!userId) return error(401, 'Invalid session')

  const admins = new Set(splitCsv(env.CUE_ADMIN_USER_IDS))
  if (admins.has(userId)) {
    return { ok: true, userId, isAdmin: true, headers: {} }
  }

  const redisUrl = env.KV_REST_API_URL?.trim()
  const redisToken = env.KV_REST_API_TOKEN?.trim()
  if (!redisUrl || !redisToken) {
    return error(503, 'AI rate limiting is not configured')
  }

  const minuteLimit = positiveInteger(env.CUE_RATE_LIMIT_PER_MINUTE, 20)
  const dailyLimit = positiveInteger(env.CUE_RATE_LIMIT_PER_DAY, 150)
  const ipMinuteLimit = positiveInteger(env.CUE_RATE_LIMIT_PER_IP_MINUTE, 60)
  const redis = new Redis({ url: redisUrl, token: redisToken })
  const ipMinuteLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(ipMinuteLimit, '1 m'),
    prefix: 'cue:ai:ip:minute',
  })
  const minuteLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(minuteLimit, '1 m'),
    prefix: 'cue:ai:minute',
  })
  const dailyLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(dailyLimit, '1 d'),
    prefix: 'cue:ai:day',
  })

  try {
    if (clientIp) {
      const ipMinute = await ipMinuteLimiter.limit(`ip:${clientIp}`)
      if (!ipMinute.success) {
        return error(429, 'Too many AI requests from this network', {
          ...rateHeaders('Ip-Minute', ipMinute),
          'Retry-After': retryAfter(ipMinute),
        })
      }
    }

    const minute = await minuteLimiter.limit(`user:${userId}`)
    const minuteHeaders = rateHeaders('Minute', minute)
    if (!minute.success) {
      return error(429, 'AI rate limit reached', {
        ...minuteHeaders,
        'Retry-After': retryAfter(minute),
      })
    }

    const daily = await dailyLimiter.limit(`user:${userId}`)
    const headers = { ...minuteHeaders, ...rateHeaders('Daily', daily) }
    if (!daily.success) {
      return error(429, 'Daily AI limit reached', {
        ...headers,
        'Retry-After': retryAfter(daily),
      })
    }

    return { ok: true, userId, isAdmin: false, headers }
  } catch (rateLimitError) {
    console.error('Cue rate limit check failed:', rateLimitError)
    return error(503, 'AI is temporarily unavailable')
  }
}
