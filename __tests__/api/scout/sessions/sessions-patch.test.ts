import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
    })),
  },
}))

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/supabase-rest', () => ({
  getSupabaseServiceContext: vi.fn().mockReturnValue({
    restUrl: 'https://fake.supabase.co/rest/v1',
    headers: { apikey: 'test-key', Authorization: 'Bearer test-key' },
  }),
}))

// ── Static imports ────────────────────────────────────────────────────────────

import { requireAuth } from '@/lib/auth-guard'
import { getSupabaseServiceContext } from '@/lib/supabase-rest'
import { PATCH } from '@/app/api/scout/sessions/route'

const mockSb = {
  restUrl: 'https://fake.supabase.co/rest/v1',
  headers: { apikey: 'test-key', Authorization: 'Bearer test-key' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/scout/sessions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue([]) })
  )
}

function mockFetchError(message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message }),
    })
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/scout/sessions — message persistence (B10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(null)
    vi.mocked(getSupabaseServiceContext).mockReturnValue(mockSb)
  })

  it('returns 200 when messages are saved successfully', async () => {
    mockFetchOk()
    const messages = [
      { id: '1', type: 'user', text: 'SD restaurants' },
      { id: '2', type: 'scout_reply', text: 'On it!', chips: [] },
    ]

    const result = await PATCH(makeRequest({ id: 'session-abc', messages }))

    expect(result.status).toBe(200)
    expect((result as { _body: { ok: boolean } })._body).toEqual({ ok: true })
  })

  it('sends the correct PATCH body to PostgREST', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const messages = [{ id: '1', type: 'user', text: 'hello' }]
    await PATCH(makeRequest({ id: 'session-xyz', messages }))

    // Verify PostgREST was called with the session filter
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('scout_sessions?id=eq.session-xyz')
    expect(options.method).toBe('PATCH')
    const body = JSON.parse(options.body as string)
    expect(body.messages).toEqual(messages)
  })

  it('returns 400 when id is missing', async () => {
    const result = await PATCH(makeRequest({ messages: [] }))

    expect(result.status).toBe(400)
    expect((result as { _body: { error: string } })._body.error).toBe('id required')
  })

  it('returns 500 when PostgREST returns an error', async () => {
    mockFetchError('session row not found')

    const result = await PATCH(makeRequest({ id: 'bad-id', messages: [] }))

    expect(result.status).toBe(500)
  })

  it('returns 500 when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))

    const result = await PATCH(makeRequest({ id: 'session-abc', messages: [] }))

    expect(result.status).toBe(500)
  })

  it('returns 503 when Supabase is not configured', async () => {
    vi.mocked(getSupabaseServiceContext).mockReturnValueOnce(null)

    const result = await PATCH(makeRequest({ id: 'session-abc', messages: [] }))

    expect(result.status).toBe(503)
  })

  it('returns 401 when user is not authenticated', async () => {
    const unauthResponse = { status: 401, _body: { error: 'Unauthorized' } }
    vi.mocked(requireAuth).mockResolvedValueOnce(unauthResponse as never)

    const result = await PATCH(makeRequest({ id: 'session-abc', messages: [] }))

    expect((result as typeof unauthResponse).status).toBe(401)
  })
})
