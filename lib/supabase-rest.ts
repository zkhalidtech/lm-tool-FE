/**
 * Server-side Supabase REST using the service role key.
 * Never expose SUPABASE_SERVICE_KEY to the browser or commit it.
 */

export type SupabaseServiceContext = {
  restUrl: string
  headers: Record<string, string>
}

export function getSupabaseServiceContext(): SupabaseServiceContext | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY?.trim()
  if (!base || !key) return null
  return {
    restUrl: `${base}/rest/v1`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  }
}
