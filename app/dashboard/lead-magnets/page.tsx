export const dynamic = 'force-dynamic'

import LeadMagnetsClient from './LeadMagnetsClient'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'

async function supaFetch(
  restUrl: string,
  headers: Record<string, string>,
  path: string
) {
  const res = await fetch(`${restUrl}${path}`, {
    headers: { ...headers, Prefer: 'return=representation' },
    cache: 'no-store',
  })
  if (!res.ok) { console.error('supaFetch error', res.status, await res.text()); return [] }
  return res.json()
}

export default async function LeadMagnetsPage() {
  const sb = getSupabaseServiceContext()
  if (!sb) {
    return (
      <div className="p-8 text-zinc-400 text-sm">
        Lead Magnets need{' '}
        <code className="text-amber-400">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
        <code className="text-amber-400">SUPABASE_SERVICE_KEY</code> on the server.
      </div>
    )
  }

  const leads: Record<string, unknown>[] = await supaFetch(
    sb.restUrl,
    sb.headers,
    '/leads?select=id,domain,company_name,email,phone,preview_url,website_score,status,created_at,updated_at,sent_at,opened_at,replied_at&status=in.(built,sent)&order=updated_at.desc'
  )

  // Fetch engine_queue for email_json (subject lines) — keyed by domain
  const domains = leads.map(l => l.domain as string).filter(Boolean)
  let emailMap: Record<string, { subject_a?: string; subject_b?: string; subject_c?: string; body?: string; recommended_subject?: string }> = {}

  if (domains.length > 0) {
    const domainList = domains.map(d => `"${d}"`).join(',')
    const queueRows: Record<string, unknown>[] = await supaFetch(
      sb.restUrl,
      sb.headers,
      `/engine_queue?select=domain,email_json,angle,pain_point,primary_color&domain=in.(${encodeURIComponent(domainList)})`
    )
    for (const row of queueRows) {
      if (row.domain) emailMap[row.domain as string] = {
        ...((row.email_json as object) || {}),
        _angle: row.angle,
        _pain_point: row.pain_point,
        _primary_color: row.primary_color,
      } as typeof emailMap[string] & { _angle?: string; _pain_point?: string; _primary_color?: string }
    }
  }

  const allSites = leads.map(l => {
    const extra = (emailMap[l.domain as string] || {}) as Record<string, unknown>
    const hook        = l.hook as string | undefined
    const neighborhood  = l.neighborhood as string | undefined
    const owner_name    = l.owner_name as string | undefined
    const business_type = l.business_type as string | undefined
    const pain_point_lead = l.pain_point as string | undefined
    const score = l.website_score as number | null
    return {
      id:             l.id as string,
      domain:         l.domain as string,
      business_name:  (l.company_name || l.domain) as string,
      email:          l.email as string | null,
      phone:          l.phone as string | null,
      preview_url:    l.preview_url as string | null,
      website_score:  score,
      status:         l.status as string,
      created_at:     l.created_at as string,
      updated_at:     l.updated_at as string,
      sent_at:        l.sent_at as string | null,
      opened_at:      l.opened_at as string | null,
      replied_at:     l.replied_at as string | null,
      angle:          hook || (extra._angle as string) || (score != null && score <= 5 ? 'new_site' : 'live_chat'),
      pain_point:     pain_point_lead || (extra._pain_point as string) || null,
      primary_color:  (extra._primary_color as string) || '#f59e0b',
      subject_a:      extra.subject_a as string | undefined,
      subject_b:      extra.subject_b as string | undefined,
      subject_c:      extra.subject_c as string | undefined,
      email_body:     extra.body as string | undefined,
      recommended_subject: (extra.recommended_subject as string) || 'b',
      owner_name:     owner_name || '',
      neighborhood:   neighborhood || '',
      business_type:  business_type || '',
      hook:           hook || '',
      grade:          score,
    }
  })

  return <LeadMagnetsClient initialSites={allSites} />
}
