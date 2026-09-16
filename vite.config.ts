import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Dev-only: serve GET /api/earnings-calendar from the Vercel handler so
 * `npm run dev` can exercise the News calendar without `vercel dev`.
 * Production still uses the Vercel function. Does not touch Claude routes.
 */
function earningsCalendarDevApi(): Plugin {
  return {
    name: 'earnings-calendar-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/earnings-calendar')) return next()
        try {
          const mod = await import('./api/earnings-calendar.ts')
          const handler = mod.default as (
            req: IncomingMessage & { query: Record<string, string> },
            res: {
              status: (code: number) => unknown
              json: (body: unknown) => unknown
              setHeader: (k: string, v: string) => unknown
            },
          ) => Promise<unknown>
          const parsed = new URL(url, 'http://localhost')
          const query = Object.fromEntries(parsed.searchParams)
          let statusCode = 200
          const vRes = {
            setHeader(k: string, v: string) {
              res.setHeader(k, v)
              return vRes
            },
            status(code: number) {
              statusCode = code
              res.statusCode = code
              return vRes
            },
            json(body: unknown) {
              res.statusCode = statusCode
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
              return vRes
            },
          }
          await handler(Object.assign(req, { query }), vRes)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), earningsCalendarDevApi()],
})
