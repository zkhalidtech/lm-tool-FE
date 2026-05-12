'use client'

import { useState } from 'react'
import { Users, Zap, ExternalLink, Plus } from 'lucide-react'
import clsx from 'clsx'
import Link from 'next/link'
import type { Lead } from '@/lib/leads'

const STATUSES = ['all', 'queued', 'building', 'built', 'sent', 'opened', 'replied', 'booked', 'bounced'] as const
const OFFERS = ['all', 'Website Rebuild', 'Website Grade', 'Smart Site', 'AI Chat'] as const

const STATUS_STYLES: Record<string, string> = {
  queued:   'text-zinc-400 bg-zinc-400/10',
  building: 'text-blue-400 bg-blue-400/10',
  built:    'text-amber-400 bg-amber-400/10',
  sent:     'text-green-400 bg-green-400/10',
  opened:   'text-cyan-400 bg-cyan-400/10',
  clicked:  'text-purple-400 bg-purple-400/10',
  replied:  'text-violet-400 bg-violet-400/10',
  booked:   'text-emerald-400 bg-emerald-400/10',
  bounced:  'text-red-400 bg-red-400/10',
}

const PIPELINE_STEPS = ['queued', 'built', 'sent', 'opened', 'replied', 'booked']

export default function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads] = useState<Lead[]>(initialLeads)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [offerFilter, setOfferFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = leads.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (offerFilter !== 'all' && l.offer !== offerFilter) return false
    if (search && !l.domain?.includes(search) && !l.company_name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Pipeline counts
  const pipelineCounts = PIPELINE_STEPS.reduce((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" /> Leads
          </h1>
          <p className="text-zinc-500 text-sm mt-1">{leads.length} total leads</p>
        </div>
        <Link
          href="/dashboard/engine"
          className="flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-xl transition-colors"
        >
          <Zap className="w-4 h-4" /> Run Engine
        </Link>
      </div>

      {/* Pipeline bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-4">Pipeline</p>
        <div className="flex items-center gap-0">
          {PIPELINE_STEPS.map((step, i) => {
            const count = pipelineCounts[step] || 0
            const isLast = i === PIPELINE_STEPS.length - 1
            return (
              <div key={step} className="flex items-center flex-1">
                <button
                  onClick={() => setStatusFilter(statusFilter === step ? 'all' : step)}
                  className={clsx(
                    'flex-1 text-center py-2.5 px-2 transition-colors rounded-lg',
                    statusFilter === step ? 'bg-amber-400/15 border border-amber-400/30' : 'hover:bg-zinc-800'
                  )}
                >
                  <p className={clsx('text-xl font-bold', count > 0 ? 'text-white' : 'text-zinc-600')}>{count}</p>
                  <p className="text-xs text-zinc-500 capitalize mt-0.5">{step}</p>
                </button>
                {!isLast && <div className="text-zinc-700 text-xs px-1">→</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search domain or company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 w-64"
        />
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {OFFERS.map(o => (
            <button
              key={o}
              onClick={() => setOfferFilter(o)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                offerFilter === o ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'
              )}
            >
              {o === 'all' ? 'All Offers' : o}
            </button>
          ))}
        </div>
      </div>

      {/* Leads table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            {statusFilter === 'all' ? 'All Leads' : <span className="capitalize">{statusFilter}</span>}
            <span className="text-zinc-500 font-normal ml-2">({filtered.length})</span>
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-zinc-500 text-sm mb-4">No leads yet.</p>
            <Link
              href="/dashboard/engine"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-xl transition-colors"
            >
              <Zap className="w-4 h-4" /> Run your first domain
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Company', 'Domain', 'Offer', 'CTA', 'Status', 'Preview', 'Added'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-zinc-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{l.company_name || '—'}</p>
                      {l.email && <p className="text-zinc-500 text-xs mt-0.5">{l.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-zinc-400 text-xs">{l.domain}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium">
                        {l.offer}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-400 text-xs">{l.cta}</td>
                    <td className="px-5 py-3">
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium capitalize', STATUS_STYLES[l.status] || 'text-zinc-400 bg-zinc-400/10')}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {l.preview_url ? (
                        <a href={l.preview_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 text-xs">
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
