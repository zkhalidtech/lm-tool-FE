import { createClient } from '@/lib/supabase/server'

export type LeadStatus = 'queued' | 'building' | 'built' | 'sent' | 'opened' | 'clicked' | 'replied' | 'booked' | 'bounced'
export type Offer = 'Website Rebuild' | 'Website Grade' | 'Smart Site' | 'AI Chat'
export type CTA = 'Book a Call' | 'Claim Your Site' | 'Get Your Grade' | 'Watch Demo'

export type Lead = {
  id: string
  domain: string
  company_name: string | null
  email: string | null
  first_name: string | null
  phone: string | null
  offer: Offer
  cta: CTA
  preview_url: string | null
  website_score: number | null
  status: LeadStatus
  instantly_lead_id: string | null
  instantly_campaign_id: string | null
  brand_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
  opened_at: string | null
  replied_at: string | null
  booked_at: string | null
}

export async function getLeads(filters?: {
  status?: LeadStatus
  offer?: Offer
  brandId?: string
}) {
  const supabase = await createClient()
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.offer) query = query.eq('offer', filters.offer)
  if (filters?.brandId) query = query.eq('brand_id', filters.brandId)

  const { data, error } = await query
  if (error) throw error
  return data as Lead[]
}

export async function createLead(lead: Partial<Lead> & { domain: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single()
  if (error) throw error
  return data as Lead
}

export async function updateLeadStatus(id: string, status: LeadStatus, extra?: Partial<Lead>) {
  const supabase = await createClient()
  const timestamps: Partial<Lead> = {}
  if (status === 'sent') timestamps.sent_at = new Date().toISOString()
  if (status === 'opened') timestamps.opened_at = new Date().toISOString()
  if (status === 'replied') timestamps.replied_at = new Date().toISOString()
  if (status === 'booked') timestamps.booked_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('leads')
    .update({ status, ...timestamps, ...extra })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Lead
}

export async function logLeadEvent(leadId: string, event: string, metadata?: object) {
  const supabase = await createClient()
  await supabase.from('lead_events').insert({
    lead_id: leadId,
    event,
    metadata: metadata || {},
  })
}

export async function getLeadInsights() {
  const supabase = await createClient()
  const { data: leads } = await supabase.from('leads').select('*')
  if (!leads || leads.length === 0) return null

  // Group by offer
  const byOffer = leads.reduce((acc: Record<string, any>, l) => {
    if (!acc[l.offer]) acc[l.offer] = { total: 0, sent: 0, opened: 0, replied: 0, booked: 0 }
    acc[l.offer].total++
    if (['sent','opened','clicked','replied','booked'].includes(l.status)) acc[l.offer].sent++
    if (['opened','clicked','replied','booked'].includes(l.status)) acc[l.offer].opened++
    if (['replied','booked'].includes(l.status)) acc[l.offer].replied++
    if (l.status === 'booked') acc[l.offer].booked++
    return acc
  }, {})

  // Group by CTA
  const byCTA = leads.reduce((acc: Record<string, any>, l) => {
    if (!acc[l.cta]) acc[l.cta] = { total: 0, replied: 0, booked: 0 }
    acc[l.cta].total++
    if (['replied','booked'].includes(l.status)) acc[l.cta].replied++
    if (l.status === 'booked') acc[l.cta].booked++
    return acc
  }, {})

  // Pipeline counts
  const pipeline = {
    queued: leads.filter(l => l.status === 'queued').length,
    building: leads.filter(l => l.status === 'building').length,
    built: leads.filter(l => l.status === 'built').length,
    sent: leads.filter(l => l.status === 'sent').length,
    opened: leads.filter(l => l.status === 'opened').length,
    replied: leads.filter(l => l.status === 'replied').length,
    booked: leads.filter(l => l.status === 'booked').length,
    bounced: leads.filter(l => l.status === 'bounced').length,
  }

  return { byOffer, byCTA, pipeline, total: leads.length }
}
