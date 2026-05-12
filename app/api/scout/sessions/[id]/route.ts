import { NextResponse } from 'next/server'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'
import { requireAuth } from '@/lib/auth-guard'

function misconfigured() {
  return NextResponse.json(
    { error: 'Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY' },
    { status: 503 }
  )
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const sb = getSupabaseServiceContext()
  if (!sb) return misconfigured()
  try {
    const { id } = await params
    const res = await fetch(
      `${sb.restUrl}/scout_sessions?select=id,session_name,prospects,messages,created_at,updated_at&id=eq.${id}`,
      { headers: sb.headers }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message ?? 'Database error' }, { status: 500 })
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({ session: data[0] })
  } catch (e) {
    console.error('session GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
