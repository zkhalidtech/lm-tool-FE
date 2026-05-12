import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Instantly webhook handler
 * Receives events and updates leads table pipeline timestamps.
 *
 * Registered events:
 *   email_sent, email_opened, reply_received, lead_interested, lead_meeting_booked
 *
 * Instantly sends: { event_type, timestamp, lead: { email, campaign_id, ... } }
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const { event_type, timestamp, lead } = payload

    if (!event_type || !lead?.email) {
      return NextResponse.json({ ok: false, error: 'missing event_type or lead.email' }, { status: 400 })
    }

    const email = lead.email as string
    const ts = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()

    const supabase = await createClient()

    // Map event → column
    const updates: Record<string, string> = {}

    switch (event_type) {
      case 'email_sent':
        updates.sent_at = ts
        updates.status = 'sent'
        break
      case 'email_opened':
        updates.opened_at = ts
        break
      case 'reply_received':
        updates.replied_at = ts
        updates.status = 'replied'
        break
      case 'lead_interested':
        updates.replied_at = updates.replied_at || ts
        updates.status = 'interested'
        break
      case 'lead_meeting_booked':
        updates.booked_at = ts
        updates.status = 'booked'
        break
      default:
        // Unknown event — log and return OK so Instantly doesn't retry
        console.log(`[instantly-webhook] unhandled event: ${event_type}`)
        return NextResponse.json({ ok: true, handled: false })
    }

    updates.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('leads')
      .update(updates)
      .eq('email', email)

    if (error) {
      console.error('[instantly-webhook] supabase update error:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    console.log(`[instantly-webhook] ✓ ${event_type} → ${email}`)
    return NextResponse.json({ ok: true, event_type, email })
  } catch (e) {
    console.error('[instantly-webhook] error:', e)
    return NextResponse.json({ ok: false, error: 'server error' }, { status: 500 })
  }
}
