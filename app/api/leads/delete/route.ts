import { NextResponse } from 'next/server'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'
import { requireAuth } from '@/lib/auth-guard'

export async function DELETE(req: Request) {
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
    const { ids } = await req.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }

    const res = await fetch(`${sb.restUrl}/leads?id=in.(${ids.join(',')})`, {
      method: 'DELETE',
      headers: { ...sb.headers, Prefer: 'return=minimal' },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: 500 })
    }
    return NextResponse.json({ ok: true, deleted: ids.length })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
