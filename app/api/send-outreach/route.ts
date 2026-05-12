import { NextResponse } from 'next/server'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'
import { requireAuth } from '@/lib/auth-guard'

function misconfigured(msg: string) {
  return NextResponse.json({ error: msg }, { status: 503 })
}

export async function POST(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const instantlyKey = process.env.INSTANTLY_API_KEY?.trim()
  if (!instantlyKey) {
    return misconfigured('Server misconfigured: set INSTANTLY_API_KEY')
  }

  const sb = getSupabaseServiceContext()
  if (!sb) {
    return misconfigured('Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY')
  }

  try {
    const body = await req.json()
    const {
      queue_id,
      lead_id,
      email,
      subject,
      email_body,
      preview_url,
      business_name,
      owner_name,
      neighborhood,
      business_type,
      pain_point,
      hook,
      grade,
      campaign_id,   // passed from UI — TSD Campaign #1 or #2
    } = body

    if (!email || !subject || !email_body) {
      return NextResponse.json({ error: 'email, subject, and email_body are required' }, { status: 400 })
    }

    const useCampaignId = campaign_id?.trim() || process.env.INSTANTLY_CAMPAIGN_ID?.trim()
    if (!useCampaignId) {
      return NextResponse.json(
        { error: 'campaign_id required (or set INSTANTLY_CAMPAIGN_ID)' },
        { status: 400 }
      )
    }

    // Push to Instantly v2
    const instantlyRes = await fetch('https://api.instantly.ai/api/v2/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instantlyKey}` },
      body: JSON.stringify({
        campaign_id: useCampaignId,
        email,
        first_name: owner_name || '',
        last_name: '',
        company_name: business_name || '',
        custom_variables: {
          personalization: email_body,
          personalization_subject: subject,
          preview_url: preview_url || '',
          business_name: business_name || '',
          owner_name: owner_name || '',
          neighborhood: neighborhood || '',
          business_type: business_type || '',
          pain_point: pain_point || '',
          hook: hook || '',
          grade: String(grade ?? ''),
        },
      }),
    })

    if (!instantlyRes.ok) {
      const errText = await instantlyRes.text()
      console.error('Instantly v2 error:', errText)
      return NextResponse.json({ error: `Instantly API error: ${errText}` }, { status: 500 })
    }

    const instantlyData = await instantlyRes.json()
    const instantlyLeadId = instantlyData?.id || null
    const now = new Date().toISOString()

    const SH = { ...sb.headers, Prefer: 'return=representation' }

    // Mark engine_queue as sent
    if (queue_id) {
      await fetch(`${sb.restUrl}/engine_queue?id=eq.${queue_id}`, {
        method: 'PATCH', headers: SH,
        body: JSON.stringify({ status: 'sent', updated_at: now }),
      })
    }

    // Update leads table
    const leadUpdate = {
      status: 'sent', sent_at: now,
      instantly_lead_id: instantlyLeadId,
      instantly_campaign_id: useCampaignId,
      updated_at: now,
    }
    if (lead_id) {
      await fetch(`${sb.restUrl}/leads?id=eq.${lead_id}`, {
        method: 'PATCH', headers: SH, body: JSON.stringify(leadUpdate),
      })
    } else if (email) {
      await fetch(`${sb.restUrl}/leads?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH', headers: SH, body: JSON.stringify(leadUpdate),
      })
    }

    return NextResponse.json({ sent: true, instantly: instantlyData })
  } catch (e) {
    console.error('send-outreach error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
