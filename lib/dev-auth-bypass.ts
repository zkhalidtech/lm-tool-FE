import type { User } from '@supabase/supabase-js'

/** Matches middleware: only when explicitly enabled and Next dev server (not `next start`). */
export function isDevAuthBypass(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.DEV_BYPASS_AUTH === 'true'
  )
}

/** Minimal user for Sidebar when bypassing auth locally (never sent to Supabase). */
export function devPlaceholderUser(): User {
  const now = new Date().toISOString()
  return {
    id: '00000000-0000-0000-0000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'dev@localhost',
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: {},
    user_metadata: { full_name: 'Local dev (no Google)' },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User
}
