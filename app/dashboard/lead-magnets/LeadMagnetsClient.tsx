'use client'

import { useState, useCallback } from 'react'
import { Zap, ExternalLink, Search, Globe, Send, CheckCircle2, Loader2, ChevronDown, RotateCcw, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import Link from 'next/link'

type Site = {
  id: string
  domain: string
  business_name: string
  email: string | null
  phone?: string | null
  preview_url: string | null
  website_score: number | null
  status: string
  angle: string
  pain_point: string | null
  primary_color: string
  created_at: string
  updated_at: string
  sent_at: string | null
  opened_at: string | null
  replied_at: string | null
  subject_a?: string
  subject_b?: string
  subject_c?: string
  email_body?: string
  recommended_subject: string
  // Structured Instantly variables
  owner_name?: string
  neighborhood?: string
  business_type?: string
  hook?: string
  grade?: number | null
}

type SubjectKey = 'a' | 'b' | 'c'

const ANGLE_LABEL: Record<string, string> = {
  new_site:  '⚡ New Site',
  live_chat: '💬 AI Live Chat',
}
const ANGLE_COLOR: Record<string, string> = {
  new_site:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  live_chat: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
}
const SUBJECT_LABEL: Record<SubjectKey, string> = {
  a: 'A · Curiosity',
  b: 'B · Pain Point',
  c: 'C · Benefit',
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function GradeBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-zinc-600">—</span>
  const hot = score <= 4
  const mid = score <= 6
  return (
    <span className={clsx(
      'inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold',
      hot ? 'bg-green-400/15 text-green-400' : mid ? 'bg-amber-400/15 text-amber-400' : 'bg-zinc-800 text-zinc-400'
    )}>
      {score}
    </span>
  )
}

function PipelineDot({ label, date }: { label: string; date: string | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={clsx('w-2 h-2 rounded-full', date ? 'bg-green-400' : 'bg-zinc-700')} />
      <span className="text-[9px] text-zinc-600">{label}</span>
    </div>
  )
}

export default function LeadMagnetsClient({ initialSites }: { initialSites: Site[] }) {
  const router = useRouter()
  const [sites, setSites]               = useState<Site[]>(initialSites)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'built' | 'sent'>('all')
  const [angleFilter, setAngleFilter]   = useState<'all' | 'new_site' | 'live_chat'>('all')
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [bulkSubject, setBulkSubject]   = useState<SubjectKey>('b')
  const [sending, setSending]           = useState(false)
  const [sentIds, setSentIds]           = useState<Set<string>>(new Set())
  const [campaignId, setCampaignId]     = useState<string>('9ec11d36-1c63-4260-a78d-422bc2742181')
  const [editingEmail, setEditingEmail] = useState<string | null>(null)  // site.id being edited
  const [emailDraft, setEmailDraft]     = useState<string>('')
  const [deleting, setDeleting]         = useState(false)

  const filtered = sites.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (angleFilter !== 'all' && s.angle !== angleFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.domain?.toLowerCase().includes(q) && !s.business_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const allSelected  = filtered.length > 0 && filtered.every(s => selected.has(s.id))
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(s => n.delete(s.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(s => n.add(s.id)); return n })
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function deleteSelected() {
    if (!selected.size || deleting) return
    setDeleting(true)
    const ids = Array.from(selected)
    try {
      await fetch('/api/leads/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setSites(prev => prev.filter(s => !ids.includes(s.id)))
      setSelected(new Set())
    } catch {}
    setDeleting(false)
  }

  async function saveEmail(siteId: string) {
    const site = sites.find(s => s.id === siteId)
    if (!site || !emailDraft.trim()) { setEditingEmail(null); return }
    const newEmail = emailDraft.trim()
    // Optimistic update
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, email: newEmail } : s))
    setEditingEmail(null)
    // Persist to Supabase leads table
    try {
      await fetch('/api/leads/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: siteId, email: newEmail }),
      })
    } catch {}
  }

  const sendSelected = useCallback(async () => {
    const toSend = sites.filter(s => selected.has(s.id) && !sentIds.has(s.id))
    if (!toSend.length) return
    setSending(true)

    await Promise.allSettled(toSend.map(async site => {
      const subjectKey = `subject_${bulkSubject}` as keyof Site
      const subject = (site[subjectKey] as string) || site.subject_b || ''
      if (!subject || !site.email) return

      try {
        await fetch('/api/send-outreach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: site.id,
            email: site.email,
            subject,
            email_body: site.email_body || '',
            preview_url: site.preview_url || '',
            business_name: site.business_name,
            owner_name: site.owner_name || '',
            neighborhood: site.neighborhood || '',
            business_type: site.business_type || '',
            pain_point: site.pain_point || '',
            hook: site.hook || site.angle || '',
            grade: site.grade ?? site.website_score ?? null,
            campaign_id: campaignId,
          }),
        })
        setSentIds(prev => new Set(prev).add(site.id))
        setSites(prev => prev.map(s => s.id === site.id ? { ...s, status: 'sent', sent_at: new Date().toISOString() } : s))
      } catch {}
    }))

    setSelected(new Set())
    setSending(false)
  }, [sites, selected, sentIds, bulkSubject])

  const builtCount = sites.filter(s => s.status === 'built').length
  const sentCount  = sites.filter(s => s.status === 'sent').length

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ── */}
      <div className="px-8 pt-6 pb-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-amber-400" /> Lead Magnets
            </h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {sites.length} Smart Sites — {builtCount} ready to send · {sentCount} sent
            </p>
          </div>
          <Link
            href="/dashboard/engine"
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold rounded-lg transition-colors"
          >
            <Zap className="w-3.5 h-3.5" /> Engine
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition-colors w-44"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden">
            {(['all', 'built', 'sent'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  statusFilter === s ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {s === 'all' ? 'All' : s === 'built' ? `Ready (${builtCount})` : `Sent (${sentCount})`}
              </button>
            ))}
          </div>

          {/* Angle filter */}
          <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden">
            {(['all', 'new_site', 'live_chat'] as const).map(a => (
              <button
                key={a}
                onClick={() => setAngleFilter(a)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  angleFilter === a ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {a === 'all' ? 'All Angles' : ANGLE_LABEL[a]}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-zinc-600">{filtered.length} shown</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Globe className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-zinc-400 font-medium text-sm">No Smart Sites yet</p>
            <p className="text-zinc-600 text-xs mt-1">Build sites in the Engine and they'll appear here</p>
            <Link href="/dashboard/engine" className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold rounded-lg transition-colors">
              <Zap className="w-3.5 h-3.5" /> Go to Engine
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-950 border-b border-zinc-800">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded accent-amber-400 cursor-pointer"
                  />
                </th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Business</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-16">Grade</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Angle</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Subject lines</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-32">Pipeline</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-20">Built</th>
                <th className="w-20 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.map(site => {
                const isSelected = selected.has(site.id)
                const previewUrl = site.preview_url ||
                  `https://joshclifford.github.io/lvrg-previews/${site.domain.replace(/^www\./, '').replace(/\//g, '-')}/index.html`
                const rec = (site.recommended_subject || 'b') as SubjectKey

                return (
                  <tr
                    key={site.id}
                    onClick={() => toggleOne(site.id)}
                    className={clsx(
                      'cursor-pointer transition-colors group',
                      isSelected ? 'bg-amber-400/5' : 'hover:bg-zinc-800/40'
                    )}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(site.id)}
                        className="w-3.5 h-3.5 rounded accent-amber-400 cursor-pointer"
                      />
                    </td>

                    {/* Business */}
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <p className="text-white font-medium text-xs leading-none">{site.business_name}</p>
                      <p className="text-zinc-500 text-[11px] mt-0.5">{site.domain}</p>
                      {/* Email — inline editable */}
                      {editingEmail === site.id ? (
                        <input
                          autoFocus
                          value={emailDraft}
                          onChange={e => setEmailDraft(e.target.value)}
                          onBlur={() => saveEmail(site.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEmail(site.id); if (e.key === 'Escape') setEditingEmail(null) }}
                          className="mt-1 w-full bg-zinc-800 border border-amber-400/40 rounded px-1.5 py-0.5 text-[11px] text-white outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingEmail(site.id); setEmailDraft(site.email || '') }}
                          className={clsx('mt-0.5 text-[10px] text-left truncate max-w-[180px] block transition-colors',
                            site.email ? 'text-zinc-500 hover:text-amber-400' : 'text-zinc-700 hover:text-amber-400 italic'
                          )}
                        >
                          {site.email || '+ add email'}
                        </button>
                      )}
                      {site.phone && <p className="text-zinc-700 text-[10px]">{site.phone}</p>}
                    </td>

                    {/* Grade */}
                    <td className="px-3 py-3">
                      <GradeBadge score={site.website_score} />
                    </td>

                    {/* Angle */}
                    <td className="px-3 py-3">
                      <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap', ANGLE_COLOR[site.angle] || 'text-zinc-400 bg-zinc-800 border-zinc-700')}>
                        {ANGLE_LABEL[site.angle] || site.angle}
                      </span>
                    </td>

                    {/* Subject lines */}
                    <td className="px-3 py-3 max-w-xs">
                      {site.subject_a || site.subject_b || site.subject_c ? (
                        <div className="space-y-0.5">
                          {(['a', 'b', 'c'] as SubjectKey[]).map(k => {
                            const text = site[`subject_${k}` as keyof Site] as string | undefined
                            if (!text) return null
                            return (
                              <p key={k} className={clsx(
                                'text-[11px] truncate leading-relaxed',
                                rec === k ? 'text-zinc-200' : 'text-zinc-600'
                              )}>
                                <span className={clsx('font-bold mr-1', rec === k ? 'text-amber-400' : 'text-zinc-700')}>
                                  {k.toUpperCase()}
                                </span>
                                {text}
                              </p>
                            )
                          })}
                        </div>
                      ) : (
                        <span className="text-zinc-700 text-[11px]">No subjects</span>
                      )}
                    </td>

                    {/* Pipeline */}
                    <td className="px-3 py-3">
                      <div className="flex items-end gap-2">
                        <PipelineDot label="Built" date={site.updated_at} />
                        <div className={clsx('flex-1 h-px mb-2', site.sent_at ? 'bg-green-400/30' : 'bg-zinc-700')} />
                        <PipelineDot label="Sent" date={site.sent_at} />
                        <div className={clsx('flex-1 h-px mb-2', site.opened_at ? 'bg-green-400/30' : 'bg-zinc-700')} />
                        <PipelineDot label="Opened" date={site.opened_at} />
                        <div className={clsx('flex-1 h-px mb-2', site.replied_at ? 'bg-green-400/30' : 'bg-zinc-700')} />
                        <PipelineDot label="Replied" date={site.replied_at} />
                      </div>
                    </td>

                    {/* Built at */}
                    <td className="px-3 py-3 text-[11px] text-zinc-600 whitespace-nowrap">
                      {timeAgo(site.updated_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 whitespace-nowrap"
                        >
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                        <button
                          onClick={() => router.push(`/dashboard/engine?domain=${encodeURIComponent(site.domain)}`)}
                          className="text-[10px] text-zinc-500 hover:text-zinc-200 flex items-center gap-0.5 whitespace-nowrap transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> Rebuild
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Floating action bar ── */}
      {someSelected && (
        <div className="shrink-0 border-t border-zinc-700 bg-zinc-900 px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-semibold text-white">
            {selected.size} selected
          </span>

          {/* Subject selector */}
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
            {(['a', 'b', 'c'] as SubjectKey[]).map(k => (
              <button
                key={k}
                onClick={() => setBulkSubject(k)}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  bulkSubject === k ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'
                )}
              >
                {SUBJECT_LABEL[k]}
              </button>
            ))}
          </div>

          {/* Subject preview */}
          <div className="flex-1 min-w-0">
            {(() => {
              const firstSelected = sites.find(s => selected.has(s.id))
              const subjectText = firstSelected?.[`subject_${bulkSubject}` as keyof Site] as string | undefined
              return subjectText
                ? <p className="text-xs text-zinc-400 truncate">"{subjectText}"</p>
                : <p className="text-xs text-zinc-600 italic">No subject for variant {bulkSubject.toUpperCase()}</p>
            })()}
          </div>

          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-400 text-xs font-semibold rounded-lg border border-red-500/20 transition-colors whitespace-nowrap"
          >
            {deleting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />
            }
            Delete {selected.size}
          </button>

          <select
            value={campaignId}
            onChange={e => setCampaignId(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2 py-2 focus:outline-none focus:border-sky-400"
          >
            <option value="9ec11d36-1c63-4260-a78d-422bc2742181">TSD Campaign #1 — New Site</option>
            <option value="fc9d696c-80b3-4c82-a11a-0153139da1a6">TSD Campaign #2 — Live Chat</option>
          </select>

          <button
            onClick={sendSelected}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap"
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
              : <><Send className="w-4 h-4" /> Send {selected.size} to Instantly</>
            }
          </button>
        </div>
      )}
    </div>
  )
}
