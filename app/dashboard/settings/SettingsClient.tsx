'use client'

import { useEffect, useState, useRef } from 'react'
import { Settings, Plus, Upload, Link, Save, Trash2, ChevronDown, Check, Loader2 } from 'lucide-react'
import clsx from 'clsx'

const TONES = ['direct and conversational', 'friendly', 'professional', 'bold and punchy']
const OFFERS = ['Website Rebuild', 'Website Grade', 'Smart Site', 'AI Chat']
const CTAS = ['Book a Call', 'Claim Your Site', 'Get Your Grade', 'Watch Demo']

type Brand = {
  id: string
  name: string
  sender_name: string | null
  sender_email: string | null
  sending_domain: string | null
  booking_url: string | null
  offer_description: string | null
  icp: string | null
  differentiator: string | null
  tone: string | null
  default_offer: string | null
  default_cta: string | null
  cta_urls: Record<string, string> | null
}

const emptyBrand = (): Partial<Brand> => ({
  name: '',
  sender_name: '',
  sender_email: '',
  sending_domain: '',
  booking_url: '',
  offer_description: '',
  icp: '',
  differentiator: '',
  tone: 'direct and conversational',
  default_offer: 'Website Rebuild',
  default_cta: 'Book a Call',
  cta_urls: { 'Book a Call': '', 'Claim Your Site': '', 'Get Your Grade': '', 'Watch Demo': '' },
})

export default function SettingsClient() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Brand>>(emptyBrand())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseMode, setParseMode] = useState<'idle' | 'url'>('idle')
  const [parseUrl, setParseUrl] = useState('')
  const [isNew, setIsNew] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const activeBrand = brands.find(b => b.id === activeBrandId) || null

  useEffect(() => { fetchBrands() }, [])

  async function fetchBrands() {
    setLoading(true)
    const res = await fetch('/api/brands')
    const data = await res.json()
    setBrands(data || [])
    if (data?.length > 0) {
      setActiveBrandId(data[0].id)
      setForm(toBrandForm(data[0]))
    }
    setLoading(false)
  }

  function toBrandForm(b: Brand): Partial<Brand> {
    return {
      ...b,
      cta_urls: b.cta_urls || { 'Book a Call': '', 'Claim Your Site': '', 'Get Your Grade': '', 'Watch Demo': '' },
    }
  }

  function selectBrand(id: string) {
    const b = brands.find(b => b.id === id)
    if (b) { setActiveBrandId(id); setForm(toBrandForm(b)); setIsNew(false) }
  }

  function addNew() {
    setActiveBrandId(null)
    setForm(emptyBrand())
    setIsNew(true)
  }

  function set(key: keyof Brand, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function setCtaUrl(cta: string, url: string) {
    setForm(f => ({ ...f, cta_urls: { ...(f.cta_urls || {}), [cta]: url } }))
  }

  async function save() {
    if (!form.name?.trim()) return
    setSaving(true)
    try {
      if (isNew) {
        const res = await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        const created = await res.json()
        setBrands(b => [...b, created])
        setActiveBrandId(created.id)
        setIsNew(false)
      } else if (activeBrandId) {
        const res = await fetch(`/api/brands/${activeBrandId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        const updated = await res.json()
        setBrands(b => b.map(x => x.id === activeBrandId ? updated : x))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function deleteBrand() {
    if (!activeBrandId || !confirm('Delete this brand?')) return
    await fetch(`/api/brands/${activeBrandId}`, { method: 'DELETE' })
    const remaining = brands.filter(b => b.id !== activeBrandId)
    setBrands(remaining)
    if (remaining.length > 0) { setActiveBrandId(remaining[0].id); setForm(toBrandForm(remaining[0])) }
    else { setActiveBrandId(null); setForm(emptyBrand()); setIsNew(true) }
  }

  async function parseContent(content: string) {
    setParsing(true)
    try {
      const res = await fetch('/api/settings/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const parsed = await res.json()
      if (parsed && !parsed.error) {
        setForm(f => ({
          ...f,
          ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== null)),
          cta_urls: { ...(f.cta_urls || {}), ...(parsed.cta_urls || {}) },
        }))
      }
    } finally {
      setParsing(false)
      setParseMode('idle')
      setParseUrl('')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await parseContent(text)
    e.target.value = ''
  }

  async function handleUrlParse() {
    if (!parseUrl.trim()) return
    setParsing(true)
    try {
      const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(parseUrl)}`)
      const { content } = await res.json()
      if (content) await parseContent(content)
    } catch {
      setParsing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-96">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-400" /> Brand Settings
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Configure how the engine runs for each brand.</p>
        </div>
      </div>

      {/* Brand switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {brands.map(b => (
          <button
            key={b.id}
            onClick={() => selectBrand(b.id)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeBrandId === b.id && !isNew
                ? 'bg-amber-400 text-black'
                : 'bg-zinc-800 text-zinc-300 hover:text-white'
            )}
          >
            {b.name}
          </button>
        ))}
        <button
          onClick={addNew}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            isNew ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          )}
        >
          <Plus className="w-3.5 h-3.5" /> New Brand
        </button>
      </div>

      {/* Import strip */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Import brand context</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload .md file
          </button>
          <input ref={fileRef} type="file" accept=".md,.txt" className="hidden" onChange={handleFileUpload} />

          {parseMode === 'url' ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                placeholder="https://yourbrand.com"
                value={parseUrl}
                onChange={e => setParseUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlParse()}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                autoFocus
              />
              <button
                onClick={handleUrlParse}
                disabled={parsing || !parseUrl.trim()}
                className="px-3 py-2 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
              </button>
              <button onClick={() => setParseMode('idle')} className="px-3 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setParseMode('url')}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              <Link className="w-4 h-4" /> Import from URL
            </button>
          )}

          {parsing && (
            <span className="text-xs text-amber-400 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Claude is reading your brand…
            </span>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">

        {/* Identity */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Identity</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Brand Name" required>
              <input value={form.name || ''} onChange={e => set('name', e.target.value)}
                placeholder="There San Diego" className={input()} />
            </Field>
            <Field label="Sender First Name">
              <input value={form.sender_name || ''} onChange={e => set('sender_name', e.target.value)}
                placeholder="Josh" className={input()} />
            </Field>
            <Field label="Sender Email">
              <input value={form.sender_email || ''} onChange={e => set('sender_email', e.target.value)}
                placeholder="josh@lvrg.com" className={input()} />
            </Field>
            <Field label="Sending Domain">
              <input value={form.sending_domain || ''} onChange={e => set('sending_domain', e.target.value)}
                placeholder="mail.theresandiego.com" className={input()} />
            </Field>
          </div>
        </div>

        {/* Brand context */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Brand Context</p>
          <Field label="What you offer">
            <textarea value={form.offer_description || ''} onChange={e => set('offer_description', e.target.value)}
              rows={2} placeholder="AI-built Smart Sites for San Diego local businesses — free preview, claim by booking a call."
              className={input('resize-none')} />
          </Field>
          <Field label="Ideal client">
            <input value={form.icp || ''} onChange={e => set('icp', e.target.value)}
              placeholder="SD restaurants, bars, coffee shops with outdated or no website" className={input()} />
          </Field>
          <Field label="Your differentiator">
            <input value={form.differentiator || ''} onChange={e => set('differentiator', e.target.value)}
              placeholder="We build the site first, for free — prospects see it before they ever talk to us" className={input()} />
          </Field>
          <Field label="Tone">
            <Select value={form.tone || 'direct and conversational'} options={TONES} onChange={v => set('tone', v)} />
          </Field>
        </div>

        {/* Defaults */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Engine Defaults</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Default Offer">
              <Select value={form.default_offer || 'Website Rebuild'} options={OFFERS} onChange={v => set('default_offer', v)} />
            </Field>
            <Field label="Default CTA">
              <Select value={form.default_cta || 'Book a Call'} options={CTAS} onChange={v => set('default_cta', v)} />
            </Field>
          </div>
        </div>

        {/* CTA URLs */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">CTA Links</p>
          <p className="text-xs text-zinc-600">The engine embeds these links in outreach emails based on the CTA selected per run.</p>
          <div className="space-y-3">
            {CTAS.map(cta => (
              <Field key={cta} label={cta}>
                <input
                  value={(form.cta_urls as Record<string, string>)?.[cta] || ''}
                  onChange={e => setCtaUrl(cta, e.target.value)}
                  placeholder="https://"
                  className={input()}
                />
              </Field>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {activeBrandId && !isNew ? (
          <button
            onClick={deleteBrand}
            className="flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete brand
          </button>
        ) : <div />}

        <button
          onClick={save}
          disabled={saving || !form.name?.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black text-sm font-semibold rounded-xl transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save Brand'}
        </button>
      </div>
    </div>
  )
}

// Helpers
function input(extra = '') {
  return `w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 ${extra}`
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
        {label}{required && <span className="text-amber-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400 appearance-none pr-8"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
    </div>
  )
}
