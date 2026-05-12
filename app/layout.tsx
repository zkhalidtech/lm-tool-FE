import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LVRG — Lead Magnet Engine',
  description: 'Automated lead magnet engine for LVRG Agency',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-black antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
