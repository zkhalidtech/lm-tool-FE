import { NextResponse } from 'next/server'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'
import { requireAuth } from '@/lib/auth-guard'

export async function PATCH(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const sb = getSupabaseServiceContext()
  if (!sb) {
    return NextResponse.json(
      { error: 'Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY' },
      { status: 503 }
    )
  }
  try {
    const { id, email, phone } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const update: Record<string, string> = { updated_at: new Date().toISOString() }
    if (email !== undefined) update.email = email
    if (phone !== undefined) update.phone = phone

    const res = await fetch(`${sb.restUrl}/leads?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...sb.headers, Prefer: 'return=representation' },
      body: JSON.stringify(update),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
