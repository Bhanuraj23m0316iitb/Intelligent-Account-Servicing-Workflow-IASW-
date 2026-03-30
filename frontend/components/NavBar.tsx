'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Shield, FileText, CheckSquare, BarChart3 } from 'lucide-react'
import clsx from 'clsx'

const links = [
  { href: '/',         label: 'Dashboard',   icon: BarChart3 },
  { href: '/intake',   label: 'New Request',  icon: FileText },
  { href: '/checker',  label: 'Checker Queue',icon: CheckSquare },
]

export default function NavBar() {
  const pathname = usePathname()
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm group-hover:bg-blue-700 transition-colors">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">IASW</p>
              <p className="text-xs text-slate-500 leading-none mt-0.5">Account Servicing AI</p>
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  pathname === href || (href !== '/' && pathname.startsWith(href))
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>

          {/* HITL Badge */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-semibold text-amber-700">HITL Active</span>
          </div>
        </div>
      </div>
    </header>
  )
}
