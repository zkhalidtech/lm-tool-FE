import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic'

const ENGINE_URL    = process.env.ENGINE_URL    || 'https://lvrg-engine-production.up.railway.app'
const ENGINE_URL_V2 = process.env.ENGINE_URL_V2 || 'https://lvrg-engine-v2-production.up.railway.app'

export async function POST(req: NextRequest) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const { domain, no_deploy, offer, cta, notes, engine_v2 } = await req.json()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Independent heartbeat — fires every 8s regardless of what the engine is doing
      // SSE comment lines (: ping) are invisible to the browser but keep the connection alive
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) } catch {}
      }, 8000)

      try {
        const url = engine_v2 ? ENGINE_URL_V2 : ENGINE_URL
        const engineSecret = process.env.ENGINE_SECRET
        const res = await fetch(`${url}/build`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(engineSecret ? { 'X-Engine-Secret': engineSecret } : {}),
          },
          body: JSON.stringify({
            domain,
            no_deploy: no_deploy ?? false,
            offer: offer ?? 'Smart Site',
            cta: cta ?? 'Book a Call',
            notes: notes ?? '',
          }),
          signal: AbortSignal.timeout(300000), // 5 min hard cap
        })

        if (!res.ok) {
          send({ type: 'error', text: `Engine returned ${res.status}` })
          send({ type: 'done' })
          return
        }

        if (!res.body) {
          send({ type: 'error', text: 'No response body from engine' })
          send({ type: 'done' })
          return
        }

        // Stream SSE from engine straight through to browser
        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(encoder.encode(decoder.decode(value, { stream: true })))
        }

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Engine connection failed'
        send({ type: 'error', text: msg })
        send({ type: 'done' })
      } finally {
        clearInterval(heartbeat)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
