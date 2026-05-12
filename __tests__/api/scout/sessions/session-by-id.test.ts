import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (hoisted by Vitest before imports) ─────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
    })),
  },
}))

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue(null), // null = authenticated
}))

vi.mock('@/lib/supabase-rest', () => ({
  getSupabaseServiceContext: vi.fn().mockReturnValue({
    restUrl: 'https://fake.supabase.co/rest/v1',
    headers: { apikey: 'test-key', Authorization: 'Bearer test-key' },
  }),
}))

// ── Static imports (resolved after mocks are applied) ────────────────────────

import { requireAuth } from '@/lib/auth-guard'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'
import { GET } from '@/app/api/scout/sessions/[id]/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function mockFetchWith(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(body),
    })
  )
}

const mockSb = {
  restUrl: 'https://fake.supabase.co/rest/v1',
  headers: { apikey: 'test-key', Authorization: 'Bearer test-key' },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/scout/sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(null)
    vi.mocked(getSupabaseServiceContext).mockReturnValue(mockSb)
  })

  it('returns 200 with session data when session exists', async () => {
    const session = {
      id: 'abc-123',
      session_name: 'Test Session',
      prospects: [],
      messages: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    mockFetchWith(200, [session])

    const result = await GET(new Request('http://localhost'), makeParams('abc-123'))

    expect(result.status).toBe(200)
    expect((result as { _body: { session: unknown } })._body).toEqual({ session })
  })

  it('returns 404 when session does not exist (empty array from PostgREST)', async () => {
    // Core regression test for B9:
    // Previously, Accept: vnd.pgrst.object+json caused PostgREST to return 406,
    // which the handler mapped to 500. Now we use array response and check length.
    mockFetchWith(200, [])

    const result = await GET(new Request('http://localhost'), makeParams('non-existent-id'))

    expect(result.status).toBe(404)
    expect((result as { _body: { error: string } })._body.error).toBe('Session not found')
  })

  it('returns 404 when PostgREST returns null (defensive check)', async () => {
    mockFetchWith(200, null)

    const result = await GET(new Request('http://localhost'), makeParams('any-id'))

    expect(result.status).toBe(404)
  })

  it('returns 500 with DB error message when PostgREST returns non-ok status', async () => {
    mockFetchWith(400, { message: 'invalid input syntax for type uuid' })

    const result = await GET(new Request('http://localhost'), makeParams('not-a-uuid'))

    expect(result.status).toBe(500)
    expect((result as { _body: { error: string } })._body.error).toBe(
      'invalid input syntax for type uuid'
    )
  })

  it('returns 500 when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await GET(new Request('http://localhost'), makeParams('abc-123'))

    expect(result.status).toBe(500)
    expect((result as { _body: { error: string } })._body.error).toBe('Server error')
  })

  it('returns 503 when Supabase context is not configured', async () => {
    vi.mocked(getSupabaseServiceContext).mockReturnValueOnce(null)

    const result = await GET(new Request('http://localhost'), makeParams('abc-123'))

    expect(result.status).toBe(503)
  })

  it('returns the unauth response when user is not authenticated', async () => {
    const unauthResponse = { status: 401, _body: { error: 'Unauthorized' } }
    vi.mocked(requireAuth).mockResolvedValueOnce(unauthResponse as never)

    const result = await GET(new Request('http://localhost'), makeParams('abc-123'))

    expect((result as typeof unauthResponse).status).toBe(401)
  })
})
