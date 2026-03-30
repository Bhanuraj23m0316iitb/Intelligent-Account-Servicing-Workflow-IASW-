import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min for AI pipeline
})

export default api

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChangeRequest {
  id: string
  customer_id: string
  change_type: string
  old_value: string
  new_value: string
  status: string
  overall_confidence: number | null
  recommended_action: string | null
  forgery_detected: boolean | null
  filenet_reference_id: string | null
  created_at: string | null
  updated_at: string | null
  checker_decision: string | null
  checker_timestamp: string | null
  staff_id?: string | null
  staff_notes?: string | null
  document_filename?: string | null
  extracted_fields?: Record<string, string> | null
  confidence_scores?: Record<string, number> | null
  forgery_details?: string | null
  ai_summary?: string | null
  filenet_metadata?: Record<string, any> | null
  checker_id?: string | null
  checker_notes?: string | null
  rps_transaction_id?: string | null
  rps_status?: string | null
  rps_response?: Record<string, any> | null
  agent_logs?: Array<Record<string, any>> | null
  error_message?: string | null
  ai_completed_at?: string | null
}

export interface DashboardStats {
  total: number
  pending_human: number
  approved: number
  rejected: number
  failed: number
  processing: number
  avg_confidence: number | null
}

export interface Customer {
  customer_id: string
  name: string
  address: string
  dob: string
  email: string
  phone: string
  account_number: string
  status: string
}

export const STATUS_COLORS: Record<string, string> = {
  PENDING:                    'bg-slate-100 text-slate-600',
  AI_PROCESSING:              'bg-blue-100 text-blue-700',
  AI_VERIFIED_PENDING_HUMAN:  'bg-amber-100 text-amber-700',
  APPROVED:                   'bg-emerald-100 text-emerald-700',
  REJECTED:                   'bg-red-100 text-red-700',
  FAILED:                     'bg-rose-100 text-rose-700',
}

export const STATUS_LABELS: Record<string, string> = {
  PENDING:                    'Pending',
  AI_PROCESSING:              'AI Processing',
  AI_VERIFIED_PENDING_HUMAN:  'Awaiting Checker',
  APPROVED:                   'Approved',
  REJECTED:                   'Rejected',
  FAILED:                     'Failed',
}

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  legal_name: 'Legal Name Change',
  address:    'Address Update',
  dob:        'Date of Birth',
  contact:    'Contact / Email',
}

export function confidenceColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-600'
  if (score >= 0.6) return 'text-amber-600'
  return 'text-red-600'
}

export function confidenceBg(score: number): string {
  if (score >= 0.8) return 'bg-emerald-500'
  if (score >= 0.6) return 'bg-amber-500'
  return 'bg-red-500'
}
