import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 503 })
  }

  const supabase = await createClient()

  // Fetch all leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (!leads || leads.length === 0) {
    return NextResponse.json({ narrative: null, stats: null })
  }

  // Compute stats
  const total = leads.length
  const sent = leads.filter(l => ['sent','opened','clicked','replied','booked'].includes(l.status)).length
  const opened = leads.filter(l => ['opened','clicked','replied','booked'].includes(l.status)).length
  const replied = leads.filter(l => ['replied','booked'].includes(l.status)).length
  const booked = leads.filter(l => l.status === 'booked').length
  const bounced = leads.filter(l => l.status === 'bounced').length

  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0'
  const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : '0'
  const bookRate = sent > 0 ? ((booked / sent) * 100).toFixed(1) : '0'

  // By offer
  const offerMap: Record<string, { sent: number; replied: number; booked: number }> = {}
  for (const l of leads) {
    if (!['sent','opened','clicked','replied','booked'].includes(l.status)) continue
    if (!offerMap[l.offer]) offerMap[l.offer] = { sent: 0, replied: 0, booked: 0 }
    offerMap[l.offer].sent++
    if (['replied','booked'].includes(l.status)) offerMap[l.offer].replied++
    if (l.status === 'booked') offerMap[l.offer].booked++
  }

  // By CTA
  const ctaMap: Record<string, { sent: number; booked: number }> = {}
  for (const l of leads) {
    if (!['sent','opened','clicked','replied','booked'].includes(l.status)) continue
    if (!ctaMap[l.cta]) ctaMap[l.cta] = { sent: 0, booked: 0 }
    ctaMap[l.cta].sent++
    if (l.status === 'booked') ctaMap[l.cta].booked++
  }

  // Recent leads (last 7 days)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recent = leads.filter(l => l.created_at > since).length

  // Average website score
  const scores = leads.map(l => l.website_score).filter(Boolean) as number[]
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null

  const stats = {
    total, sent, opened, replied, booked, bounced,
    openRate, replyRate, bookRate,
    recent, avgScore,
    byOffer: offerMap,
    byCTA: ctaMap,
  }

  // Claude narrative
  const prompt = `You are an insight engine for a B2B outreach tool called LVRG Lead Magnet Engine.
Your job is to give a sharp, conversational summary of campaign performance — like a smart analyst talking to the founder.
Be direct. Use specific numbers. No fluff. No bullet walls. 2-4 short paragraphs max.
End with 1-2 concrete next-step recommendations.

Here is the current data:
- Total leads in system: ${total}
- Sent via email: ${sent}
- Opened: ${opened} (${openRate}% open rate)
- Replied: ${replied} (${replyRate}% reply rate)
- Calls booked: ${booked} (${bookRate}% book rate)
- Bounced: ${bounced}
- Leads added in last 7 days: ${recent}
- Avg website score of prospects: ${avgScore ?? 'N/A'}/10

Performance by Offer:
${Object.entries(offerMap).map(([offer, d]) =>
  `  ${offer}: ${d.sent} sent, ${d.replied} replies, ${d.booked} booked`
).join('\n') || '  No data yet'}

Performance by CTA:
${Object.entries(ctaMap).map(([cta, d]) =>
  `  "${cta}": ${d.sent} sent, ${d.booked} booked`
).join('\n') || '  No data yet'}

Write the insight summary now.`

  let narrative = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const json = await res.json()
    narrative = json.content?.[0]?.text || ''
  } catch (e) {
    console.error('Claude insights error:', e)
    narrative = ''
  }

  return NextResponse.json({ narrative, stats })
}
