import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Returns a 401 Response if the request has no valid session, null if authenticated.
// DEV_BYPASS_AUTH=true skips the check to match the middleware dev bypass.
export async function requireAuth(): Promise<NextResponse | null> {
  if (process.env.DEV_BYPASS_AUTH === 'true') return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
