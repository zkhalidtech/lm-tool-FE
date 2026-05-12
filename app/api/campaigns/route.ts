import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  '-1': { label: 'Bounced', color: 'red' },
  0:   { label: 'Pending', color: 'zinc' },
  1:   { label: 'Queued', color: 'blue' },
  2:   { label: 'Contacted', color: 'amber' },
  3:   { label: 'Sent', color: 'green' },
  4:   { label: 'Replied', color: 'purple' },
  5:   { label: 'Interested', color: 'emerald' },
  6:   { label: 'Meeting Booked', color: 'emerald' },
}

export async function GET() {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const instantlyKey = process.env.INSTANTLY_API_KEY?.trim()
  if (!instantlyKey) {
    return NextResponse.json({ error: 'Missing INSTANTLY_API_KEY' }, { status: 503 })
  }
  try {
    // Fetch all campaigns
    const campaignsRes = await fetch('https://api.instantly.ai/api/v2/campaigns?limit=20', {
      headers: { 'Authorization': `Bearer ${instantlyKey}` },
      next: { revalidate: 60 }
    })
    const campaignsData = await campaignsRes.json()
    const campaigns = campaignsData.items || []

    // Fetch all leads across all campaigns (no campaign filter)
    const leadsRes = await fetch('https://api.instantly.ai/api/v2/leads/list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instantlyKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ limit: 100 }),
    })
    const leadsData = await leadsRes.json()
    const leads = leadsData.items || []
    console.log(`Fetched ${leads.length} leads, campaign IDs:`, [...new Set(leads.map((l: any) => l.campaign))])

    // Build stats per campaign
    const campaignStats = campaigns.map((c: any) => {
      const campaignLeads = leads.filter((l: any) => l.campaign === c.id)
      const sent = campaignLeads.filter((l: any) => l.status === 3).length
      const bounced = campaignLeads.filter((l: any) => l.status === -1).length
      const replied = campaignLeads.filter((l: any) => l.status === 4 || l.status === 5 || l.status === 6).length
      const opens = campaignLeads.reduce((sum: number, l: any) => sum + (l.email_open_count || 0), 0)
      const clicks = campaignLeads.reduce((sum: number, l: any) => sum + (l.email_click_count || 0), 0)
      const total = campaignLeads.length

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        created: c.timestamp_created,
        total,
        sent,
        opens,
        clicks,
        replied,
        bounced,
        openRate: total > 0 ? Math.round((opens / total) * 100) : 0,
        replyRate: total > 0 ? Math.round((replied / total) * 100) : 0,
      }
    })

    // Recent leads across all campaigns (last 50)
    const recentLeads = leads.slice(0, 50).map((l: any) => ({
      id: l.id,
      email: l.email,
      firstName: l.first_name,
      companyName: l.company_name,
      website: l.website,
      campaignId: l.campaign,
      status: l.status,
      statusLabel: STATUS_MAP[l.status]?.label || 'Unknown',
      statusColor: STATUS_MAP[l.status]?.color || 'zinc',
      opens: l.email_open_count || 0,
      replies: l.email_reply_count || 0,
      lastContact: l.timestamp_last_contact,
    }))

    return NextResponse.json({ campaigns: campaignStats, leads: recentLeads })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch campaign data' }, { status: 500 })
  }
}
