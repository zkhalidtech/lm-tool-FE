import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import dotenv from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const lmToolRoot = join(__dirname, '..')
dotenv.config({ path: join(lmToolRoot, '.env') })
dotenv.config({ path: join(lmToolRoot, '.env.local'), override: true })

// ─── Config ───────────────────────────────────────────────────────────────────

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY
const FIRECRAWL_KEY  = process.env.FIRECRAWL_API_KEY
const SUPABASE_URL   = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
const INSTANTLY_KEY  = process.env.INSTANTLY_API_KEY
const INSTANTLY_CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_ID
const DEFAULT_BRAND  = process.env.DEFAULT_BRAND_ID || '0be94239-82c7-440e-80ef-171033694fb5'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[mcp] Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch { return url }
}

const JUNK = [
  'yelp.com','tripadvisor.com','google.com','facebook.com','instagram.com',
  'doordash.com','grubhub.com','ubereats.com','opentable.com','resy.com',
  'timeout.com','eater.com','thrillist.com','zagat.com','foursquare.com',
  'yellowpages.com','bbb.org','bing.com','wikipedia.org','reddit.com',
  'tiktok.com','twitter.com','x.com','linkedin.com',
  'sandiegoreader.com','sdmagazine.com','sandiegomagazine.com',
  'sandiegoville.com','discoversd.com','sdcitybeat.com',
  'realestate','realtor','realty','insurance','mortgage','dental','medical',
  'law','attorney','accountant','cpa',
]

function isJunk(domain) {
  return JUNK.some(j => domain.includes(j))
}

// ─── Tool: search_prospects ───────────────────────────────────────────────────

async function searchProspects(queries, location = 'San Diego,California,United States') {
  if (!FIRECRAWL_KEY) {
    return { error: 'Missing FIRECRAWL_API_KEY', domains: [], total: 0 }
  }
  const allUrls = []
  for (const query of queries) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit: 8, location, country: 'US', ignoreInvalidURLs: true }),
      })
      const json = await res.json()
      const urls = (json.data?.web || []).map(r => r.url)
      allUrls.push(...urls)
    } catch {}
  }

  const domains = [...new Set(
    allUrls.map(extractDomain).filter(d => d && !isJunk(d) && d.includes('.'))
  )].slice(0, 20)

  return { domains, total: domains.length }
}

// ─── Tool: grade_site ─────────────────────────────────────────────────────────

async function gradeSite(domain) {
  // Fetch site content
  let text = ''
  try {
    const res = await fetch(`https://${domain}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LVRGScout/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 3500)
  } catch (e) {
    return { error: `Could not fetch ${domain}: ${e.message}`, domain }
  }

  if (text.length < 80) return { error: 'Site returned no readable content', domain }

  // Grade with Claude Haiku
  const gradeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
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

We sell one product: Smart Site — full new website with brand look/feel, their photos and reviews, AI live chat, booking, local SEO, SMS/missed-call text-back. The cold outreach hook depends on score:
- Score 1-5 → angle: "new_site" — lead with "we built you a new site"
- Score 6-10 → angle: "live_chat" — lead with "free AI Live Chat widget"

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
  "angle_reason": "one sentence why this hook fits this business",
  "worth_targeting": true/false,
  "borderline": false
}
worth_targeting: true if independent AND score 1-8. false for chains or score 9-10.
Return only JSON.`,
      }],
    }),
  })

  const gradeJson = await gradeRes.json()
  const raw = gradeJson.content?.[0]?.text || ''
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let extracted
  try { extracted = JSON.parse(clean) }
  catch { return { error: 'Grader returned invalid JSON', domain, raw } }

  if (extracted.is_chain_or_franchise) {
    return { skipped: true, reason: 'chain or franchise', domain, business_name: extracted.business_name }
  }

  const foodTypes = ['restaurant','bar','coffee_shop','catering','food_truck','bakery','brewery','winery','cocktail_bar','other']
  if (!foodTypes.includes(extracted.business_type)) {
    return { skipped: true, reason: `not food/bev (${extracted.business_type})`, domain, business_name: extracted.business_name }
  }

  const score = extracted.website_score || 5
  const verdicts = {
    1:'Barely functional',2:'Very weak',3:'Weak — clear gaps',
    4:'Below average',5:'Mid — visible gaps',6:'Decent',
    7:'Good',8:'Polished',9:'Strong',10:'Excellent',
  }
  const angle = extracted.angle === 'live_chat' ? 'live_chat' : extracted.angle === 'new_site' ? 'new_site' : (score <= 5 ? 'new_site' : 'live_chat')

  return {
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
}

// ─── Tool: save_to_queue ──────────────────────────────────────────────────────

async function saveToQueue(prospects, brandId = DEFAULT_BRAND, sessionId = null) {
  const rows = prospects.map(p => ({
    brand_id: brandId,
    domain: p.domain,
    business_name: p.business_name,
    email: p.email || null,
    phone: p.phone || null,
    pain_point: p.pain_point || '',
    primary_color: p.primary_color || '#1a1a2e',
    website_score: p.website_score,
    angle: p.angle,
    status: 'queued',
    session_id: sessionId,
  }))

  const { data, error } = await supabase
    .from('engine_queue')
    .upsert(rows, { onConflict: 'domain', ignoreDuplicates: false })
    .select('id, domain, business_name')

  if (error) return { error: error.message }
  return { saved: data?.length || 0, prospects: data }
}

// ─── Tool: send_outreach ──────────────────────────────────────────────────────

async function sendOutreach(prospects, campaignId = INSTANTLY_CAMPAIGN) {
  if (!INSTANTLY_KEY) {
    return { error: 'Missing INSTANTLY_API_KEY' }
  }
  const cid = campaignId || INSTANTLY_CAMPAIGN
  if (!cid) {
    return { error: 'Missing INSTANTLY_CAMPAIGN_ID or pass campaignId' }
  }
  const leads = prospects
    .filter(p => p.email)
    .map(p => ({
      email: p.email,
      first_name: p.business_name,
      custom_variables: {
        business_name: p.business_name,
        domain: p.domain,
        angle: p.angle,
        pain_point: p.pain_point,
        website_score: String(p.website_score),
      },
    }))

  if (leads.length === 0) return { error: 'No prospects with email addresses', skipped: prospects.length }

  const res = await fetch('https://api.instantly.ai/api/v2/leads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${INSTANTLY_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ campaign_id: cid, leads }),
  })

  const json = await res.json()
  if (!res.ok) return { error: json.message || `Instantly error ${res.status}`, details: json }
  return { sent: leads.length, skipped_no_email: prospects.length - leads.length, result: json }
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'lvrg',
  version: '1.0.0',
})

// search_prospects
server.tool(
  'search_prospects',
  'Search for local restaurant/bar websites in San Diego matching a niche. Returns a list of domains to evaluate.',
  {
    queries: z.array(z.string()).describe('3-5 search queries targeting independent local businesses. Mix angles for diversity.'),
    location: z.string().optional().describe('Location string. Default: San Diego,California,United States'),
  },
  async ({ queries, location }) => {
    const result = await searchProspects(queries, location)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    }
  }
)

// grade_site
server.tool(
  'grade_site',
  'Read and grade a business website. Returns score, pain point, and recommended outreach hook (new_site or live_chat).',
  {
    domain: z.string().describe('Domain to grade, e.g. happymediumsd.com'),
  },
  async ({ domain }) => {
    const result = await gradeSite(domain)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    }
  }
)

// save_to_queue
server.tool(
  'save_to_queue',
  'Save approved prospects to the engine queue in Supabase for Smart Site building and outreach.',
  {
    prospects: z.array(z.object({
      domain: z.string(),
      business_name: z.string(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      pain_point: z.string().optional(),
      primary_color: z.string().optional(),
      website_score: z.number(),
      angle: z.enum(['new_site', 'live_chat']),
      angle_reason: z.string().optional(),
    })).describe('Prospects to queue'),
    session_id: z.string().optional().describe('Optional session ID to group prospects'),
  },
  async ({ prospects, session_id }) => {
    const result = await saveToQueue(prospects, DEFAULT_BRAND, session_id)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    }
  }
)

// send_outreach
server.tool(
  'send_outreach',
  'Push prospects into Instantly campaign for cold outreach. Only sends to prospects that have an email address.',
  {
    prospects: z.array(z.object({
      domain: z.string(),
      business_name: z.string(),
      email: z.string().nullable().optional(),
      pain_point: z.string().optional(),
      website_score: z.number(),
      angle: z.enum(['new_site', 'live_chat']),
    })).describe('Prospects to send outreach to'),
    campaign_id: z.string().optional().describe('Instantly campaign ID. Defaults to main campaign.'),
  },
  async ({ prospects, campaign_id }) => {
    const result = await sendOutreach(prospects, campaign_id)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    }
  }
)

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('LVRG MCP server running')
