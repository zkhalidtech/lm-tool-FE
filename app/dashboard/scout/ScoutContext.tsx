'use client'

import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'

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

export type Message =
  | { id: string; type: 'user'; text: string }
  | { id: string; type: 'scout_reply'; text: string; chips: string[] }
  | { id: string; type: 'narrate'; text: string }
  | { id: string; type: 'tool_call'; tool: string }
  | { id: string; type: 'prospect_summary'; prospects: Prospect[] }
  | { id: string; type: 'queue_saved'; count: number }
  | { id: string; type: 'error'; text: string; retryable?: boolean }

export type ScoutSession = {
  id: string
  session_name: string
  created_at: string
  prospect_count: number
}

export type Status = 'idle' | 'thinking' | 'working'

type ScoutContextType = {
  messages: Message[]
  status: Status
  allProspects: Prospect[]
  selected: Set<string>
  dismissed: Set<string>
  sessions: ScoutSession[]
  sessionId: string | undefined
  lastUserMessage: string
  sendMessage: (text: string) => void
  handleChip: (chip: string) => void
  queueProspect: (p: Prospect) => void
  queueAll: (prospects: Prospect[]) => void
  markNotAFit: (domain: string) => void
  startFreshSession: () => void
  loadSession: (id: string) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ScoutContext = createContext<ScoutContextType | null>(null)

export function useScout(): ScoutContextType {
  const ctx = useContext(ScoutContext)
  if (!ctx) throw new Error('useScout must be used within ScoutProvider')
  return ctx
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0
const uid = () => String(++_id)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ScoutProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages]         = useState<Message[]>([])
  const [status, setStatus]             = useState<Status>('idle')
  const [allProspects, setAllProspects] = useState<Prospect[]>([])
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [dismissed, setDismissed]       = useState<Set<string>>(new Set())
  const [sessionId, setSessionId]       = useState<string | undefined>()
  const [sessions, setSessions]         = useState<ScoutSession[]>([])
  const [lastUserMessage, setLastUserMessage] = useState<string>('')

  const historyRef  = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const messagesRef = useRef<Message[]>([])
  const abortRef    = useRef<AbortController | null>(null)

  // Keep messagesRef in sync for synchronous reads in event handlers + beforeunload
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Save via sendBeacon on tab close — only safety net that works during unload
  useEffect(() => {
    function handleBeforeUnload() {
      if (!sessionId || messagesRef.current.length === 0) return
      const hasReal = messagesRef.current.some(
        m => m.type === 'user' || m.type === 'narrate' || m.type === 'prospect_summary'
      )
      if (!hasReal) return
      navigator.sendBeacon(
        '/api/scout/sessions',
        new Blob(
          [JSON.stringify({ id: sessionId, messages: messagesRef.current })],
          { type: 'application/json' }
        )
      )
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sessionId])

  // Restore last active session on first mount
  useEffect(() => {
    loadSessions()
    const lastId = localStorage.getItem('scout_last_session_id')
    if (lastId) {
      loadSession(lastId)
    } else {
      triggerOpeningGreeting()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist sessionId across navigations
  useEffect(() => {
    if (sessionId) localStorage.setItem('scout_last_session_id', sessionId)
  }, [sessionId])

  // Full-turn save when idle
  useEffect(() => {
    if (status !== 'idle' || !sessionId || messages.length === 0) return
    saveSession(messages)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionId])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function saveSession(msgs: Message[], sid = sessionId) {
    if (!sid || msgs.length === 0) return
    const hasReal = msgs.some(
      m => m.type === 'user' || m.type === 'narrate' || m.type === 'prospect_summary'
    )
    if (!hasReal) return
    fetch('/api/scout/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sid, messages: msgs }),
    }).catch(() => {})
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function push(msg: any): string {
    const m = { ...msg, id: uid() } as Message
    setMessages(p => [...p, m])
    return m.id
  }

  function triggerOpeningGreeting() {
    setMessages([{
      id: uid(),
      type: 'scout_reply',
      text: "Who are we hunting?",
      chips: [
        'SD restaurants, outdated sites',
        'SD bars, weak web presence',
        'North Park coffee shops',
        'Use my saved ICP',
      ],
    }])
  }

  async function loadSessions() {
    try {
      const res = await fetch('/api/scout/sessions')
      if (!res.ok) return
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch {}
  }

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/scout/sessions/${id}`)
      if (!res.ok) return
      const data = await res.json()
      const session = data.session
      if (!session) return

      setSessionId(id)

      if (Array.isArray(session.messages) && session.messages.length > 0) {
        setMessages(session.messages as Message[])
      } else {
        setMessages([{
          id: uid(),
          type: 'scout_reply',
          text: "Session loaded. What would you like to do next?",
          chips: ['Search for more', 'Add all to engine', 'Start fresh'],
        }])
      }

      const prospects = Array.isArray(session.prospects) ? session.prospects as Prospect[] : []
      setAllProspects(prospects)
      setSelected(new Set(prospects.filter((p: Prospect) => !p.borderline).map((p: Prospect) => p.domain)))

      historyRef.current = (session.messages || [])
        .filter((m: Message) => m.type === 'user' || m.type === 'scout_reply')
        .map((m: Message) => ({
          role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.type === 'user'
            ? (m as { type: 'user'; text: string }).text
            : (m as { type: 'scout_reply'; text: string; chips: string[] }).text,
        }))
    } catch {}
  }, [])

  // ── Core send ────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || status === 'working') return

    setLastUserMessage(text)

    const userMsg: Message = { id: uid(), type: 'user', text }
    setMessages(p => [...p, userMsg])

    // Save immediately so navigation away mid-turn doesn't lose the user message
    saveSession([...messagesRef.current, userMsg])

    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setStatus('thinking')
    historyRef.current = [...historyRef.current, { role: 'user' as const, content: text }]

    const timeout = setTimeout(() => abort.abort(), 180000)

    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          brand_id: '0be94239-82c7-440e-80ef-171033694fb5',
          conversation_history: historyRef.current.slice(-12),
          known_prospects: allProspects,
        }),
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const errText = await res.text().catch(() => `Status ${res.status}`)
        push({ type: 'error', text: `Server error: ${errText}`, retryable: true })
        setStatus('idle'); return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        push({ type: 'error', text: 'No response from server. Try again.', retryable: true })
        setStatus('idle'); return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let assistantReply = ''
      let gotData = false
      let activeToolCallId: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith(': ')) continue
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            gotData = true
            const { type, ...rest } = data

            switch (type) {
              case 'scout_reply': {
                const rawText = (rest.text || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
                assistantReply = rawText
                if (assistantReply) push({ type: 'scout_reply', text: assistantReply, chips: rest.chips || [] })
                activeToolCallId = null
                break
              }

              case 'tool_call':
                if (activeToolCallId) {
                  setMessages(prev => prev.map(m =>
                    m.id === activeToolCallId ? { ...m, tool: rest.tool } as Message : m
                  ))
                } else {
                  activeToolCallId = push({ type: 'tool_call', tool: rest.tool })
                  setStatus('working')
                }
                break

              case 'narrate':
                push({ type: 'narrate', text: rest.text })
                break

              case 'prospect_found': {
                const p = rest.prospect as Prospect
                if (p.worth_targeting) {
                  setAllProspects(prev => prev.find(x => x.domain === p.domain) ? prev : [...prev, p])
                  if (!p.borderline) setSelected(s => new Set([...s, p.domain]))
                }
                break
              }

              case 'queue_saved':
                if (activeToolCallId) {
                  setMessages(prev => prev.filter(m => m.id !== activeToolCallId))
                  activeToolCallId = null
                }
                push({ type: 'queue_saved', count: rest.count })
                setTimeout(() => { window.location.href = '/dashboard/engine' }, 1800)
                break

              case 'done': {
                const targets: Prospect[] = rest.targets || []
                const borderlines: Prospect[] = rest.borderlines || []
                const all = [...targets, ...borderlines]
                if (all.length > 0) setAllProspects(all)
                setSelected(new Set(targets.map((t: Prospect) => t.domain)))
                if (rest.session_id) setSessionId(rest.session_id)
                if (activeToolCallId) {
                  setMessages(prev => prev.filter(m => m.id !== activeToolCallId))
                  activeToolCallId = null
                }
                if (all.length > 0) push({ type: 'prospect_summary', prospects: all })
                loadSessions()
                break
              }

              case 'error':
                push({ type: 'error', text: rest.text, retryable: rest.retryable ?? true })
                break
            }
          } catch {}
        }
      }

      if (!gotData) {
        push({ type: 'error', text: "Scout didn't respond. Try again.", retryable: true })
      } else if (assistantReply) {
        historyRef.current = [...historyRef.current, { role: 'assistant' as const, content: assistantReply }]
      }

    } catch (e: unknown) {
      clearTimeout(timeout)
      if ((e as Error)?.name === 'AbortError') {
        push({ type: 'error', text: 'Took too long. Try again.', retryable: true })
      } else {
        push({ type: 'error', text: 'Connection error. Try again.', retryable: true })
      }
    } finally {
      setStatus('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, allProspects, status])

  // ── Queue actions ────────────────────────────────────────────────────────────

  async function markNotAFit(domain: string) {
    setDismissed(prev => new Set([...prev, domain]))
    setAllProspects(prev => prev.filter(p => p.domain !== domain))
    setSelected(prev => { const n = new Set(prev); n.delete(domain); return n })
  }

  async function queueProspect(p: Prospect) {
    setDismissed(prev => new Set([...prev, p.domain]))
    setAllProspects(prev => prev.filter(x => x.domain !== p.domain))
    try {
      const res = await fetch('/api/engine-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: [p], session_id: sessionId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setDismissed(prev => { const n = new Set(prev); n.delete(p.domain); return n })
        setAllProspects(prev => [...prev, p])
        push({ type: 'error', text: 'Failed to queue. Try again.', retryable: false })
      }
    } catch {
      setDismissed(prev => { const n = new Set(prev); n.delete(p.domain); return n })
      setAllProspects(prev => [...prev, p])
      push({ type: 'error', text: 'Failed to queue. Try again.', retryable: false })
    }
  }

  async function queueAll(prospects: Prospect[]) {
    if (!prospects.length) return
    const domains = prospects.map(p => p.domain)
    setDismissed(prev => new Set([...prev, ...domains]))
    setAllProspects(prev => prev.filter(p => !domains.includes(p.domain)))
    try {
      const res = await fetch('/api/engine-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects, session_id: sessionId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setDismissed(prev => { const n = new Set(prev); domains.forEach(d => n.delete(d)); return n })
        setAllProspects(prev => [...prev, ...prospects])
        push({ type: 'error', text: 'Failed to queue. Try again.', retryable: false })
      }
    } catch {
      setDismissed(prev => { const n = new Set(prev); domains.forEach(d => n.delete(d)); return n })
      setAllProspects(prev => [...prev, ...prospects])
      push({ type: 'error', text: 'Failed to queue all. Try again.', retryable: false })
    }
  }

  function startFreshSession() {
    setMessages([])
    setAllProspects([])
    setSelected(new Set())
    setDismissed(new Set())
    setSessionId(undefined)
    historyRef.current = []
    localStorage.removeItem('scout_last_session_id')
    setTimeout(triggerOpeningGreeting, 100)
  }

  function handleChip(chip: string) {
    const lower = chip.toLowerCase()
    if ((lower.includes('add') && lower.includes('engine')) || lower.includes('queue all')) {
      queueAll(allProspects.filter(p => !p.borderline)); return
    }
    if (lower.includes('scout more') || lower.includes('new session')) {
      startFreshSession(); return
    }
    if (lower.includes('leads page') || (lower.includes('leads') && lower.includes('go'))) {
      window.location.href = '/dashboard/leads'; return
    }
    if (lower.includes('engine page')) {
      window.location.href = '/dashboard/engine'; return
    }
    if (lower.includes('top 3')) {
      const top = allProspects.slice(0, 3)
      setSelected(new Set(top.map(t => t.domain)))
      push({ type: 'scout_reply', text: `Narrowed to the top 3.`, chips: [] })
      return
    }
    if (lower.includes('select all')) {
      setSelected(new Set(allProspects.map(t => t.domain)))
      push({ type: 'scout_reply', text: `All ${allProspects.length} selected.`, chips: [] })
      return
    }
    sendMessage(chip)
  }

  return (
    <ScoutContext.Provider value={{
      messages, status, allProspects, selected, dismissed,
      sessions, sessionId, lastUserMessage,
      sendMessage, handleChip, queueProspect, queueAll,
      markNotAFit, startFreshSession, loadSession,
    }}>
      {children}
    </ScoutContext.Provider>
  )
}
