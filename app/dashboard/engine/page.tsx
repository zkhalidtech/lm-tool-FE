'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Zap, ExternalLink, Mail, Globe, Loader2, CheckCircle2, Clock, RotateCcw, X, Pause, Trash2, Plus, ChevronDown, ChevronUp, Send } from 'lucide-react'
import clsx from 'clsx'

type LogLine = { text: string; level: 'info' | 'success' | 'error' | 'dim' }

type EmailResult = {
  subject_a?: string
  subject_b?: string
  subject_c?: string
  body?: string
  recommended_subject?: string
  subject?: string
}

type Result = {
  previewUrl: string
  email: EmailResult
  intel?: { business_name?: string; location?: string; domain?: string; url?: string }
  grade?: { total?: number; verdict?: string }
} | null

type QueuedProspect = {
  id: string
  domain: string
  business_name: string
  angle: string
  website_score: number
  status: string
  email?: string
  preview_url?: string | null
  email_json?: EmailResult | null
}

const ANGLE_COLOR: Record<string, string> = {
  new_site:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  live_chat: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
}

const STATUS_ORDER = ['queued', 'building', 'built', 'sent', 'paused']

export default function EnginePage() {
  const [domain, setDomain]         = useState('')
  const [running, setRunning]       = useState(false)
  const [logs, setLogs]             = useState<LogLine[]>([])
  const [result, setResult]         = useState<Result>(null)
  const [tab, setTab]               = useState<'preview' | 'email'>('preview')
  const [queue, setQueue]           = useState<QueuedProspect[]>([])
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [buildAllQueue, setBuildAllQueue] = useState<string[]>([])
  const [buildAllActive, setBuildAllActive] = useState(false)
  const [notes, setNotes]           = useState('')
  const [bulkOpen, setBulkOpen]     = useState(false)
  const [bulkText, setBulkText]     = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState<'a'|'b'|'c'>('b')
  const [sendingInstantly, setSendingInstantly] = useState(false)
  const [sentInstantly, setSentInstantly]       = useState(false)
  const [iframeReady, setIframeReady]           = useState(true)
  const [engineV2, setEngineV2]                 = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    loadQueue()
    const d = searchParams.get('domain')
    if (d) setDomain(d)
  }, [])

  async function loadQueue() {
    try {
      const res = await fetch('/api/engine-queue')
      const data = await res.json()
      const sorted = (data.items || []).sort((a: QueuedProspect, b: QueuedProspect) => {
        return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      })
      setQueue(sorted)

      // Restore result panel from most recent built item — but ONLY if user hasn't typed a domain
      const mostRecentBuilt = sorted.find((p: QueuedProspect) => p.status === 'built' || p.status === 'sent')
      if (mostRecentBuilt?.preview_url && mostRecentBuilt?.email_json) {
        setResult(prev => {
          // Don't overwrite if a build is already showing
          if (prev) return prev
          return {
            previewUrl: mostRecentBuilt.preview_url!,
            email: mostRecentBuilt.email_json!,
            intel: { domain: mostRecentBuilt.domain, business_name: mostRecentBuilt.business_name },
          }
        })
        const rec = (mostRecentBuilt.email_json as EmailResult).recommended_subject
        setSelectedSubject((rec as 'a'|'b'|'c') || 'b')
        // Don't set buildingId — that was locking all queue buttons to disabled
      }
    } catch {}
  }

  function addLog(text: string, level: LogLine['level'] = 'info') {
    setLogs(prev => {
      const next = [...prev, { text, level }]
      setTimeout(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
      }, 50)
      return next
    })
  }

  async function run(domainOverride?: string, prospectId?: string, rebuildNotes?: string) {
    const d = (domainOverride || domain).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()
    if (!d || running) return

    setRunning(true)
    setBuildingId(prospectId || null)
    setLogs([])
    setResult(null)
    setSentInstantly(false)
    addLog(`Starting engine for ${d}...`, 'info')

    let gotResult = false

    try {
      const res = await fetch('/api/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d, notes: rebuildNotes || notes || '', engine_v2: engineV2 }),
      })

      if (!res.body) { addLog('No response from engine', 'error'); setRunning(false); setBuildingId(null); return }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'log')   addLog(data.text, data.level || 'info')
            if (data.type === 'intel') addLog(`✓ ${data.data?.business_name} — ${data.data?.location}`, 'success')
            if (data.type === 'grade') addLog(`Score: ${data.data?.total}/10 — ${data.data?.verdict}`, 'info')
            if (data.type === 'result') {
              gotResult = true
              const p = data.payload
              const emailData = p.email || {}
              setResult({ previewUrl: p.preview_url || p.previewUrl, email: emailData, intel: p.intel, grade: p.grade })
              if (p.intel?.domain) setDomain(p.intel.domain)
              setSelectedSubject((emailData.recommended_subject as 'a'|'b'|'c') || 'b')
              setTab('preview')
              if (prospectId) setQueue(q => q.map(item => item.id === prospectId ? { ...item, status: 'built' } : item))
              // Delay iframe load ~8s for GitHub Pages CDN propagation
              setIframeReady(false)
              setTimeout(() => setIframeReady(true), 8000)
            }
            if (data.type === 'done') {
              setRunning(false)
              setBuildingId(null)
              // If build-all is active, pop next from queue
              setBuildAllQueue(prev => {
                if (prev.length > 0) {
                  const [next, ...rest] = prev
                  setTimeout(() => {
                    setQueue(q => {
                      const item = q.find(p => p.id === next)
                      if (item) run(item.domain, item.id)
                      return q
                    })
                  }, 500)
                  return rest
                }
                setBuildAllActive(false)
                return []
              })
            }
            if (data.type === 'error') { addLog(data.text, 'error'); setRunning(false); setBuildingId(null); setBuildAllQueue([]); setBuildAllActive(false) }
          } catch {}
        }
      }
    } catch (e: unknown) {
      // If we already got a result event, the stream drop is cosmetic — build succeeded
      if (!gotResult) {
        addLog((e instanceof Error ? e.message : 'Connection error'), 'error')
      }
      setRunning(false)
      setBuildingId(null)
    }
  }

  async function addBulkToQueue() {
    const domains = bulkText
      .split(/[\n,]+/)
      .map(d => d.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim())
      .filter(d => d.length > 3 && d.includes('.'))

    if (!domains.length) return
    setBulkLoading(true)

    try {
      await fetch('/api/engine-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains }),
      })
      setBulkText('')
      setBulkOpen(false)
      setResult(null)
      setBuildingId(null)
      await loadQueue()
    } catch {}
    setBulkLoading(false)
  }

  async function removeFromQueue(id: string) {
    try {
      await fetch(`/api/engine-queue?id=${id}`, { method: 'DELETE' })
      setQueue(q => q.filter(p => p.id !== id))
    } catch {}
  }

  async function pauseInQueue(id: string, paused: boolean) {
    try {
      await fetch('/api/engine-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: paused ? 'paused' : 'queued' }),
      })
      setQueue(q => q.map(p => p.id === id ? { ...p, status: paused ? 'paused' : 'queued' } : p))
    } catch {}
  }

  async function clearQueue() {
    if (!confirm('Clear all queued prospects?')) return
    try {
      await fetch('/api/engine-queue?clear=true', { method: 'DELETE' })
      setQueue([])
    } catch {}
  }

  async function sendToInstantly() {
    if (!result) return
    setSendingInstantly(true)
    const subjectKey = `subject_${selectedSubject}` as keyof EmailResult
    const subject = result.email[subjectKey] || result.email.subject_b || ''
    try {
      await fetch('/api/send-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: result.intel?.domain ? `info@${result.intel.domain}` : '',
          subject,
          body: result.email.body || '',
          business_name: result.intel?.business_name || '',
          domain: result.intel?.domain || '',
        }),
      })
      setSentInstantly(true)
      if (buildingId) setQueue(q => q.map(p => p.id === buildingId ? { ...p, status: 'sent' } : p))
    } catch {}
    setSendingInstantly(false)
  }

  async function buildAll() {
    const toBuild = visibleQueue.filter(p => p.status === 'queued')
    if (toBuild.length === 0 || running) return
    const [first, ...rest] = toBuild
    setBuildAllActive(true)
    setBuildAllQueue(rest.map(p => p.id))
    run(first.domain, first.id)
  }

  const subjectLabel = { a: 'A — Curiosity', b: 'B — Pain Point', c: 'C — Benefit' }
  // Queue sidebar only shows items still to be worked — built/sent live on Lead Magnets
  const visibleQueue = queue.filter(p => ['queued', 'building', 'paused'].includes(p.status))
  const queuedCount   = queue.filter(p => p.status === 'queued').length
  const pausedCount   = queue.filter(p => p.status === 'paused').length

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left: queue panel ── */}
      <div className="w-64 shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Queue</p>
            <div className="flex items-center gap-2">
              {queue.length > 0 && (
                <button onClick={clearQueue} title="Clear queue" className="text-zinc-700 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <button onClick={loadQueue} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
          {visibleQueue.length > 0 && (
            <p className="text-zinc-600 text-[10px]">{queuedCount} queued{pausedCount > 0 ? ` · ${pausedCount} paused` : ''}</p>
          )}
          {queuedCount > 1 && (
            <button
              onClick={buildAll}
              disabled={running || buildAllActive}
              className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {buildAllActive
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Building {buildAllQueue.length + 1} left...</>
                : <><Zap className="w-3 h-3 text-amber-400" /> Build All ({queuedCount})</>
              }
            </button>
          )}
          {/* Bulk paste toggle */}
          <button
            onClick={() => setBulkOpen(o => !o)}
            className="w-full flex items-center justify-between text-[10px] text-zinc-500 hover:text-amber-400 transition-colors py-0.5"
          >
            <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Bulk add domains</span>
            {bulkOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {bulkOpen && (
            <div className="space-y-1.5">
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={"u31bar.com\nbluefootsd.com\nfrostme.com"}
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 resize-none font-mono"
              />
              <button
                onClick={addBulkToQueue}
                disabled={bulkLoading || !bulkText.trim()}
                className="w-full py-1.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black text-xs font-bold rounded-lg transition-colors"
              >
                {bulkLoading ? 'Adding...' : 'Add to Queue'}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 min-h-0">
          {visibleQueue.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Clock className="w-5 h-5 text-zinc-700 mx-auto mb-2" />
              <p className="text-zinc-700 text-xs">Prospects from Scout appear here</p>
            </div>
          ) : (
            visibleQueue.map(p => (
              <div key={p.id} className={clsx(
                'rounded-lg border p-2.5 transition-all group',
                p.status === 'paused'  ? 'border-zinc-700/30 bg-zinc-900/20 opacity-50'
                : buildingId === p.id  ? 'border-amber-400/40 bg-amber-400/5'
                : p.status === 'built' ? 'border-green-400/20 bg-green-400/5'
                : p.status === 'sent'  ? 'border-sky-400/20 bg-sky-400/5'
                : 'border-zinc-700/60 bg-zinc-800/30'
              )}>
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-medium truncate">{p.business_name}</p>
                    <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer"
                      className="text-zinc-600 hover:text-zinc-400 text-[10px] truncate mt-0.5 flex items-center gap-0.5 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      {p.domain} <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-zinc-500 text-[10px] tabular-nums">{p.website_score}/10</span>
                      <span className={clsx('text-[10px] font-medium px-1 py-0.5 rounded border', ANGLE_COLOR[p.angle] || 'text-zinc-400 bg-zinc-800 border-zinc-700')}>
                        {p.angle === 'new_site' ? '⚡ New Site' : '💬 Live Chat'}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {p.status === 'sent' ? (
                      <span className="text-[10px] text-sky-400 font-medium">Sent</span>
                    ) : p.status === 'built' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : buildingId === p.id ? (
                      <button disabled className="text-[10px] font-bold px-2 py-1 bg-amber-400/60 text-black rounded-md whitespace-nowrap flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Building
                      </button>
                    ) : (
                      <button
                        onClick={() => run(p.domain, p.id)}
                        disabled={running || p.status === 'paused'}
                        className="text-[10px] font-bold px-2 py-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-md transition-colors whitespace-nowrap"
                      >
                        {p.status === 'paused' ? 'Paused' : running ? 'Queued' : 'Build'}
                      </button>
                    )}
                    {/* Row actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.status !== 'sent' && p.status !== 'built' && (
                        <button
                          onClick={() => pauseInQueue(p.id, p.status !== 'paused')}
                          title={p.status === 'paused' ? 'Resume' : 'Pause'}
                          className="text-zinc-600 hover:text-zinc-400"
                        >
                          <Pause className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <button onClick={() => removeFromQueue(p.id)} title="Remove" className="text-zinc-600 hover:text-red-400">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right: build UI ── */}
      <div className="flex-1 flex flex-col min-w-0 p-6 gap-4">

        {/* Header + input */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-amber-400/10 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">Engine</h1>
              <p className="text-zinc-500 text-xs mt-0.5">URL in → Smart Site + outreach out</p>
            </div>
          </div>

          <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !running && run()}
                placeholder="paste any domain — e.g. frostme.com"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-400 transition-colors"
              />
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional) — e.g. darker hero, more urgent CTA, push the happy hour..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2 text-white placeholder-zinc-600 text-xs focus:outline-none focus:border-amber-400/60 transition-colors"
              />
              {/* V2 toggle */}
              <button
                onClick={() => setEngineV2(v => !v)}
                className={`self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  engineV2
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${engineV2 ? 'bg-violet-400' : 'bg-zinc-600'}`} />
                {engineV2 ? 'Engine V2 — ON' : 'Engine V2 — OFF'}
              </button>
            </div>
            <button
              onClick={() => { setResult(null); setBuildingId(null); run() }}
              disabled={running || !domain.trim()}
              className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-bold text-sm rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {running && !buildingId
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Building...</>
                : result && result.intel?.domain === domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()
                  ? <><RotateCcw className="w-4 h-4" /> Rebuild</>
                  : <><Zap className="w-4 h-4" /> Build Smart Site</>
              }
            </button>
          </div>
        </div>

        {/* Result panel — full width */}
        <div className="flex-1 flex flex-col min-h-0 gap-0">

          {/* Result panel */}
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col overflow-hidden min-h-0">
            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-4 shrink-0">
              <button
                onClick={() => setTab('preview')}
                className={clsx('text-xs font-medium flex items-center gap-1.5 transition-colors',
                  tab === 'preview' ? 'text-amber-400' : 'text-zinc-500 hover:text-white'
                )}
              >
                <Globe className="w-3.5 h-3.5" /> Smart Site
              </button>
              <button
                onClick={() => setTab('email')}
                className={clsx('text-xs font-medium flex items-center gap-1.5 transition-colors',
                  tab === 'email' ? 'text-amber-400' : 'text-zinc-500 hover:text-white'
                )}
              >
                <Mail className="w-3.5 h-3.5" /> Outreach
              </button>
              {result?.intel?.business_name && (
                <span className="ml-auto text-xs text-zinc-600 truncate">{result.intel.business_name}</span>
              )}
            </div>

            <div className="flex-1 overflow-hidden min-h-0">
              {!result && (
                <div className="h-full flex flex-col items-center justify-center gap-2">
                  {running
                    ? <><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /><p className="text-zinc-600 text-sm">Building Smart Site...</p></>
                    : <><Zap className="w-5 h-5 text-zinc-700" /><p className="text-zinc-700 text-sm">Preview will appear here</p></>
                  }
                </div>
              )}

              {result && tab === 'preview' && (
                <div className="h-full flex flex-col">
                  {iframeReady
                    ? <iframe src={result.previewUrl} className="flex-1 w-full border-none" />
                    : <div className="flex-1 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                        <p className="text-zinc-500 text-xs">Waiting for deploy to propagate...</p>
                      </div>
                  }
                  <div className="px-4 py-2.5 border-t border-zinc-800 flex items-center justify-between shrink-0 gap-3">
                    <div className="flex items-center gap-3 shrink-0">
                      {result.intel?.url && (
                        <a href={result.intel.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
                          Old site <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <a href={result.previewUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                        Smart Site <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {/* domain auto-fills top input — rebuild from there */}
                  </div>
                </div>
              )}

              {result && tab === 'email' && (
                <div className="h-full overflow-auto p-5 space-y-4">
                  {result.grade && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500">Site score</span>
                      <span className="text-amber-400 font-bold text-sm">{result.grade.total}/10</span>
                      <span className="text-zinc-500 text-xs">{result.grade.verdict}</span>
                    </div>
                  )}

                  {/* Subject selector */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Select Subject</p>
                    {(['a','b','c'] as const).map(key => {
                      const subjectKey = `subject_${key}` as keyof EmailResult
                      const text = result!.email[subjectKey]
                      if (!text) return null
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedSubject(key)}
                          className={clsx(
                            'w-full flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors',
                            selectedSubject === key
                              ? 'border-amber-400/40 bg-amber-400/5'
                              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
                          )}
                        >
                          <span className={clsx('text-[10px] font-bold shrink-0 mt-0.5',
                            selectedSubject === key ? 'text-amber-400' : 'text-zinc-600'
                          )}>
                            {subjectLabel[key].split('—')[0]}
                          </span>
                          <p className="text-zinc-200 text-xs leading-relaxed">{text as string}</p>
                        </button>
                      )
                    })}
                  </div>

                  {/* Body */}
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">Email Body</p>
                    <pre className="text-zinc-300 text-xs whitespace-pre-wrap font-sans leading-relaxed bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                      {result.email.body || '—'}
                    </pre>
                  </div>

                  {/* Send to Instantly */}
                  <button
                    onClick={sendToInstantly}
                    disabled={sendingInstantly || sentInstantly}
                    className={clsx(
                      'w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors',
                      sentInstantly
                        ? 'bg-green-400/10 text-green-400 border border-green-400/20 cursor-default'
                        : 'bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white'
                    )}
                  >
                    {sentInstantly
                      ? <><CheckCircle2 className="w-4 h-4" /> Sent to Instantly</>
                      : sendingInstantly
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                      : <><Send className="w-4 h-4" /> Send to Instantly</>
                    }
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Log strip — slim, only visible while building or on error */}
          {(running || logs.some(l => l.level === 'error')) && (
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 rounded-b-xl">
              <div
                ref={logRef}
                className="px-4 py-2 font-mono text-[11px] overflow-y-auto max-h-24 space-y-0.5"
              >
                {logs.slice(-12).map((l, i) => (
                  <p key={i} className={clsx(
                    l.level === 'success' && 'text-green-400',
                    l.level === 'error'   && 'text-red-400',
                    l.level === 'dim'     && 'text-zinc-600',
                    l.level === 'info'    && 'text-zinc-400',
                  )}>
                    {l.text}
                  </p>
                ))}
                {running && <p className="text-amber-400 animate-pulse">▌</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
