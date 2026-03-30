'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart3, Clock, CheckCircle, XCircle, AlertTriangle,
  Zap, ArrowRight, RefreshCw, FileText, TrendingUp,
  RotateCcw, Database, User, ChevronDown, ChevronUp, ShieldAlert
} from 'lucide-react'
import api, {
  ChangeRequest, DashboardStats,
  STATUS_COLORS, STATUS_LABELS, CHANGE_TYPE_LABELS,
  confidenceColor, Customer
} from '@/lib/api'
import { format } from 'date-fns'
import clsx from 'clsx'

const FIELD_LABELS: Record<string, string> = {
  legal_name: 'Name',
  address:    'Address',
  dob:        'Date of Birth',
  contact:    'Email',
}

export default function DashboardPage() {
  const [stats, setStats]       = useState<DashboardStats | null>(null)
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading]   = useState(true)
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [showRPS, setShowRPS]   = useState(true)
  const [confirmReset, setConfirmReset] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, c] = await Promise.all([
        api.get('/stats'),
        api.get('/requests?limit=10'),
        api.get('/customers'),
      ])
      setStats(s.data)
      setRequests(r.data)
      setCustomers(c.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleReset = async () => {
    setResetting(true)
    setResetMsg('')
    try {
      const res = await api.post('/admin/reset-rps')
      setResetMsg(`✅ ${res.data.message}`)
      setConfirmReset(false)
      await load()
    } catch {
      setResetMsg('❌ Reset failed. Is the backend running?')
    } finally {
      setResetting(false)
    }
  }

  const statCards = stats ? [
    { label: 'Total Requests',   value: stats.total,        icon: FileText,    bg: 'bg-blue-50',   text: 'text-blue-700',   icon_bg: 'bg-blue-600' },
    { label: 'Awaiting Checker', value: stats.pending_human,icon: Clock,       bg: 'bg-amber-50',  text: 'text-amber-700',  icon_bg: 'bg-amber-500' },
    { label: 'Approved',         value: stats.approved,     icon: CheckCircle, bg: 'bg-emerald-50',text: 'text-emerald-700',icon_bg: 'bg-emerald-600' },
    { label: 'Rejected',         value: stats.rejected,     icon: XCircle,     bg: 'bg-red-50',    text: 'text-red-700',    icon_bg: 'bg-red-600' },
    { label: 'AI Processing',    value: stats.processing,   icon: Zap,         bg: 'bg-indigo-50', text: 'text-indigo-700', icon_bg: 'bg-indigo-600' },
    { label: 'Avg Confidence',   value: stats.avg_confidence != null ? `${(stats.avg_confidence * 100).toFixed(1)}%` : '—',
      icon: TrendingUp, bg: 'bg-violet-50', text: 'text-violet-700', icon_bg: 'bg-violet-600' },
  ] : []

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Intelligent Account Servicing Workflow — Overview</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="btn-secondary text-sm py-2 px-4">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link href="/intake" className="btn-primary text-sm py-2 px-4">
            <FileText className="w-4 h-4" />
            New Request
          </Link>
        </div>
      </div>

      {/* ── HITL Banner ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 flex items-start gap-4">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Human-in-the-Loop (HITL) Enforcement Active</p>
          <p className="text-xs text-amber-700 mt-0.5">
            The AI pipeline performs automated verification but <strong>cannot write to RPS autonomously</strong>.
            Every approval must be explicitly triggered by an authorised Checker Supervisor.
          </p>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map(({ label, value, icon: Icon, bg, text, icon_bg }) => (
            <div key={label} className={`card ${bg} border-0 flex flex-col gap-3`}>
              <div className={`w-9 h-9 rounded-xl ${icon_bg} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${text}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* RPS LIVE STATE + RESET                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="card p-0 overflow-hidden">

        {/* Header row */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-wrap gap-3">
          <button
            onClick={() => setShowRPS(o => !o)}
            className="font-semibold text-slate-800 flex items-center gap-2 hover:text-blue-600 transition-colors"
          >
            <Database className="w-4 h-4 text-blue-600" />
            RPS Live Customer Records
            {showRPS
              ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            }
          </button>

          {/* Reset button area */}
          <div className="flex items-center gap-3">
            {resetMsg && (
              <span className={clsx(
                'text-xs font-semibold px-3 py-1 rounded-full',
                resetMsg.startsWith('✅')
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              )}>
                {resetMsg}
              </span>
            )}

            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-700 font-semibold">Reset all customers?</span>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {resetting
                    ? <><RefreshCw className="w-3 h-3 animate-spin" /> Resetting…</>
                    : <><RotateCcw className="w-3 h-3" /> Confirm Reset</>
                  }
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setConfirmReset(true); setResetMsg('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-300 text-orange-700 text-xs font-semibold rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset RPS to Defaults
              </button>
            )}
          </div>
        </div>

        {/* Warning strip */}
        {confirmReset && (
          <div className="flex items-center gap-3 px-6 py-3 bg-red-50 border-b border-red-200">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs text-red-700">
              This will reset <strong>all customer records</strong> (C001, C002, C003) back to their original seed values
              and clear the RPS transaction log. Change request history in the DB is unaffected.
            </p>
          </div>
        )}

        {/* Customer cards */}
        {showRPS && (
          <div className="p-6">
            {customers.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">No customers loaded</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {customers.map(c => (
                  <div key={c.customer_id} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{c.customer_id}</p>
                      </div>
                      <span className={clsx(
                        'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
                        c.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      )}>
                        {c.status}
                      </span>
                    </div>

                    {/* Fields */}
                    <div className="space-y-2 text-xs">
                      {[
                        ['Account', c.account_number],
                        ['DOB',     c.dob],
                        ['Email',   c.email],
                        ['Phone',   c.phone],
                        ['Address', c.address],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <span className="text-slate-400 w-14 shrink-0">{label}</span>
                          <span className="text-slate-700 font-medium break-all">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-4 text-center">
              ↑ These are the <strong>live current values</strong> in the mock RPS.
              They update immediately when a Checker approves a change.
            </p>
          </div>
        )}
      </div>

      {/* ── Recent Requests ── */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Recent Requests
          </h2>
          <Link href="/checker" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No requests yet</p>
            <p className="text-sm mt-1">Submit a change request to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {requests.map((r) => (
              <Link
                key={r.id}
                href={`/checker/${r.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {CHANGE_TYPE_LABELS[r.change_type] || r.change_type}
                    </p>
                    <span className={`badge ${STATUS_COLORS[r.status]}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.customer_id} · {r.old_value} → {r.new_value}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {r.overall_confidence != null && (
                    <p className={`text-sm font-bold ${confidenceColor(r.overall_confidence)}`}>
                      {(r.overall_confidence * 100).toFixed(1)}%
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {r.created_at ? format(new Date(r.created_at), 'MMM d, HH:mm') : '—'}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
