import { NextResponse } from 'next/server'
import { getSupabaseServiceContext, type SupabaseServiceContext } from '@/lib/supabase-rest'
import { requireAuth } from '@/lib/auth-guard'

const DEFAULT_BRAND_ID = '0be94239-82c7-440e-80ef-171033694fb5'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Prospect = {
  domain: string
  business_name: string
  description: string
  location: string
  business_type: string
  website_score: number
  verdict: string
  worth_targeting: boolean
  borderline: boolean
  email: string | null
  phone: string | null
  pain_point: string
  why_good_target: string
  primary_color: string
  angle: 'new_site' | 'live_chat'
  angle_reason: string
}

type ClaudeMessage = {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_prospects',
    description: 'Search for local business websites matching a niche and location. Returns a list of domains to evaluate. Use this when you have enough context to start finding prospects.',
    input_schema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '3-5 Google search queries targeting independent local business websites. Mix angles for diversity.',
        },
        location: {
          type: 'string',
          description: 'Location string for search. Default: San Diego,California,United States',
        },
      },
      required: ['queries'],
    },
  },
  {
    name: 'scrape_and_grade',
    description: 'Read and grade a business website. Returns score, pain points, and recommended outreach angle. Call this for each domain returned by search_prospects.',
    input_schema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain to read and grade (e.g. communalcoffee.com)',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'save_to_queue',
    description: 'Save approved prospects to the engine queue for outreach. Call this after the user approves a set of prospects.',
    input_schema: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of domains to add to engine queue',
        },
      },
      required: ['domains'],
    },
  },
]

// ─── Tool implementations ─────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch { return url }
}

function isJunkDomain(domain: string): boolean {
  const junk = [
    // Directories & aggregators
    'yelp.com','tripadvisor.com','google.com','facebook.com','instagram.com',
    'doordash.com','grubhub.com','ubereats.com','opentable.com','resy.com',
    'timeout.com','eater.com','thrillist.com','zagat.com','foursquare.com',
    'yellowpages.com','bbb.org','bing.com','wikipedia.org','reddit.com',
    'tiktok.com','twitter.com','x.com','linkedin.com',
    'sandiego.org','visitsandiego.com','sdvoyager.com',
    // Media & blogs
    'sandiegoreader.com','sdmagazine.com','sandiegomagazine.com','sdvoyager.com',
    'sandiegouniontribune.com','voiceofsandiego.org','kpbs.org',
    'sandiegoville.com','discoversd.com','sdcitybeat.com',
    // Non-food business types
    'realestate','realtor','realty','insurance','mortgage','dental','medical',
    'law','attorney','accountant','cpa','finance','invest',
  ]
  return junk.some(j => domain.includes(j))
}

async function toolSearchProspects(
  queries: string[],
  location = 'San Diego,California,United States',
  send: (type: string, data?: object) => void,
  firecrawlKey: string,
): Promise<string> {
  const allUrls: string[] = []

  send('narrate', { text: `Running ${queries.length} searches...` })

  for (const query of queries) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit: 8, location, country: 'US', ignoreInvalidURLs: true }),
      })
      const json = await res.json()
      const urls = (json.data?.web || []).map((r: { url: string }) => r.url)
      allUrls.push(...urls)
    } catch {}
  }

  const domains = [...new Set(
    allUrls.map(extractDomain).filter(d => d && !isJunkDomain(d) && d.includes('.'))
  )]

  if (domains.length === 0) {
    return JSON.stringify({ error: 'No candidate sites found. Try different search terms.' })
  }

  send('narrate', { text: `Found ${domains.length} candidate sites. Reading them now...` })
  return JSON.stringify({ domains: domains.slice(0, 18), total: domains.length })
}

async function toolScrapeAndGrade(
  domain: string,
  send: (type: string, data?: object) => void,
  anthropicKey: string,
): Promise<string> {
  try {
    send('narrate', { text: `Reading ${domain}...` })

    const res = await fetch(`https://${domain}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LVRGScout/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 3500)

    if (text.length < 80) return JSON.stringify({ error: 'Could not read site content', domain })

    const gradeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `Grade this local business website for cold outreach. Domain: ${domain}

CONTENT: ${text}

We sell one product: Smart Site — a full new website with great brand look and feel, their photos and reviews baked in, AI live chat, booking/reservations, local SEO, and SMS/missed-call text-back. All prospects get a Smart Site. The cold outreach HOOK depends only on their score:

- Score 1-5 → angle: "new_site" — their current site is clearly the problem, we lead with "we built you a new site"
- Score 6-10 → angle: "live_chat" — site is decent but missing lead capture, we lead with "free AI Live Chat widget"

Return ONLY valid JSON:
{
  "business_name": "string",
  "description": "1 sentence",
  "location": "city/neighborhood",
  "business_type": "restaurant|bar|coffee_shop|catering|food_truck|bakery|brewery|winery|cocktail_bar|other",
  "email": "string or null",
  "phone": "string or null",
  "primary_color": "#hex",
  "is_chain_or_franchise": false,
  "website_score": 1-10,
  "pain_point": "biggest conversion weakness in one sentence",
  "why_good_target": "one sentence on why they'd respond to outreach",
  "angle": "new_site|live_chat",
  "angle_reason": "one sentence: why this opening hook fits this specific business",
  "worth_targeting": true/false,
  "borderline": false
}

worth_targeting: true if independent AND score 1-8. false only for chains/franchises or score 9-10.
Return only JSON.`,
        }],
      }),
    })

    const gradeJson = await gradeRes.json()
    const raw = gradeJson.content?.[0]?.text || ''
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const extracted = JSON.parse(clean)

    if (extracted.is_chain_or_franchise) {
      send('narrate', { text: `${extracted.business_name || domain} — chain/franchise, skipping.` })
      return JSON.stringify({ skipped: true, reason: 'chain or franchise', domain })
    }

    const foodTypes = ['restaurant','bar','coffee_shop','catering','food_truck','bakery','brewery','winery','cocktail_bar']
    const btype = extracted.business_type || ''
    if (!foodTypes.includes(btype) && btype !== 'other') {
      send('narrate', { text: `${extracted.business_name || domain} — not a food/bev business (${btype}), skipping.` })
      return JSON.stringify({ skipped: true, reason: 'not food/bev', domain })
    }

    const score = extracted.website_score || 5
    const verdicts: Record<number, string> = {
      1: 'Barely functional', 2: 'Very weak', 3: 'Weak — clear gaps',
      4: 'Below average', 5: 'Mid — visible gaps', 6: 'Decent',
      7: 'Good', 8: 'Polished', 9: 'Strong', 10: 'Excellent',
    }
    const angle: 'new_site' | 'live_chat' = extracted.angle === 'live_chat' ? 'live_chat'
      : extracted.angle === 'new_site' ? 'new_site'
      : (score <= 5 ? 'new_site' : 'live_chat')

    const angleLabel: Record<string, string> = {
      new_site: 'New Site', live_chat: 'AI Live Chat',
    }

    const prospect: Prospect = {
      domain,
      business_name: extracted.business_name || domain,
      description: extracted.description || '',
      location: extracted.location || '',
      business_type: extracted.business_type || 'other',
      website_score: score,
      verdict: verdicts[score] || '',
      worth_targeting: extracted.worth_targeting === true,
      borderline: extracted.borderline === true,
      email: extracted.email || null,
      phone: extracted.phone || null,
      pain_point: extracted.pain_point || '',
      why_good_target: extracted.why_good_target || '',
      primary_color: extracted.primary_color || '#1a1a2e',
      angle,
      angle_reason: extracted.angle_reason || '',
    }

    if (prospect.worth_targeting) {
      send('prospect_found', { prospect })
      const fence = prospect.borderline ? ', maybe' : ''
      send('narrate', {
        text: `${prospect.business_name} — ${score}/10${fence}. Angle: ${angleLabel[angle]}. ${prospect.pain_point}`,
      })
    } else {
      send('narrate', { text: `${prospect.business_name || domain} — ${score}/10, not a fit.` })
    }

    return JSON.stringify(prospect)
  } catch (e) {
    send('narrate', { text: `${domain} — couldn't read it, skipping.` })
    return JSON.stringify({ error: 'Failed to read site', domain })
  }
}

async function toolSaveToQueue(
  domains: string[],
  allProspects: Prospect[],
  sessionId: string | undefined,
  brandId: string,
  sb: SupabaseServiceContext,
): Promise<string> {
  try {
    const prospects = domains
      .map(d => allProspects.find(p => p.domain === d))
      .filter(Boolean) as Prospect[]

    if (prospects.length === 0) return JSON.stringify({ error: 'No matching prospects found' })

    const rows = prospects.map(p => ({
      brand_id: brandId,
      domain: p.domain,
      business_name: p.business_name,
      email: p.email,
      phone: p.phone,
      pain_point: p.pain_point,
      primary_color: p.primary_color,
      website_score: p.website_score,
      angle: p.angle || null,
      status: 'queued',
      session_id: sessionId || null,
    }))

    const res = await fetch(`${sb.restUrl}/engine_queue?on_conflict=domain`, {
      method: 'POST',
      headers: { ...sb.headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    })
    const data = await res.json()
    if (!res.ok) return JSON.stringify({ error: data.message || 'Insert failed' })
    return JSON.stringify({ saved: Array.isArray(data) ? data.length : 0, domains: Array.isArray(data) ? data.map((r: {domain: string}) => r.domain) : [] })
  } catch (e) {
    return JSON.stringify({ error: 'Failed to save to queue' })
  }
}

// ─── ICP loader ───────────────────────────────────────────────────────────────

async function loadBrandICP(brandId: string, sb: SupabaseServiceContext): Promise<{ icp: string; name: string } | null> {
  try {
    const res = await fetch(`${sb.restUrl}/brands?select=name,icp&id=eq.${brandId}`, {
      headers: { ...sb.headers, Prefer: 'return=representation' },
    })
    const data = await res.json()
    const row = Array.isArray(data) ? data[0] : null
    return row ? { icp: row.icp || '', name: row.name || '' } : null
  } catch { return null }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(icp: string, brandName: string): string {
  return `You are Scout — a sharp AI prospecting agent for ${brandName || 'LVRG Agency'}.

Your job: find local San Diego restaurants and bars for cold outreach. You read their sites, grade them, and recommend an outreach angle. They get a free preview (new site, live chat widget, or lead magnet) — the goal is to get them on a call.

${icp ? `SAVED ICP:\n${icp}\n` : ''}

## BEHAVIOR

You have tools. Use them. Don't describe what you're going to do — just do it.

**When to search:**
If the user gives you any niche + location signal → call search_prospects immediately. Don't confirm, don't ask follow-up questions first. Search, then talk about what you found.

**When to scrape:**
After getting domains from search_prospects → call scrape_and_grade on each domain. Run them sequentially. The results stream to the user live.

**When to save:**
After showing results and the user says something like "add to engine", "queue these", "let's go" → call save_to_queue with approved domains.

## RESPONSE FORMAT — CRITICAL

Your text replies must be SHORT and CONVERSATIONAL. The UI already displays a card for every prospect found — you do NOT need to repeat the data.

**After scraping completes:**
- 1-2 sentences max. Name the single best target and one reason why. Give the overall read in one sentence.
- Do NOT output tables, lists, scores, or domain names. That data is already shown in the UI cards.
- Use the right hook language: score 1-5 = "New Site" angle, score 6-10 = "AI Live Chat" angle.
- Example: "Best shot is Happy Medium — score 2, New Site angle sells itself. 5 solid targets in this batch."

**Mid-search:**
- One sentence. No lists.

**After queuing:**
- One sentence confirming count. That's it.

**Never output:**
- Markdown tables
- Numbered or bulleted lists of prospects
- Scores or domains repeated in text
- More than 3 sentences in a single reply

## CHIPS
At the end of every text response, add: {"chips":["chip1","chip2","chip3"]}
Max 4. Make them specific to what just happened — next logical moves only.`
}

// ─── Main SSE handler ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const unauth = await requireAuth()
  if (unauth) return unauth
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim()
  const sb = getSupabaseServiceContext()
  if (!anthropicKey || !firecrawlKey || !sb) {
    return NextResponse.json(
      {
        error:
          'Server misconfigured: set ANTHROPIC_API_KEY, FIRECRAWL_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_KEY',
      },
      { status: 503 }
    )
  }

  const body = await req.json()
  const {
    message,
    session_id,
    brand_id = DEFAULT_BRAND_ID,
    conversation_history = [] as ClaudeMessage[],
    known_prospects = [] as Prospect[],
    // ui_messages removed — messages saved client-side after turn completes
  } = body

  // Load ICP before stream starts
  let icp = '', brandName = 'LVRG Agency'
  try {
    const brand = await loadBrandICP(brand_id, sb)
    icp = brand?.icp || ''
    brandName = brand?.name || 'LVRG Agency'
  } catch {}

  const systemPrompt = buildSystemPrompt(icp, brandName)
  const encoder = new TextEncoder()

  // Seed from known_prospects so save_to_queue works across turns
  const foundProspects: Prospect[] = [...known_prospects]

  const stream = new ReadableStream({
    async start(controller) {
      function send(type: string, data: object = {}) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`))
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')) } catch {}
      }, 8000)

      try {
        // Build messages — append new user message
        const messages: ClaudeMessage[] = [
          ...conversation_history,
          { role: 'user', content: message },
        ]

        // ── Agentic loop ─────────────────────────────────────────────────────
        // Claude can call tools multiple times in one turn
        let continueLoop = true

        while (continueLoop) {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 1024,
              system: systemPrompt,
              tools: TOOLS,
              messages,
            }),
          })

          if (!res.ok) {
            const err = await res.json()
            send('error', { text: `Claude error: ${err.error?.message || res.status}`, retryable: true })
            break
          }

          const claudeRes = await res.json()
          const { stop_reason, content } = claudeRes

          if (!content?.length) {
            send('error', { text: 'Empty response from Claude. Try again.', retryable: true })
            break
          }

          // Add Claude's response to message history for the next loop
          messages.push({ role: 'assistant', content })

          // Process each content block
          const toolUseBlocks = content.filter((b: ClaudeContentBlock) => b.type === 'tool_use')
          const textBlocks = content.filter((b: ClaudeContentBlock) => b.type === 'text')

          // Stream any text Claude produced before/between tool calls
          for (const block of textBlocks) {
            if (block.type === 'text' && block.text?.trim()) {
              // Strip chips JSON from text before sending
              let text = block.text
              let chips: string[] = []
              const chipsMatch = text.match(/\{"chips"\s*:\s*\[([^\]]*)\]\}/)
              if (chipsMatch) {
                try {
                  chips = JSON.parse(`[${chipsMatch[1]}]`)
                } catch {}
                text = text.replace(/\{"chips"\s*:\s*\[[^\]]*\]\}/g, '').trim()
              }
              if (text) send('scout_reply', { text, chips })
            }
          }

          // If Claude called tools, execute them
          if (stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
            const toolResults: ClaudeContentBlock[] = []

            for (const block of toolUseBlocks) {
              if (block.type !== 'tool_use') continue
              const { id, name, input } = block

              send('tool_call', { tool: name })

              let result = ''

              if (name === 'search_prospects') {
                result = await toolSearchProspects(
                  (input.queries as string[]) || [],
                  (input.location as string) || 'San Diego,California,United States',
                  send,
                  firecrawlKey,
                )
              } else if (name === 'scrape_and_grade') {
                result = await toolScrapeAndGrade(input.domain as string, send, anthropicKey)
                // Track found prospects
                try {
                  const parsed = JSON.parse(result)
                  if (parsed.worth_targeting && parsed.domain) {
                    if (!foundProspects.find(p => p.domain === parsed.domain)) {
                      foundProspects.push(parsed as Prospect)
                    }
                  }
                } catch {}
              } else if (name === 'save_to_queue') {
                result = await toolSaveToQueue(
                  input.domains as string[],
                  foundProspects,
                  session_id,
                  brand_id,
                  sb,
                )
                try {
                  const parsed = JSON.parse(result)
                  if (parsed.saved > 0) {
                    send('queue_saved', { count: parsed.saved })
                  }
                } catch {}
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: id,
                content: result,
              })
            }

            // Feed tool results back to Claude for next loop iteration
            messages.push({ role: 'user', content: toolResults })
            continueLoop = true

          } else {
            // No tool calls — Claude is done
            continueLoop = false
          }
        }

        // Send final prospects list
        const targets = foundProspects.filter(p => !p.borderline)
        const borderlines = foundProspects.filter(p => p.borderline)

        // Save session — always save so messages persist even with 0 prospects
        const savedSessionId = session_id || crypto.randomUUID()
        const topNames = targets.slice(0, 3).map(p => p.business_name).join(', ')
        const sessionName = topNames
          ? `${topNames}${targets.length > 3 ? ` +${targets.length - 3} more` : ''}`
          : foundProspects.length > 0
            ? `${foundProspects.length} prospect${foundProspects.length !== 1 ? 's' : ''}`
            : `Session ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        ;(async () => {
          try {
            await fetch(`${sb.restUrl}/scout_sessions?on_conflict=id`, {
              method: 'POST',
              headers: { ...sb.headers, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
              body: JSON.stringify({
                id: savedSessionId,
                brand_id,
                session_name: sessionName,
                prospects: foundProspects,
                updated_at: new Date().toISOString(),
              }),
            })
          } catch {}
        })()
        send('done', { targets, borderlines, session_id: savedSessionId })

      } catch (e) {
        console.error('Scout error:', e)
        const msg = e instanceof Error ? e.message : 'Unknown error'
        send('error', { text: `Scout error: ${msg}`, retryable: true })
      } finally {
        clearInterval(heartbeat)
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
