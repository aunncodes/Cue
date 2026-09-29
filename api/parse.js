import { authorizeAiRequest } from '../server/security.js'
import { parseCueItem } from '../server/parse.js'

function clientIp(req) {
  const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (typeof value === 'string' && value) return value.split(',')[0].trim()
  return req.socket?.remoteAddress || undefined
}

function applyHeaders(res, headers) {
  for (const [name, value] of Object.entries(headers || {})) {
    res.setHeader(name, value)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const access = await authorizeAiRequest({
    authorization: req.headers.authorization,
    clientIp: clientIp(req),
    env: process.env,
  })
  applyHeaders(res, access.headers)

  if (!access.ok) {
    return res.status(access.status).json(access.body)
  }

  const result = await parseCueItem({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.CUE_AI_MODEL || 'gpt-6-luna',
    input: req.body?.input,
    now: req.body?.now,
    timeZone: req.body?.timeZone,
  })

  return res.status(result.status).json(result.body)
}
