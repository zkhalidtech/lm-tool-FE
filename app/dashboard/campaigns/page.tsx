'use client'

import { useEffect, useState } from 'react'
import { BarChart2, RefreshCw, ExternalLink, TrendingUp, Mail, MousePointer, MessageSquare, ArrowDownUp } from 'lucide-react'
import clsx from 'clsx'

type Campaign = {
  id: string
  name: string
  status: number
  created: string
  total: number
  sent: number
  opens: number
  clicks: number
  replied: number
  bounced: number
  openRate: number
  replyRate: number
}

type Lead = {
  id: string
  email: string
  firstName: string
  companyName: string
  website: string
  campaignId: string
  status: number
  statusLabel: string
  statusColor: string
  opens: number
  clicks: number
  replies: number
  lastContact: string
}

const STATUS_COLORS: Record<string, string> = {
  red: 'text-red-400 bg-red-400/10',
  zinc: 'text-zinc-400 bg-zinc-400/10',
  blue: 'text-blue-400 bg-blue-400/10',
  amber: 'text-amber-400 bg-amber-400/10',
  green: 'text-green-400 bg-green-400/10',
  purple: 'text-purple-400 bg-purple-400/10',
  emerald: 'text-emerald-400 bg-emerald-400/10',
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ leads_updated: number } | null>(null)

  const runSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      setSyncResult(data)
      await fetchData() // refresh campaigns after sync
    } catch (e) { console.error(e) }
    finally { setSyncing(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns || [])
      setLeads(data.leads || [])
      setLastRefresh(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filteredLeads = selectedCampaign
    ? leads.filter(l => l.campaignId === selectedCampaign)
    : leads

  const totalStats = campaigns.reduce((acc, c) => ({
    total: acc.total + c.total,
    sent: acc.sent + c.sent,
    opens: acc.opens + c.opens,
    clicks: acc.clicks + c.clicks,
    replied: acc.replied + c.replied,
    bounced: acc.bounced + c.bounced,
  }), { total: 0, sent: 0, opens: 0, clicks: 0, replied: 0, bounced: 0 })

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-amber-400" /> Campaigns
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Last updated {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
        <button
          onClick={runSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          <ArrowDownUp className={clsx('w-3.5 h-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Syncing...' : 'Sync Instantly'}
        </button>
      </div>
      {syncResult && (
        <div className="text-xs text-zinc-500 text-right">
          Last sync: {syncResult.leads_updated} lead{syncResult.leads_updated !== 1 ? 's' : ''} updated
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Leads', value: totalStats.total, icon: Mail },
          { label: 'Emails Sent', value: totalStats.sent, icon: Mail },
          { label: 'Opens', value: totalStats.opens, icon: TrendingUp },
          { label: 'Clicks', value: totalStats.clicks, icon: MousePointer },
          { label: 'Replies', value: totalStats.replied, icon: MessageSquare },
          { label: 'Bounced', value: totalStats.bounced, icon: MousePointer },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* Campaigns table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">All Campaigns</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Campaign', 'Status', 'Leads', 'Sent', 'Opens', 'Clicks', 'Open %', 'Replies', 'Reply %', 'Bounced'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-zinc-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-zinc-600 text-sm">Loading…</td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-zinc-600 text-sm">No campaigns found</td>
                </tr>
              ) : campaigns.map(c => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCampaign(selectedCampaign === c.id ? null : c.id)}
                  className={clsx(
                    'border-b border-zinc-800/50 cursor-pointer transition-colors',
                    selectedCampaign === c.id ? 'bg-amber-400/5' : 'hover:bg-zinc-800/50'
                  )}
                >
                  <td className="px-5 py-3">
                    <span className="text-white font-medium">{c.name}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      c.status === 1 ? 'text-green-400 bg-green-400/10' :
                      c.status === 0 ? 'text-zinc-400 bg-zinc-400/10' :
                      'text-amber-400 bg-amber-400/10'
                    )}>
                      {c.status === 1 ? 'Active' : c.status === 0 ? 'Paused' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-300">{c.total}</td>
                  <td className="px-5 py-3 text-zinc-300">{c.sent}</td>
                  <td className="px-5 py-3 text-zinc-300">{c.opens}</td>
                  <td className="px-5 py-3 text-zinc-300">{c.clicks}</td>
                  <td className="px-5 py-3">
                    <span className={clsx('font-medium', c.openRate > 30 ? 'text-green-400' : c.openRate > 10 ? 'text-amber-400' : 'text-zinc-400')}>
                      {c.openRate}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-300">{c.replied}</td>
                  <td className="px-5 py-3">
                    <span className={clsx('font-medium', c.replyRate > 10 ? 'text-green-400' : c.replyRate > 3 ? 'text-amber-400' : 'text-zinc-400')}>
                      {c.replyRate}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-red-400">{c.bounced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            {selectedCampaign ? 'Campaign Leads' : 'All Leads'}
            <span className="text-zinc-500 font-normal ml-2">({filteredLeads.length})</span>
          </h2>
          {selectedCampaign && (
            <button onClick={() => setSelectedCampaign(null)} className="text-xs text-zinc-500 hover:text-white">
              Clear filter ×
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Company', 'Email', 'Status', 'Opens', 'Clicks', 'Replies', 'Last Contact', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-zinc-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-zinc-600 text-sm">Loading…</td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-zinc-600 text-sm">No leads found</td>
                </tr>
              ) : filteredLeads.map(l => (
                <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-white font-medium text-sm">{l.companyName}</p>
                    {l.website && (
                      <a href={l.website.startsWith('http') ? l.website : `https://${l.website}`} target="_blank" rel="noopener noreferrer"
                        className="text-zinc-500 text-xs hover:text-amber-400 flex items-center gap-0.5 mt-0.5">
                        {l.website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 30)}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-400 text-xs">{l.email}</td>
                  <td className="px-5 py-3">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[l.statusColor] || 'text-zinc-400 bg-zinc-400/10')}>
                      {l.statusLabel}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-300">{l.opens}</td>
                  <td className="px-5 py-3 text-zinc-300">{l.clicks}</td>
                  <td className="px-5 py-3 text-zinc-300">{l.replies}</td>
                  <td className="px-5 py-3 text-zinc-500 text-xs">
                    {l.lastContact ? new Date(l.lastContact).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {l.website && (
                      <a href={l.website.startsWith('http') ? l.website : `https://${l.website}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-zinc-600 hover:text-amber-400 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
