import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// PATCH /api/brands/[id] — update a brand
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const { id } = await params
  const supabase = await createClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('brands')
    .update(body)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/brands/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('brands').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
