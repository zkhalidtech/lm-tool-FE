'use client'

import { ScoutProvider } from './scout/ScoutContext'

export default function DashboardClientWrapper({ children }: { children: React.ReactNode }) {
  return <ScoutProvider>{children}</ScoutProvider>
}
