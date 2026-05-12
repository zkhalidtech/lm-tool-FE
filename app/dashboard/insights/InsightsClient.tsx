'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Mail, MessageSquare, Calendar, RefreshCw, Sparkles } from 'lucide-react'

type Stats = {
  total: number
  sent: number
  opened: number
  replied: number
  booked: number
  bounced: number
  openRate: string
  replyRate: string
  bookRate: string
  recent: number
  avgScore: string | null
  byOffer: Record<string, { sent: number; replied: number; booked: number }>
  byCTA: Record<string, { sent: number; booked: number }>
}

export default function InsightsClient() {
  const [narrative, setNarrative] = useState<string>('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await fetch('/api/insights', { cache: 'no-store' })
      const data = await res.json()
      setNarrative(data.narrative || '')
      setStats(data.stats || null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400 text-sm">Analyzing your pipeline…</p>
        </div>
      </div>
    )
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-96">
        <div className="text-center max-w-sm">
          <TrendingUp className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-white font-semibold mb-2">No data yet</h2>
          <p className="text-zinc-500 text-sm">Run the engine on a few domains and insights will appear here automatically.</p>
        </div>
      </div>
    )
  }

  const statCards = [
    {
      label: 'Open Rate',
      value: `${stats.openRate}%`,
      sub: `${stats.opened} of ${stats.sent} sent`,
      icon: Mail,
      color: 'text-cyan-400',
    },
    {
      label: 'Reply Rate',
      value: `${stats.replyRate}%`,
      sub: `${stats.replied} replies`,
      icon: MessageSquare,
      color: 'text-violet-400',
    },
    {
      label: 'Book Rate',
      value: `${stats.bookRate}%`,
      sub: `${stats.booked} calls booked`,
      icon: Calendar,
      color: 'text-emerald-400',
    },
    {
      label: 'Added (7d)',
      value: `${stats.recent}`,
      sub: `${stats.total} total leads`,
      icon: TrendingUp,
      color: 'text-amber-400',
    },
  ]

  // Best offer by reply rate
  const offerEntries = Object.entries(stats.byOffer)
  const bestOffer = offerEntries.sort((a, b) => {
    const rateA = a[1].sent > 0 ? a[1].replied / a[1].sent : 0
    const rateB = b[1].sent > 0 ? b[1].replied / b[1].sent : 0
    return rateB - rateA
  })

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-amber-400" /> Insights
          </h1>
          <p className="text-zinc-500 text-sm mt-1">What's working and what to do next.</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Claude narrative */}
      {narrative && (
        <div className="bg-zinc-900 border border-amber-400/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">AI Summary</span>
          </div>
          <div className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{narrative}</div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-3xl font-bold text-white">{s.value}</p>
            <p className="text-zinc-600 text-xs mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Offer breakdown */}
      {bestOffer.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-4">Performance by Offer</p>
          <div className="space-y-3">
            {bestOffer.map(([offer, d]) => {
              const replyRate = d.sent > 0 ? ((d.replied / d.sent) * 100).toFixed(1) : '0'
              const bookRate = d.sent > 0 ? ((d.booked / d.sent) * 100).toFixed(1) : '0'
              const barWidth = d.sent > 0 ? Math.min(100, (d.replied / d.sent) * 100 * 5) : 0
              return (
                <div key={offer}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-white font-medium">{offer}</span>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>{d.sent} sent</span>
                      <span className="text-violet-400">{replyRate}% reply</span>
                      <span className="text-emerald-400">{bookRate}% booked</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-700"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CTA breakdown */}
      {Object.keys(stats.byCTA).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-4">Performance by CTA</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(stats.byCTA).map(([cta, d]) => {
              const bookRate = d.sent > 0 ? ((d.booked / d.sent) * 100).toFixed(1) : '0'
              return (
                <div key={cta} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3">
                  <span className="text-sm text-zinc-300">"{cta}"</span>
                  <div className="text-right">
                    <p className="text-white font-semibold text-sm">{bookRate}%</p>
                    <p className="text-zinc-500 text-xs">book rate</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
