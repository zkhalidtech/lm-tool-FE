'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Globe, Zap, BarChart2, TrendingUp, Crosshair, Settings, LogOut, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import type { User } from '@supabase/supabase-js'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/scout', label: 'Scout', icon: Crosshair },
  { href: '/dashboard/engine', label: 'Engine', icon: Zap },
  { href: '/dashboard/lead-magnets', label: 'Leads', icon: Globe },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: BarChart2 },
  { href: '/dashboard/insights', label: 'Insights', icon: TrendingUp },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className={clsx(
      'bg-zinc-950 border-r border-zinc-800 flex flex-col shrink-0 transition-all duration-200',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo + collapse toggle */}
      <div className={clsx(
        'border-b border-zinc-800 flex items-center shrink-0',
        collapsed ? 'px-0 py-5 justify-center' : 'px-5 py-5 justify-between'
      )}>
        {!collapsed && (
          <div>
            <span className="text-xl font-black text-white tracking-tight">LVRG</span>
            <span className="text-xs text-zinc-500 block mt-0.5">Lead Magnet Engine</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-zinc-800"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronsRight className="w-4 h-4" />
            : <ChevronsLeft className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={clsx(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                active
                  ? 'bg-amber-400/10 text-amber-400'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className={clsx('border-t border-zinc-800', collapsed ? 'px-2 py-4' : 'px-3 py-4')}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {user.user_metadata?.full_name || user.email}
              </p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
        {collapsed && user.user_metadata?.avatar_url && (
          <div className="flex justify-center mb-2">
            <img
              src={user.user_metadata.avatar_url}
              alt=""
              className="w-7 h-7 rounded-full"
              title={user.user_metadata?.full_name || user.email}
            />
          </div>
        )}
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={clsx(
            'w-full flex items-center rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors',
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
