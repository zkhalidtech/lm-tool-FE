import { NextResponse } from 'next/server'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'
import { requireAuth } from '@/lib/auth-guard'

const DEFAULT_BRAND_ID = '0be94239-82c7-440e-80ef-171033694fb5'

function misconfigured() {
  return NextResponse.json(
    { error: 'Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY' },
    { status: 503 }
  )
}

export async function POST(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const sb = getSupabaseServiceContext()
  if (!sb) return misconfigured()
  try {
    const body = await req.json()
    const { prospects, domains, session_id, brand_id = DEFAULT_BRAND_ID } = body

    // Support both {prospects:[...]} and {domains:[...]} shapes
    const items: string[] = domains || []
    const prospectList = prospects || items.map((d: string) => ({ domain: d }))

    if (!prospectList || prospectList.length === 0) {
      return NextResponse.json({ error: 'No prospects provided' }, { status: 400 })
    }

    const rows = prospectList.map((p: {
      domain: string
      business_name?: string
      email?: string
      phone?: string
      pain_point?: string
      primary_color?: string
      website_score?: number
      angle?: string
      notes?: string
    }) => ({
      brand_id,
      domain: p.domain,
      business_name: p.business_name || p.domain,
      email: p.email || null,
      phone: p.phone || null,
      pain_point: p.pain_point || null,
      primary_color: p.primary_color || '#1a1a2e',
      website_score: p.website_score || null,
      angle: p.angle || null,
      status: 'queued',
      session_id: session_id || null,
    }))

    const res = await fetch(`${sb.restUrl}/engine_queue?on_conflict=domain`, {
      method: 'POST',
      headers: {
        ...sb.headers,
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('engine-queue insert error:', data)
      return NextResponse.json({ error: data.message || 'Insert failed' }, { status: 500 })
    }

    return NextResponse.json({ added: Array.isArray(data) ? data.length : 0, items: data })
  } catch (e) {
    console.error('engine-queue error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const sb = getSupabaseServiceContext()
  if (!sb) return misconfigured()
  try {
    const { searchParams } = new URL(req.url)
    const brand_id = searchParams.get('brand_id') || DEFAULT_BRAND_ID
    const status = searchParams.get('status')

    let url = `${sb.restUrl}/engine_queue?select=*&brand_id=eq.${brand_id}&order=created_at.desc`
    if (status) url += `&status=eq.${status}`

    const res = await fetch(url, {
      headers: { ...sb.headers, Prefer: 'return=representation' },
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: 500 })
    return NextResponse.json({ items: data || [] })
  } catch (e) {
    console.error('engine-queue GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const sb = getSupabaseServiceContext()
  if (!sb) return misconfigured()
  try {
    const body = await req.json()
    const { id, status } = body

    if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

    const allowed = ['queued', 'paused', 'building', 'built', 'sent']
    if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    const res = await fetch(`${sb.restUrl}/engine_queue?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...sb.headers, Prefer: 'return=representation' },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: 500 })
    return NextResponse.json({ item: Array.isArray(data) ? data[0] : data })
  } catch (e) {
    console.error('engine-queue PATCH error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const sb = getSupabaseServiceContext()
  if (!sb) return misconfigured()
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const clear = searchParams.get('clear')
    const brand_id = searchParams.get('brand_id') || DEFAULT_BRAND_ID

    if (clear === 'true') {
      const res = await fetch(`${sb.restUrl}/engine_queue?brand_id=eq.${brand_id}&status=in.(queued,paused)`, {
        method: 'DELETE',
        headers: sb.headers,
      })
      if (!res.ok) { const d = await res.json(); return NextResponse.json({ error: d.message }, { status: 500 }) }
      return NextResponse.json({ cleared: true })
    }

    if (!id) return NextResponse.json({ error: 'id or clear=true required' }, { status: 400 })

    const res = await fetch(`${sb.restUrl}/engine_queue?id=eq.${id}`, {
      method: 'DELETE',
      headers: sb.headers,
    })
    if (!res.ok) { const d = await res.json(); return NextResponse.json({ error: d.message }, { status: 500 }) }
    return NextResponse.json({ deleted: id })
  } catch (e) {
    console.error('engine-queue DELETE error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
