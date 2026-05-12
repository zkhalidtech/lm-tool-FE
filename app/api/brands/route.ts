import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// GET /api/brands — list all brands
export async function GET() {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/brands — create a brand
export async function POST(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const supabase = await createClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('brands')
    .insert(body)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
