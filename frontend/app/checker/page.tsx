'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  CheckSquare, Clock, Filter, RefreshCw, ArrowRight,
  AlertTriangle, CheckCircle, XCircle, Zap, Search
} from 'lucide-react'
import api, {
  ChangeRequest, STATUS_COLORS, STATUS_LABELS,
  CHANGE_TYPE_LABELS, confidenceColor
} from '@/lib/api'
import { format } from 'date-fns'
import clsx from 'clsx'

const TABS = [
  { key: 'AI_VERIFIED_PENDING_HUMAN', label: 'Awaiting Review', icon: Clock, color: 'amber' },
  { key: 'APPROVED',                  label: 'Approved',         icon: CheckCircle, color: 'emerald' },
  { key: 'REJECTED',                  label: 'Rejected',         icon: XCircle, color: 'red' },
  { key: '',                           label: 'All',              icon: Filter, color: 'slate' },
]

export default function CheckerQueuePage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('AI_VERIFIED_PENDING_HUMAN')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = activeTab ? `?status=${activeTab}&limit=100` : '?limit=100'
      const res = await api.get(`/requests${params}`)
      setRequests(res.data)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { load() }, [load])

  const filtered = requests.filter(r =>
    !search ||
    r.customer_id.toLowerCase().includes(search.toLowerCase()) ||
    r.id.toLowerCase().includes(search.toLowerCase()) ||
    r.old_value.toLowerCase().includes(search.toLowerCase()) ||
    r.new_value.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Checker Queue</h1>
          <p className="text-slate-500 text-sm mt-1">Review AI-verified requests and make final approval decisions</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm py-2 px-4">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* HITL reminder */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-700">
          <strong>Checker Responsibility:</strong> You are the final human gate.
          RPS will only be updated after your explicit approval. Review each request carefully.
        </p>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === key
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input-field pl-9 py-2 text-sm"
            placeholder="Search by customer ID, name, or request ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-10 h-10 spinner mx-auto" />
            <p className="text-sm text-slate-400 mt-4">Loading requests…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {activeTab === 'AI_VERIFIED_PENDING_HUMAN' ? 'No requests awaiting review' : 'No requests found'}
            </p>
            {activeTab === 'AI_VERIFIED_PENDING_HUMAN' && (
              <p className="text-sm mt-1">Submit a new request via the Intake form</p>
            )}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-2">Customer</div>
              <div className="col-span-3">Change Request</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Confidence</div>
              <div className="col-span-2">Submitted</div>
              <div className="col-span-1"></div>
            </div>

            <div className="divide-y divide-slate-50">
              {filtered.map(r => (
                <Link
                  key={r.id}
                  href={`/checker/${r.id}`}
                  className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group items-center"
                >
                  {/* Customer */}
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                        {r.customer_id}
                      </div>
                    </div>
                  </div>

                  {/* Change */}
                  <div className="col-span-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {CHANGE_TYPE_LABELS[r.change_type] || r.change_type}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {r.old_value} → {r.new_value}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    <span className={`badge ${STATUS_COLORS[r.status]}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                    {r.forgery_detected && (
                      <span className="badge bg-red-100 text-red-700 mt-1 ml-1">
                        ⚠ Forgery
                      </span>
                    )}
                  </div>

                  {/* Confidence */}
                  <div className="col-span-2">
                    {r.overall_confidence != null ? (
                      <div className="space-y-1">
                        <p className={`text-sm font-bold ${confidenceColor(r.overall_confidence)}`}>
                          {(r.overall_confidence * 100).toFixed(1)}%
                        </p>
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full confidence-bar ${
                              r.overall_confidence >= 0.8 ? 'bg-emerald-500' :
                              r.overall_confidence >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${r.overall_confidence * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500">
                      {r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '—'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.created_at ? format(new Date(r.created_at), 'HH:mm:ss') : ''}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div className="col-span-1 flex justify-end">
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-center text-slate-400">
        Showing {filtered.length} request{filtered.length !== 1 ? 's' : ''}
        {activeTab && ` · Filter: ${STATUS_LABELS[activeTab] || activeTab}`}
      </p>
    </div>
  )
}
