import type { Metadata } from 'next'
import './globals.css'
import NavBar from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'IASW — Intelligent Account Servicing Workflow',
  description: 'AI-powered banking account change request verification with Human-in-the-Loop oversight',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <NavBar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="border-t border-slate-200 bg-white mt-auto">
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-400">
              <span>IASW v1.0 — Intelligent Account Servicing Workflow</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                AI Pipeline Active
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
