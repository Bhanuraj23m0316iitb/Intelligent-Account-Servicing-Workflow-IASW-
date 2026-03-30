'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, XCircle, AlertTriangle, FileText, Shield,
  ChevronLeft, Loader2, Clock, User, Hash, Calendar,
  Activity, Database, Eye, ThumbsUp, ThumbsDown, Terminal,
  ChevronDown, ChevronUp, Archive, BarChart2, Zap
} from 'lucide-react'
import api, {
  ChangeRequest, STATUS_COLORS, STATUS_LABELS,
  CHANGE_TYPE_LABELS, confidenceColor, confidenceBg
} from '@/lib/api'
import { format } from 'date-fns'
import clsx from 'clsx'

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string, icon: any, children: React.ReactNode, defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-6 py-4 hover:bg-slate-50 transition-colors"
      >
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-600" />
          {title}
        </h3>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-slate-100">{children}</div>}
    </div>
  )
}

function ConfidenceBar({ label, score }: { label: string, score: number }) {
  const pct = Math.round(score * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600 font-medium capitalize">
          {label.replace(/_/g, ' ')}
        </span>
        <span className={`font-bold text-sm ${confidenceColor(score)}`}>{pct}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full confidence-bar ${confidenceBg(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function KV({ label, value, mono = false }: { label: string, value: string | number | null | undefined, mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</span>
      <span className={clsx('text-sm text-slate-800', mono ? 'font-mono' : 'font-medium')}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CheckerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [req, setReq] = useState<ChangeRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showLogs, setShowLogs] = useState(false)

  // Checker form
  const [checkerId, setCheckerId] = useState('CHECKER001')
  const [checkerNotes, setCheckerNotes] = useState('')
  const [confirmAction, setConfirmAction] = useState<'approved' | 'rejected' | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/requests/${id}`)
      setReq(res.data)
    } catch {
      setError('Request not found.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const submitDecision = async (decision: 'approved' | 'rejected') => {
    if (!checkerId.trim()) { setError('Checker ID is required.'); return }
    setDeciding(true)
    setError('')
    try {
      const res = await api.post(`/requests/${id}/decision`, {
        checker_id: checkerId,
        decision,
        checker_notes: checkerNotes,
      })
      setSuccess(res.data.message)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Decision submission failed.')
    } finally {
      setDeciding(false)
      setConfirmAction(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 spinner mx-auto" />
          <p className="text-sm text-slate-400">Loading request…</p>
        </div>
      </div>
    )
  }

  if (!req) {
    return (
      <div className="text-center py-32 text-slate-400">
        <XCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="font-medium text-lg">Request not found</p>
        <Link href="/checker" className="btn-primary mt-6 inline-flex">Back to Queue</Link>
      </div>
    )
  }

  const isPending = req.status === 'AI_VERIFIED_PENDING_HUMAN'
  const isApproved = req.status === 'APPROVED'
  const isRejected = req.status === 'REJECTED'
  const isFailed = req.status === 'FAILED'

  const recColor = {
    approve: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    review:  'text-amber-700 bg-amber-50 border-amber-200',
    reject:  'text-red-700 bg-red-50 border-red-200',
  }[req.recommended_action || 'review'] || 'text-slate-700 bg-slate-50 border-slate-200'

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Breadcrumb + Header */}
      <div className="space-y-1">
        <Link href="/checker" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 w-fit">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Queue
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {CHANGE_TYPE_LABELS[req.change_type] || req.change_type} — {req.customer_id}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{req.id}</p>
          </div>
          <span className={`badge text-sm px-3 py-1 ${STATUS_COLORS[req.status]}`}>
            {STATUS_LABELS[req.status] || req.status}
          </span>
        </div>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Decision Recorded</p>
            <p className="text-sm text-emerald-700 mt-0.5">{success}</p>
            {req.rps_transaction_id && (
              <p className="text-xs text-emerald-600 mt-1 font-mono">
                RPS Transaction: {req.rps_transaction_id}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {isFailed && req.error_message && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-5 py-4">
          <p className="font-semibold text-rose-800 text-sm">AI Pipeline Failed</p>
          <p className="text-sm text-rose-700 mt-1">{req.error_message}</p>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT: AI Summary + Scores */}
        <div className="lg:col-span-2 space-y-6">

          {/* AI Summary */}
          {req.ai_summary && (
            <Section title="AI Verification Summary" icon={Zap}>
              <div className="mt-4 space-y-4">
                {/* Recommendation badge */}
                <div className={`border rounded-xl p-4 ${recColor}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4" />
                    <span className="font-semibold text-sm uppercase tracking-wide">
                      AI Recommendation: {req.recommended_action?.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{req.ai_summary}</p>
                </div>

                {/* Forgery warning */}
                {req.forgery_detected && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800 text-sm">Forgery Indicators Detected</p>
                      <p className="text-sm text-red-700 mt-1">{req.forgery_details}</p>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Confidence Scores */}
          {req.confidence_scores && Object.keys(req.confidence_scores).length > 0 && (
            <Section title="Confidence Score Card" icon={BarChart2}>
              <div className="mt-4 space-y-4">
                {/* Overall */}
                {req.overall_confidence != null && (
                  <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Overall Confidence</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-slate-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full confidence-bar ${confidenceBg(req.overall_confidence)}`}
                          style={{ width: `${req.overall_confidence * 100}%` }}
                        />
                      </div>
                      <span className={`text-xl font-bold ${confidenceColor(req.overall_confidence)}`}>
                        {(req.overall_confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Per-field */}
                <div className="space-y-3">
                  {Object.entries(req.confidence_scores).map(([field, score]) => (
                    <ConfidenceBar key={field} label={field} score={score} />
                  ))}
                </div>

                {/* Legend */}
                <div className="flex gap-4 pt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"/>≥ 80% Pass</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"/>60–80% Review</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"/>{'< 60% Flag'}</span>
                </div>
              </div>
            </Section>
          )}

          {/* Extracted Fields */}
          {req.extracted_fields && Object.keys(req.extracted_fields).length > 0 && (
            <Section title="Extracted Document Fields (OCR)" icon={Eye} defaultOpen={false}>
              <div className="mt-2 grid grid-cols-2 gap-x-6">
                {Object.entries(req.extracted_fields).map(([k, v]) => (
                  <KV key={k} label={k.replace(/_/g, ' ')} value={v} />
                ))}
              </div>
            </Section>
          )}

          {/* Agent Logs */}
          <Section title="Agent Execution Logs" icon={Terminal} defaultOpen={false}>
            <div className="mt-3">
              <button
                onClick={() => setShowLogs(o => !o)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showLogs ? 'Hide' : 'Show'} {req.agent_logs?.length || 0} log entries
              </button>

              {showLogs && req.agent_logs && (
                <div className="mt-3 bg-slate-900 rounded-xl p-4 overflow-auto max-h-80 space-y-1">
                  {req.agent_logs.map((log, i) => (
                    <div key={i} className="font-mono text-xs leading-relaxed">
                      <span className="text-slate-500">{log.ts?.split('T')[1]?.split('.')[0]} </span>
                      <span className={clsx(
                        'font-bold',
                        log.level === 'ERROR' ? 'text-red-400' :
                        log.level === 'WARNING' ? 'text-amber-400' : 'text-emerald-400'
                      )}>[{log.level}] </span>
                      <span className="text-blue-300">{log.agent} </span>
                      <span className="text-slate-300">{log.event}</span>
                      {log.result && Object.keys(log.result).length > 0 && (
                        <span className="text-slate-500"> {JSON.stringify(log.result).slice(0, 120)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* RIGHT: Request Info + HITL Decision */}
        <div className="space-y-6">

          {/* Request Info */}
          <Section title="Request Details" icon={FileText}>
            <div className="mt-1">
              <KV label="Customer ID" value={req.customer_id} />
              <KV label="Change Type" value={CHANGE_TYPE_LABELS[req.change_type] || req.change_type} />
              <KV label="Current Value" value={req.old_value} />
              <KV label="New Value" value={req.new_value} />
              <KV label="Staff ID" value={req.staff_id} />
              <KV label="Document" value={req.document_filename} />
              <KV label="Submitted" value={req.created_at ? format(new Date(req.created_at), 'MMM d yyyy HH:mm') : '—'} />
              {req.staff_notes && <KV label="Staff Notes" value={req.staff_notes} />}
            </div>
          </Section>

          {/* FileNet Reference */}
          <Section title="Document Archive (FileNet)" icon={Archive} defaultOpen={false}>
            <div className="mt-1">
              <KV label="Reference ID" value={req.filenet_reference_id} mono />
              <KV label="Archived At" value={req.filenet_metadata?.archived_at
                ? format(new Date(req.filenet_metadata.archived_at), 'MMM d yyyy HH:mm')
                : '—'} />
              <KV label="File Size" value={req.filenet_metadata?.file_size_bytes
                ? `${(req.filenet_metadata.file_size_bytes / 1024).toFixed(1)} KB`
                : '—'} />
              <KV label="Retention" value={req.filenet_metadata?.retention_policy?.replace('_', ' ')} />
              <KV label="Classification" value={req.filenet_metadata?.classification} />
            </div>
          </Section>

          {/* RPS Result (after decision) */}
          {(isApproved || isRejected) && (
            <Section title="Outcome" icon={Database}>
              <div className="mt-1">
                <KV label="Decision" value={req.checker_decision?.toUpperCase()} />
                <KV label="Checker" value={req.checker_id} />
                <KV label="Decision Time" value={req.checker_timestamp
                  ? format(new Date(req.checker_timestamp), 'MMM d yyyy HH:mm:ss')
                  : '—'} />
                {req.checker_notes && <KV label="Notes" value={req.checker_notes} />}
                {req.rps_transaction_id && (
                  <KV label="RPS Transaction" value={req.rps_transaction_id} mono />
                )}
                {req.rps_status && <KV label="RPS Status" value={req.rps_status} />}
              </div>
            </Section>
          )}

          {/* ═══ HITL DECISION PANEL ═══ */}
          {isPending && (
            <div className="card border-2 border-amber-200 bg-amber-50 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-700" />
                <h3 className="font-bold text-amber-800">Checker Decision</h3>
              </div>

              <p className="text-xs text-amber-700">
                This is the <strong>Human-in-the-Loop gate</strong>. Your decision will be permanently 
                recorded. Approval triggers the RPS write-call.
              </p>

              <div>
                <label className="label text-amber-700">Checker ID *</label>
                <input
                  className="input-field text-sm"
                  value={checkerId}
                  onChange={e => setCheckerId(e.target.value)}
                  placeholder="Your checker ID"
                />
              </div>

              <div>
                <label className="label text-amber-700">Decision Notes</label>
                <textarea
                  className="input-field resize-none text-sm"
                  rows={3}
                  value={checkerNotes}
                  onChange={e => setCheckerNotes(e.target.value)}
                  placeholder="Optional notes for audit trail…"
                />
              </div>

              {/* Confirm UI */}
              {confirmAction ? (
                <div className={clsx(
                  'rounded-xl p-4 space-y-3 border',
                  confirmAction === 'approved'
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                )}>
                  <p className={clsx(
                    'text-sm font-semibold',
                    confirmAction === 'approved' ? 'text-emerald-800' : 'text-red-800'
                  )}>
                    Confirm {confirmAction === 'approved' ? '✓ Approval' : '✗ Rejection'}?
                  </p>
                  <p className="text-xs text-slate-600">
                    {confirmAction === 'approved'
                      ? 'This will trigger an immediate RPS write-call to update the customer record.'
                      : 'The request will be rejected. No changes will be made to RPS.'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className={clsx(
                        'flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1',
                        confirmAction === 'approved'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      )}
                      onClick={() => submitDecision(confirmAction)}
                      disabled={deciding}
                    >
                      {deciding
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                        : confirmAction === 'approved' ? '✓ Confirm Approve' : '✗ Confirm Reject'
                      }
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50"
                      onClick={() => setConfirmAction(null)}
                      disabled={deciding}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    className="flex-1 btn-success justify-center py-3"
                    onClick={() => setConfirmAction('approved')}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    className="flex-1 btn-danger justify-center py-3"
                    onClick={() => setConfirmAction('rejected')}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Closed state */}
          {(isApproved || isRejected) && (
            <div className={clsx(
              'card border-2 text-center py-8',
              isApproved ? 'border-emerald-200 bg-emerald-50' : 'border-red-100 bg-red-50'
            )}>
              {isApproved
                ? <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                : <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              }
              <p className={clsx('font-bold text-lg', isApproved ? 'text-emerald-800' : 'text-red-800')}>
                {isApproved ? 'Approved & RPS Updated' : 'Request Rejected'}
              </p>
              <p className="text-sm text-slate-500 mt-1">by {req.checker_id}</p>
              {req.rps_transaction_id && (
                <p className="text-xs font-mono text-emerald-700 mt-2">{req.rps_transaction_id}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
