import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'there'

  const stats = [
    { label: 'Leads in Queue', value: '0', sub: 'Ready to run' },
    { label: 'Sites Built', value: '5', sub: 'This month' },
    { label: 'Emails Sent', value: '0', sub: 'Via Instantly' },
    { label: 'Calls Booked', value: '0', sub: 'From outreach' },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Hey {firstName} 👋</h1>
        <p className="text-zinc-400 mt-1">Here's what's happening with your lead magnet engine.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">{s.label}</p>
            <p className="text-3xl font-bold text-white mt-1">{s.value}</p>
            <p className="text-zinc-500 text-xs mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4">
        <a
          href="/dashboard/leads"
          className="bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 rounded-xl p-5 transition-colors group"
        >
          <div className="text-amber-400 text-xl mb-3">⚡</div>
          <h3 className="text-white font-semibold">Run Engine</h3>
          <p className="text-zinc-400 text-sm mt-1">Paste a domain and build a lead magnet site in 60 seconds.</p>
        </a>
        <a
          href="/dashboard/leads"
          className="bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 rounded-xl p-5 transition-colors group"
        >
          <div className="text-amber-400 text-xl mb-3">👥</div>
          <h3 className="text-white font-semibold">Manage Leads</h3>
          <p className="text-zinc-400 text-sm mt-1">View, tag, and queue leads for your lead magnet campaigns.</p>
        </a>
        <a
          href="/dashboard/settings"
          className="bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 rounded-xl p-5 transition-colors group"
        >
          <div className="text-amber-400 text-xl mb-3">🏢</div>
          <h3 className="text-white font-semibold">Brand Setup</h3>
          <p className="text-zinc-400 text-sm mt-1">Configure your brand, booking link, and outreach settings.</p>
        </a>
      </div>
    </div>
  )
}
