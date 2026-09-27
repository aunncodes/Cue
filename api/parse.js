import { parseCueItem } from '../server/parse.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
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
