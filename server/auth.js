import { verifyToken } from '@clerk/backend'

function splitCsv(value) {
  if (typeof value !== 'string') return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
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

function error(status, message) {
  return { ok: false, status, body: { error: message } }
}

export { splitCsv }

export async function authorizeRequest({ authorization, env = process.env }) {
  const secretKey = env.CLERK_SECRET_KEY?.trim()
  if (!secretKey) return error(503, 'Authentication is not configured')

  const token = bearerToken(authorization)
  if (!token) return error(401, 'Sign in required')

  try {
    const verified = await verifyToken(token, {
      secretKey,
      authorizedParties: authorizedParties(env),
    })

    if (!verified.sub) return error(401, 'Invalid session')
    return { ok: true, userId: verified.sub }
  } catch (authError) {
    console.warn('Cue auth rejected a request:', authError instanceof Error ? authError.message : authError)
    return error(401, 'Invalid session')
  }
}
