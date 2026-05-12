import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import { devPlaceholderUser, isDevAuthBypass } from '@/lib/dev-auth-bypass'
import DashboardClientWrapper from './DashboardClientWrapper'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !isDevAuthBypass()) redirect('/auth/login')

  const sidebarUser = user ?? devPlaceholderUser()

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar user={sidebarUser} />
      <DashboardClientWrapper>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </DashboardClientWrapper>
    </div>
  )
}
