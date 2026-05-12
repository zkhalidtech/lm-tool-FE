import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || !/^[\w-]+$/.test(id)) {
    return new Response('Not found', { status: 404 })
  }

  const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/sites/${id}/index.html`

  let upstream: Response
  try {
    upstream = await fetch(storageUrl, { cache: 'no-store' })
  } catch {
    return new Response('Preview unavailable', { status: 502 })
  }

  if (!upstream.ok) {
    return new Response('Preview not found', { status: 404 })
  }

  const html = await upstream.text()

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
