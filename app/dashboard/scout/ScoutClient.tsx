'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send, Loader2, ExternalLink, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Crosshair, Clock, Plus, Zap, RotateCcw,
  Wrench,
} from 'lucide-react'
import clsx from 'clsx'
import { useScout, type Prospect, type Message, type ScoutSession } from './ScoutContext'

// ─── Constants ────────────────────────────────────────────────────────────────

const ANGLE_LABEL: Record<string, string> = {
  new_site:  'New Site',
  live_chat: 'AI Live Chat',
}

const ANGLE_COLOR: Record<string, string> = {
  new_site:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  live_chat: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
}

const TOOL_LABEL: Record<string, string> = {
  search_prospects: 'Searching for prospects...',
  scrape_and_grade: 'Reading sites...',
  save_to_queue:    'Saving to engine queue...',
}

const ANGLE_ICON: Record<string, string> = {
  new_site:  '⚡',
  live_chat: '💬',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score <= 3 ? 'text-green-400 bg-green-400/10'
    : score <= 5 ? 'text-amber-400 bg-amber-400/10'
    : score <= 7 ? 'text-yellow-400 bg-yellow-400/10'
    : 'text-red-400 bg-red-400/10'
  return (
    <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full tabular-nums', color)}>
      {score}/10
    </span>
  )
}

function Chip({ label, onClick, variant = 'default' }: {
  label: string; onClick: () => void; variant?: 'default' | 'confirm' | 'skip' | 'primary'
}) {
  return (
    <button onClick={onClick} className={clsx(
      'px-3 py-1.5 rounded-full text-xs font-medium border transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap',
      variant === 'confirm' && 'border-emerald-400/40 text-emerald-400 bg-emerald-400/5 hover:bg-emerald-400/10',
      variant === 'skip'    && 'border-red-400/30 text-red-400 bg-red-400/5 hover:bg-red-400/10',
      variant === 'primary' && 'border-amber-400/60 text-amber-400 bg-amber-400/10 hover:bg-amber-400/20',
      variant === 'default' && 'border-zinc-700 text-zinc-300 bg-zinc-800/80 hover:border-amber-400/50 hover:text-white',
    )}>
      {label}
    </button>
  )
}

function ProspectSummaryBlock({
  prospects, dismissed, onQueue, onNotAFit, onQueueAll,
}: {
  prospects: Prospect[]
  dismissed: Set<string>
  onQueue: (p: Prospect) => void
  onNotAFit: (domain: string) => void
  onQueueAll: (prospects: Prospect[]) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const visible = prospects.filter(p => !dismissed.has(p.domain))
  if (visible.length === 0) return null

  const targets    = visible.filter(p => !p.borderline)
  const borderlines = visible.filter(p => p.borderline)

  function toggle(domain: string) {
    setExpanded(prev => prev === domain ? null : domain)
  }

  function ProspectRow({ p, dim = false }: { p: Prospect; dim?: boolean }) {
    const open = expanded === p.domain
    return (
      <div className={clsx('border-b border-zinc-800/60 last:border-0 transition-opacity', dim && 'opacity-50')}>
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-zinc-800/40 transition-colors"
          onClick={() => toggle(p.domain)}
        >
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.primary_color }} />
          <span className="flex-1 text-zinc-200 text-xs font-medium truncate">
            {p.business_name}
            {dim && <span className="ml-1.5 text-yellow-600 text-[10px]">maybe</span>}
          </span>
          <ScoreBadge score={p.website_score} />
          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0', ANGLE_COLOR[p.angle])}>
            {ANGLE_ICON[p.angle]} {ANGLE_LABEL[p.angle]}
          </span>
          {open
            ? <ChevronUp className="w-3 h-3 text-zinc-600 shrink-0" />
            : <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0" />}
        </div>
        {open && (
          <div className="px-3 pb-3 space-y-2.5 bg-zinc-900/40">
            <p className="text-zinc-400 text-xs leading-relaxed">{p.pain_point}</p>
            {p.angle_reason && (
              <p className={clsx('text-xs leading-relaxed font-medium', ANGLE_COLOR[p.angle].split(' ')[0])}>
                {ANGLE_LABEL[p.angle]}: {p.angle_reason}
              </p>
            )}
            <div className="flex items-center gap-3 text-[11px] text-zinc-600">
              {p.email && <span className="truncate">{p.email}</span>}
              {p.phone && <span>{p.phone}</span>}
              <a
                href={`https://${p.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="ml-auto flex items-center gap-1 hover:text-zinc-400 transition-colors shrink-0"
              >
                {p.domain} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={e => { e.stopPropagation(); onQueue(p) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold rounded-lg transition-colors"
              >
                <Zap className="w-3 h-3" /> Queue
              </button>
              <button
                onClick={e => { e.stopPropagation(); onNotAFit(p.domain) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-zinc-800 hover:bg-red-400/10 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-400/20 text-xs font-semibold rounded-lg transition-colors"
              >
                <XCircle className="w-3 h-3" /> Not a fit
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-700/60 overflow-hidden bg-zinc-900/60 text-xs w-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-800/40">
        <span className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px]">
          {visible.length} prospect{visible.length !== 1 ? 's' : ''} found
        </span>
        <span className="text-zinc-600 text-[10px]">click to expand</span>
      </div>
      {targets.map(p => <ProspectRow key={p.domain} p={p} />)}
      {borderlines.map(p => <ProspectRow key={p.domain} p={p} dim />)}
      {targets.length > 1 && (
        <div className="px-3 py-2.5 border-t border-zinc-800 bg-zinc-800/20">
          <button
            onClick={() => onQueueAll(targets)}
            className="w-full flex items-center justify-center gap-2 py-2 bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border border-amber-400/20 text-xs font-bold rounded-lg transition-colors"
          >
            <Zap className="w-3 h-3" /> Queue all {targets.length}
          </button>
        </div>
      )}
    </div>
  )
}

function SessionItem({ session, active, onClick }: {
  session: ScoutSession; active: boolean; onClick: () => void
}) {
  const date = new Date(session.created_at)
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <button onClick={onClick} className={clsx(
      'w-full text-left px-3 py-2.5 rounded-lg transition-all group',
      active ? 'bg-amber-400/10 border border-amber-400/20' : 'hover:bg-zinc-800/60 border border-transparent'
    )}>
      <p className={clsx('text-xs font-medium truncate', active ? 'text-amber-400' : 'text-zinc-300 group-hover:text-white')}>
        {session.session_name}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-zinc-600 text-xs">{label}</span>
        {session.prospect_count > 0 && (
          <span className="text-zinc-600 text-xs">· {session.prospect_count} prospects</span>
        )}
      </div>
    </button>
  )
}

// ─── Main UI ──────────────────────────────────────────────────────────────────

export default function ScoutClient() {
  const {
    messages, status, allProspects, dismissed, sessions, sessionId,
    lastUserMessage, sendMessage, handleChip, queueProspect, queueAll,
    markNotAFit, startFreshSession, loadSession,
  } = useScout()

  // Local UI state — doesn't need to survive navigation
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    sendMessage(text)
    setInput('')
  }

  const isbusy = status !== 'idle'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left: session history ── */}
      <div className="w-52 shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="px-4 py-4 border-b border-zinc-800 shrink-0 flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Sessions</p>
          <button onClick={startFreshSession}
            className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors rounded-md hover:bg-zinc-800"
            title="New session">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 min-h-0">
          {sessions.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <Clock className="w-5 h-5 text-zinc-700 mx-auto mb-2" />
              <p className="text-zinc-700 text-xs">Past sessions appear here</p>
            </div>
          ) : (
            sessions.map(s => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === sessionId}
                onClick={() => loadSession(s.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Center: chat ── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 shrink-0 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-400/10 rounded-lg flex items-center justify-center">
            <Crosshair className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-none">Scout</h1>
            <p className="text-zinc-500 text-xs mt-0.5">AI prospecting agent</p>
          </div>
          {status !== 'idle' && (
            <div className="ml-3 flex items-center gap-1.5 text-xs text-amber-400/70">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Running in background</span>
            </div>
          )}
          <button onClick={startFreshSession}
            className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800">
            <RotateCcw className="w-3 h-3" />
            New session
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3 min-h-0">

          {messages.map((msg: Message) => {

            if (msg.type === 'user') return (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-amber-400 text-black px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm font-medium max-w-sm">
                  {msg.text}
                </div>
              </div>
            )

            if (msg.type === 'scout_reply') return (
              <div key={msg.id} className="space-y-2.5">
                <div className="flex items-start gap-2.5 max-w-xl">
                  <div className="w-6 h-6 bg-amber-400/10 rounded-full flex items-center justify-center mt-0.5 shrink-0">
                    <Crosshair className="w-3 h-3 text-amber-400" />
                  </div>
                  <p className="text-zinc-200 text-sm leading-relaxed">{msg.text}</p>
                </div>
                {msg.chips?.length > 0 && (
                  <div className="flex flex-wrap gap-2 pl-8">
                    {msg.chips.map((c: string) => (
                      <Chip key={c} label={c} onClick={() => handleChip(c)}
                        variant={
                          c.toLowerCase().includes('add') && c.toLowerCase().includes('engine') ? 'primary'
                          : c.toLowerCase().includes('run') || c.toLowerCase().includes('icp') ? 'primary'
                          : 'default'
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )

            if (msg.type === 'tool_call') return (
              <div key={msg.id} className="flex items-center gap-2 text-zinc-500 text-xs pl-1">
                <Wrench className="w-3 h-3 text-amber-400/60 shrink-0 animate-pulse" />
                <span className="font-mono">{TOOL_LABEL[msg.tool] || `Running ${msg.tool}...`}</span>
              </div>
            )

            if (msg.type === 'prospect_summary') return (
              <div key={msg.id} className="w-full max-w-lg">
                <ProspectSummaryBlock
                  prospects={msg.prospects}
                  dismissed={dismissed}
                  onQueue={queueProspect}
                  onNotAFit={markNotAFit}
                  onQueueAll={queueAll}
                />
              </div>
            )

            if (msg.type === 'narrate') return (
              <div key={msg.id} className="flex items-start gap-2.5 pl-1">
                <div className="w-1 h-1 rounded-full bg-zinc-600 mt-2 shrink-0" />
                <p className="text-zinc-500 text-xs font-mono leading-relaxed">{msg.text}</p>
              </div>
            )

            if (msg.type === 'queue_saved') return (
              <div key={msg.id} className="bg-zinc-900 border border-emerald-400/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <p className="text-emerald-400 font-semibold text-sm">
                    {msg.count} prospect{msg.count !== 1 ? 's' : ''} added to Engine queue
                  </p>
                </div>
                <p className="text-zinc-500 text-xs">Taking you to the Engine...</p>
              </div>
            )

            if (msg.type === 'error') return (
              <div key={msg.id} className="bg-red-950/30 border border-red-500/20 rounded-xl p-4 space-y-3">
                <p className="text-red-400 text-sm">{msg.text}</p>
                {msg.retryable && lastUserMessage && (
                  <button
                    onClick={() => sendMessage(lastUserMessage)}
                    className="text-xs text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    Try again
                  </button>
                )}
              </div>
            )

            return null
          })}

          {status === 'thinking' && (
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              Thinking...
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
          <form onSubmit={handleSubmit} className="flex gap-2.5">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={status === 'working'}
              placeholder={
                status === 'working'
                  ? 'Scout is working...'
                  : status === 'thinking'
                    ? 'Thinking...'
                    : allProspects.length > 0
                      ? 'Refine, search again, or add to engine...'
                      : "Describe what you're hunting..."
              }
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 disabled:opacity-40 transition-colors"
            />
            <button type="submit" disabled={!input.trim() || isbusy}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black rounded-xl transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

    </div>
  )
}
