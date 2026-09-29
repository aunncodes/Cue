import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { authorizeAiRequest } from './server/security.js'
import { parseCueItem } from './server/parse.js'

function localApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'cue-local-api',
    configureServer(server) {
      server.middlewares.use('/api/parse', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const access = await authorizeAiRequest({
            authorization: req.headers.authorization,
            clientIp: req.socket.remoteAddress,
            env,
          })

          for (const [name, value] of Object.entries(access.headers || {})) {
            res.setHeader(name, value)
          }

          if (!access.ok) {
            res.statusCode = access.status
            res.end(JSON.stringify(access.body))
            return
          }

          let rawBody = ''
          req.setEncoding('utf8')
          for await (const chunk of req) rawBody += chunk

          const body = rawBody ? JSON.parse(rawBody) : {}
          const result = await parseCueItem({
            apiKey: env.OPENAI_API_KEY,
            model: env.CUE_AI_MODEL || 'gpt-6-luna',
            input: body.input,
            now: body.now,
            timeZone: body.timeZone,
          })

          res.statusCode = result.status
          res.end(JSON.stringify(result.body))
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid request' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react(), localApiPlugin(env)],
  }
})
