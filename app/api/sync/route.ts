import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

// Instantly lead status codes
// -1 = bounced, 1 = active, 2 = paused, 3 = completed

type InstantlyLead = {
  id: string
  email: string
  company_domain: string
  company_name: string
  status: number
  email_open_count: number
  email_reply_count: number
  email_click_count: number
  timestamp_last_contact: string
  campaign: string
}

// Maps Instantly signals to our pipeline status
// Priority order: booked > replied > clicked > opened > bounced > sent
function deriveStatus(lead: InstantlyLead): string | null {
  if (lead.status === -1) return 'bounced'
  if (lead.email_reply_count > 0) return 'replied'
  if (lead.email_click_count > 0) return 'clicked'
  if (lead.email_open_count > 0) return 'opened'
  return null // no change — keep existing status
}

async function fetchInstantlyLeads(campaignId: string, instantlyKey: string): Promise<InstantlyLead[]> {
  const all: InstantlyLead[] = []
  let startingAfter: string | null = null

  while (true) {
    const body: Record<string, unknown> = { campaign_id: campaignId, limit: 100 }
    if (startingAfter) body.starting_after = startingAfter

    const res = await fetch('https://api.instantly.ai/api/v2/leads/list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instantlyKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const json = await res.json()
    const items: InstantlyLead[] = json.items || []
    all.push(...items)

    if (!json.next_starting_after || items.length < 100) break
    startingAfter = json.next_starting_after
  }

  return all
}

async function fetchAllCampaigns(instantlyKey: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch('https://api.instantly.ai/api/v2/campaigns?limit=50', {
    headers: { 'Authorization': `Bearer ${instantlyKey}` },
  })
  const json = await res.json()
  return json.items || []
}

export async function POST(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const instantlyKey = process.env.INSTANTLY_API_KEY?.trim()
  if (!instantlyKey) {
    return NextResponse.json({ error: 'Missing INSTANTLY_API_KEY' }, { status: 503 })
  }

  // Optional: accept a single campaign_id to sync just one
  let campaignIds: string[] = []

  try {
    const body = await req.json().catch(() => ({}))
    if (body.campaign_id) {
      campaignIds = [body.campaign_id]
    } else {
      const campaigns = await fetchAllCampaigns(instantlyKey)
      campaignIds = campaigns.map(c => c.id)
    }
  } catch {
    const campaigns = await fetchAllCampaigns(instantlyKey)
    campaignIds = campaigns.map(c => c.id)
  }

  const supabase = await createClient()

  const results = {
    campaigns_synced: 0,
    leads_checked: 0,
    leads_updated: 0,
    events_logged: 0,
    errors: [] as string[],
  }

  for (const campaignId of campaignIds) {
    try {
      const instantlyLeads = await fetchInstantlyLeads(campaignId, instantlyKey)
      results.campaigns_synced++
      results.leads_checked += instantlyLeads.length

      for (const il of instantlyLeads) {
        const newStatus = deriveStatus(il)

        // Find matching lead in Supabase by email or domain
        const domain = il.company_domain?.replace(/^www\./, '').replace(/^https?:\/\//, '').replace(/\/$/, '')
        const { data: matches } = await supabase
          .from('leads')
          .select('id, status, email, domain')
          .or(`email.eq.${il.email},domain.eq.${domain}`)
          .limit(1)

        if (!matches || matches.length === 0) continue

        const lead = matches[0]

        // Status priority — never go backwards in the pipeline
        const STATUS_RANK: Record<string, number> = {
          queued: 0, building: 1, built: 2, sent: 3,
          opened: 4, clicked: 5, replied: 6, booked: 7, bounced: 8,
        }

        const currentRank = STATUS_RANK[lead.status] ?? 0
        const newRank = newStatus ? (STATUS_RANK[newStatus] ?? 0) : 0

        // Only update if new status is an advancement (or bounce)
        const shouldUpdate = newStatus && (newRank > currentRank || newStatus === 'bounced')

        if (shouldUpdate && newStatus) {
          const timestamps: Record<string, string> = {}
          if (newStatus === 'opened')  timestamps.opened_at  = new Date().toISOString()
          if (newStatus === 'replied') timestamps.replied_at = new Date().toISOString()

          await supabase
            .from('leads')
            .update({ status: newStatus, ...timestamps })
            .eq('id', lead.id)

          // Log the event
          await supabase.from('lead_events').insert({
            lead_id: lead.id,
            event: newStatus,
            metadata: {
              source: 'instantly_sync',
              campaign_id: campaignId,
              open_count: il.email_open_count,
              click_count: il.email_click_count,
              reply_count: il.email_reply_count,
              synced_at: new Date().toISOString(),
            },
          })

          results.leads_updated++
          results.events_logged++
        }
      }
    } catch (e) {
      results.errors.push(`Campaign ${campaignId}: ${String(e)}`)
    }
  }

  console.log('[sync] Complete:', results)
  return NextResponse.json(results)
}

// GET — can be called by Railway cron or health check
export async function GET() {
  const unauth = await requireAuth()
  if (unauth) return unauth
  // Trigger a full sync
  const res = await POST(new Request('http://localhost/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }))
  return res
}
