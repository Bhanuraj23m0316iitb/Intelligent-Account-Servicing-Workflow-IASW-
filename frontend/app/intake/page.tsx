'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, User, ArrowRight, CheckCircle2, AlertCircle,
  FileText, Loader2, Info, Zap, UserPlus, X, RefreshCw,
  ChevronDown, ChevronUp
} from 'lucide-react'
import api, { Customer } from '@/lib/api'
import clsx from 'clsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANGE_TYPES = [
  {
    value: 'legal_name',
    label: 'Legal Name Change',
    description: 'Marriage, deed poll, gazette',
    docs: 'Marriage Certificate, Gazette Notification, or Deed Poll',
    example: { old: 'Priya Sharma', new: 'Priya Mehta' },
  },
  {
    value: 'address',
    label: 'Address Update',
    description: 'New residential or mailing address',
    docs: 'Utility Bill, Lease Agreement, or Government ID',
    example: { old: '123 MG Road, Mumbai 400001', new: '456 Park Lane, Mumbai 400002' },
  },
  {
    value: 'dob',
    label: 'Date of Birth Correction',
    description: 'Correct DOB on record',
    docs: 'Birth Certificate, Passport, or PAN Card',
    example: { old: '1990-05-15', new: '1990-05-16' },
  },
  {
    value: 'contact',
    label: 'Contact / Email Update',
    description: 'New email or phone number',
    docs: 'Digital Consent Form',
    example: { old: 'priya.sharma@email.com', new: 'priya.mehta@email.com' },
  },
]

// ── Add Customer Modal ────────────────────────────────────────────────────────

function AddCustomerModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (c: Customer) => void
}) {
  const [form, setForm] = useState({
    customer_id: '',
    name: '',
    dob: '',
    email: '',
    phone: '',
    address: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  const handleSave = async () => {
    // Basic validation
    if (!form.name.trim())    { setError('Full name is required.'); return }
    if (!form.dob.trim())     { setError('Date of birth is required (YYYY-MM-DD).'); return }
    if (!form.email.trim())   { setError('Email is required.'); return }
    if (!form.phone.trim())   { setError('Phone number is required.'); return }
    if (!form.address.trim()) { setError('Address is required.'); return }

    // DOB format check
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) {
      setError('Date of birth must be in YYYY-MM-DD format.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload: Record<string, string> = {
        name: form.name.trim(),
        dob: form.dob.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      }
      if (form.customer_id.trim()) {
        payload.customer_id = form.customer_id.trim().toUpperCase()
      }

      const res = await api.post('/admin/add-customer', payload)
      onAdded(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to add customer. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-blue-600 text-white">
          <div className="flex items-center gap-3">
            <UserPlus className="w-5 h-5" />
            <div>
              <h2 className="font-bold text-base">Add New Customer to RPS</h2>
              <p className="text-blue-200 text-xs mt-0.5">Customer is available immediately after saving</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-blue-700 p-1.5 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">

          {/* Customer ID (optional) */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              <strong>Customer ID</strong> is optional — leave blank to auto-generate
              (C004, C005 …). Or type a custom one like <code className="bg-blue-100 px-1 rounded">C010</code>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Customer ID (optional)</label>
              <input
                className="input-field font-mono uppercase"
                placeholder="Auto-generated"
                value={form.customer_id}
                onChange={set('customer_id')}
                maxLength={10}
              />
            </div>
            <div>
              <label className="label">Full Name *</label>
              <input
                className="input-field"
                placeholder="e.g. Rahul Gupta"
                value={form.name}
                onChange={set('name')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date of Birth * (YYYY-MM-DD)</label>
              <input
                className="input-field font-mono"
                placeholder="1988-07-22"
                value={form.dob}
                onChange={set('dob')}
                maxLength={10}
              />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input
                className="input-field"
                placeholder="+91-9876543210"
                value={form.phone}
                onChange={set('phone')}
              />
            </div>
          </div>

          <div>
            <label className="label">Email *</label>
            <input
              className="input-field"
              type="email"
              placeholder="rahul.gupta@email.com"
              value={form.email}
              onChange={set('email')}
            />
          </div>

          <div>
            <label className="label">Address *</label>
            <input
              className="input-field"
              placeholder="12 Park Avenue, Delhi 110001"
              value={form.address}
              onChange={set('address')}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="btn-secondary flex-1 justify-center"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex-1 justify-center"
            disabled={saving}
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</>
              : <><UserPlus className="w-4 h-4" /> Add Customer</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Intake Page ──────────────────────────────────────────────────────────

export default function IntakePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Customers — loaded from API
  const [customers, setCustomers]       = useState<Customer[]>([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [lastAdded, setLastAdded]       = useState<string | null>(null)

  const [form, setForm] = useState({
    customer_id: '',
    change_type: '',
    old_value: '',
    new_value: '',
    staff_id: 'STAFF001',
    staff_notes: '',
  })
  const [file, setFile] = useState<File | null>(null)

  const selectedType = CHANGE_TYPES.find(t => t.value === form.change_type)
  const selectedCustomer = customers.find(c => c.customer_id === form.customer_id)

  // Load customers from live RPS
  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true)
    try {
      const res = await api.get('/customers')
      setCustomers(res.data)
    } catch {
      // fallback: show empty
    } finally {
      setCustomersLoading(false)
    }
  }, [])

  useEffect(() => { loadCustomers() }, [loadCustomers])

  // Handle a newly added customer
  const handleCustomerAdded = (c: Customer) => {
    setCustomers(prev => [...prev, c])
    setLastAdded(c.customer_id)
    setForm(p => ({ ...p, customer_id: c.customer_id }))
    setShowAddModal(false)
    // Clear the "just added" highlight after 3 seconds
    setTimeout(() => setLastAdded(null), 3000)
  }

  const handleFile = (f: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (!allowed.includes(f.type)) {
      setError('Only JPEG, PNG, GIF, WebP, or PDF files are accepted.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File must be under 10MB.')
      return
    }
    setError('')
    setFile(f)
  }

  const handleSubmit = async () => {
    if (!file) { setError('Please upload a supporting document.'); return }
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      fd.append('document', file)
      const res = await api.post('/intake/sync', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      router.push(`/checker/${res.data.id}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    { n: 1, label: 'Customer' },
    { n: 2, label: 'Change Details' },
    { n: 3, label: 'Document' },
    { n: 4, label: 'Review' },
  ]

  // ── Helper to get current field value from live RPS ───────────────────────
  const getCurrentRPSValue = () => {
    if (!selectedCustomer || !form.change_type) return ''
    const map: Record<string, keyof Customer> = {
      legal_name: 'name',
      address: 'address',
      dob: 'dob',
      contact: 'email',
    }
    return selectedCustomer[map[form.change_type]] as string || ''
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onAdded={handleCustomerAdded}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Change Request</h1>
        <p className="text-slate-500 text-sm mt-1">Submit a customer account change for AI verification</p>
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-0">
        {steps.map(({ n, label }, i) => (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                step > n ? 'bg-emerald-500 text-white' :
                step === n ? 'bg-blue-600 text-white shadow-md shadow-blue-200' :
                'bg-slate-200 text-slate-400'
              )}>
                {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
              </div>
              <span className={clsx(
                'text-xs mt-1 font-medium whitespace-nowrap',
                step === n ? 'text-blue-700' : 'text-slate-400'
              )}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={clsx(
                'flex-1 h-0.5 mx-1 mb-4 rounded',
                step > n ? 'bg-emerald-400' : 'bg-slate-200'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Customer Selection ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="card space-y-6">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" /> Customer Selection
          </h2>

          <div>
            <label className="label">Staff ID</label>
            <input
              className="input-field"
              value={form.staff_id}
              onChange={e => setForm(p => ({ ...p, staff_id: e.target.value }))}
              placeholder="Your staff ID"
            />
          </div>

          {/* Customer list header + Add button */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">Select Customer *</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadCustomers}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
                  title="Refresh customer list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${customersLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add New Customer
                </button>
              </div>
            </div>

            {/* Customer list */}
            {customersLoading ? (
              <div className="py-8 text-center text-slate-400">
                <div className="w-8 h-8 spinner mx-auto mb-2" />
                <p className="text-sm">Loading customers from RPS…</p>
              </div>
            ) : customers.length === 0 ? (
              <div className="py-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="font-medium">No customers in RPS</p>
                <p className="text-sm mt-1">Click "Add New Customer" to create one</p>
              </div>
            ) : (
              <div className="grid gap-3 max-h-72 overflow-y-auto pr-1">
                {customers.map(c => (
                  <button
                    key={c.customer_id}
                    onClick={() => setForm(p => ({ ...p, customer_id: c.customer_id }))}
                    className={clsx(
                      'flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                      form.customer_id === c.customer_id
                        ? 'border-blue-500 bg-blue-50'
                        : lastAdded === c.customer_id
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    )}
                  >
                    <div className={clsx(
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                      form.customer_id === c.customer_id ? 'bg-blue-600 text-white' :
                      lastAdded === c.customer_id ? 'bg-emerald-500 text-white' :
                      'bg-slate-100 text-slate-600'
                    )}>
                      {c.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{c.customer_id}</p>
                      <p className="text-xs text-slate-400 truncate">{c.email}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      {lastAdded === c.customer_id && (
                        <span className="badge bg-emerald-100 text-emerald-700 text-xs">
                          ✓ Just Added
                        </span>
                      )}
                      <span className={clsx(
                        'badge block',
                        c.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      )}>
                        {c.status}
                      </span>
                    </div>
                    {form.customer_id === c.customer_id && (
                      <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-2 text-center">
              {customers.length} customer{customers.length !== 1 ? 's' : ''} in RPS ·
              <button onClick={() => setShowAddModal(true)} className="text-blue-500 hover:underline ml-1">
                Add another
              </button>
            </p>
          </div>

          <button
            className="btn-primary w-full justify-center"
            disabled={!form.customer_id}
            onClick={() => setStep(2)}
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── STEP 2: Change Details ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="card space-y-6">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" /> Change Details
          </h2>

          {/* Selected customer summary */}
          {selectedCustomer && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {selectedCustomer.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{selectedCustomer.name}</p>
                <p className="text-xs text-slate-500 font-mono">{selectedCustomer.customer_id} · {selectedCustomer.email}</p>
              </div>
            </div>
          )}

          <div>
            <label className="label">Change Type *</label>
            <div className="grid gap-3">
              {CHANGE_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => {
                    const currentVal = (() => {
                      if (!selectedCustomer) return ''
                      const map: Record<string, keyof Customer> = {
                        legal_name: 'name', address: 'address',
                        dob: 'dob', contact: 'email',
                      }
                      return selectedCustomer[map[t.value]] as string || ''
                    })()
                    setForm(p => ({
                      ...p,
                      change_type: t.value,
                      old_value: currentVal,
                      new_value: '',
                    }))
                  }}
                  className={clsx(
                    'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                    form.change_type === t.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  )}
                >
                  <div className={clsx(
                    'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                    form.change_type === t.value ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  )}>
                    {form.change_type === t.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-800">{t.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedType && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  Required documents: <strong>{selectedType.docs}</strong>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Current Value (in RPS) *</label>
                  <input
                    className="input-field bg-slate-50"
                    value={form.old_value}
                    onChange={e => setForm(p => ({ ...p, old_value: e.target.value }))}
                    placeholder={getCurrentRPSValue() || selectedType.example.old}
                  />
                  {getCurrentRPSValue() && form.old_value !== getCurrentRPSValue() && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      ⚠ RPS has: <strong>{getCurrentRPSValue()}</strong>
                      <button
                        onClick={() => setForm(p => ({ ...p, old_value: getCurrentRPSValue() }))}
                        className="text-blue-600 underline ml-1"
                      >
                        Use this
                      </button>
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Requested New Value *</label>
                  <input
                    className="input-field"
                    value={form.new_value}
                    onChange={e => setForm(p => ({ ...p, new_value: e.target.value }))}
                    placeholder={selectedType.example.new}
                  />
                </div>
              </div>
              <div>
                <label className="label">Staff Notes (optional)</label>
                <textarea
                  className="input-field resize-none" rows={2}
                  value={form.staff_notes}
                  onChange={e => setForm(p => ({ ...p, staff_notes: e.target.value }))}
                  placeholder="Any additional context for the Checker…"
                />
              </div>
            </>
          )}

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button
              className="btn-primary flex-1 justify-center"
              disabled={!form.change_type || !form.old_value || !form.new_value}
              onClick={() => setStep(3)}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Document Upload ────────────────────────────────────────── */}
      {step === 3 && (
        <div className="card space-y-6">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" /> Upload Supporting Document
          </h2>

          {selectedType && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Accepted: <strong>{selectedType.docs}</strong> · Formats: JPEG, PNG, PDF
              </p>
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all',
              dragOver ? 'border-blue-400 bg-blue-50' :
              file ? 'border-emerald-400 bg-emerald-50' :
              'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            {file ? (
              <div className="space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <p className="font-semibold text-emerald-700">{file.name}</p>
                <p className="text-xs text-emerald-600">
                  {(file.size / 1024).toFixed(1)} KB · Click to replace
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-10 h-10 text-slate-300 mx-auto" />
                <div>
                  <p className="font-semibold text-slate-600">Drop your document here</p>
                  <p className="text-sm text-slate-400 mt-1">or click to browse · PDF, JPEG, PNG, WebP</p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef} type="file" hidden
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button
              className="btn-primary flex-1 justify-center"
              disabled={!file}
              onClick={() => setStep(4)}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Review & Submit ────────────────────────────────────────── */}
      {step === 4 && (
        <div className="card space-y-6">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600" /> Review & Submit
          </h2>

          <div className="bg-slate-50 rounded-xl divide-y divide-slate-200">
            {[
              ['Customer ID',  form.customer_id],
              ['Customer Name', selectedCustomer?.name || '—'],
              ['Staff ID',     form.staff_id],
              ['Change Type',  CHANGE_TYPES.find(t => t.value === form.change_type)?.label || form.change_type],
              ['Current Value', form.old_value],
              ['New Value',    form.new_value],
              ['Document',     file?.name || '—'],
              ['Staff Notes',  form.staff_notes || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-500 font-medium">{label}</span>
                <span className="text-slate-800 font-semibold max-w-xs text-right truncate">{value}</span>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs text-blue-700 font-medium">
              By submitting, you confirm this change request is valid and supported by the uploaded document.
              A Checker Supervisor must approve before any update is applied to the core banking system.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setStep(3)} disabled={loading}>
              Back
            </button>
            <button
              className="btn-primary flex-1 justify-center"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> AI Processing…</>
                : <><Zap className="w-4 h-4" /> Submit for AI Verification</>
              }
            </button>
          </div>

          {loading && (
            <div className="space-y-3">
              <p className="text-xs text-center text-slate-500">Running AI agent pipeline…</p>
              {['Validation Agent', 'Document Processor (OCR)', 'Confidence Scorer', 'Summary Agent'].map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-5 h-5 spinner" style={{ animationDelay: `${i * 0.2}s` }} />
                  <span className="text-xs text-slate-600">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
