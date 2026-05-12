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

export async function PATCH(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const sb = getSupabaseServiceContext()
  if (!sb) return misconfigured()
  try {
    const { id, messages } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const res = await fetch(`${sb.restUrl}/scout_sessions?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...sb.headers, Prefer: 'return=representation' },
      body: JSON.stringify({ messages, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) { const d = await res.json(); return NextResponse.json({ error: d.message }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('sessions PATCH error:', e)
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

    const res = await fetch(
      `${sb.restUrl}/scout_sessions?select=id,session_name,created_at,prospects&brand_id=eq.${brand_id}&order=created_at.desc&limit=20`,
      { headers: { ...sb.headers, Prefer: 'return=representation' } }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: 500 })

    const sessions = (data || []).map((s: { id: string; session_name: string; created_at: string; prospects: unknown[] }) => ({
      id: s.id,
      session_name: s.session_name || 'Unnamed session',
      created_at: s.created_at,
      prospect_count: Array.isArray(s.prospects) ? s.prospects.length : 0,
    }))

    return NextResponse.json({ sessions })
  } catch (e) {
    console.error('sessions GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
