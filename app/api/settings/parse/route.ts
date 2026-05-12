import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// POST /api/settings/parse
// Body: { content: string } — raw .md text or scraped URL content
// Returns: structured brand fields extracted by Claude
export async function POST(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 503 })
  }

  const { content } = await req.json()
  if (!content) return NextResponse.json({ error: 'No content provided' }, { status: 400 })

  const prompt = `You are extracting brand settings from a document. 
Pull out the following fields and return ONLY valid JSON — no markdown, no explanation.

Fields to extract:
- name: brand/company name
- sender_name: first name of the person sending emails (if mentioned)
- sender_email: email address (if mentioned)
- sending_domain: domain for sending emails (if mentioned, otherwise null)
- offer_description: 1-2 sentences describing what they offer
- icp: who their ideal client is (1 sentence)
- differentiator: what makes them different / their edge (1 sentence)
- tone: one of "direct and conversational" | "friendly" | "professional" | "bold and punchy"
- booking_url: any booking, calendar, or CTA link mentioned (or null)
- default_offer: one of "Website Rebuild" | "Website Grade" | "Smart Site" | "AI Chat" — pick the closest match
- default_cta: one of "Book a Call" | "Claim Your Site" | "Get Your Grade" | "Watch Demo" — pick the closest match

If a field is not found, use null.

Document:
---
${content.slice(0, 8000)}
---

Return only the JSON object.`

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
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const json = await res.json()
    const text = json.content?.[0]?.text || '{}'
    // Strip any accidental markdown fences
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (e) {
    console.error('Parse error:', e)
    return NextResponse.json({ error: 'Failed to parse document' }, { status: 500 })
  }
}
