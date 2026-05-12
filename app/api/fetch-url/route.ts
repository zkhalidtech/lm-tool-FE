import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// GET /api/fetch-url?url=https://...
// Lightweight server-side proxy to fetch a URL's text content for brand parsing
export async function GET(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LVRGBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await res.text()
    // Strip tags, collapse whitespace — good enough for Claude to parse
    const content = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 12000)
    return NextResponse.json({ content })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 500 })
  }
}
