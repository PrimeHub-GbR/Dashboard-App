'use client'

import { useState } from 'react'
import { Warehouse, Plus, Printer, Trash2, ExternalLink, Loader2 } from 'lucide-react'

export interface LagerProduct {
  id: string
  title: string
  quantity: number
  product_url: string | null
  is_active: boolean
  created_at: string
}

export function LagerClient({ initialProducts }: { initialProducts: LagerProduct[] }) {
  const [products, setProducts] = useState<LagerProduct[]>(initialProducts)
  const [title, setTitle] = useState('')
  const [quantity, setQuantity] = useState('3')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createProduct(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Bitte einen Titel eingeben.'); return }
    const qty = parseInt(quantity, 10)
    if (!Number.isFinite(qty) || qty < 1) { setError('Bitte eine gültige Menge eingeben.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/lager/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), quantity: qty, product_url: url.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler beim Anlegen')
      setProducts((p) => [json.product as LagerProduct, ...p])
      setTitle(''); setQuantity('3'); setUrl('')
      // Etikett direkt zum Drucken öffnen
      window.open(`/dashboard/lager/label/${json.product.id}`, '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id: string) {
    if (!confirm('Dieses Produkt aus der Verwaltung entfernen?')) return
    const res = await fetch(`/api/lager/products?id=${id}`, { method: 'DELETE' })
    if (res.ok) setProducts((p) => p.filter((x) => x.id !== id))
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-white">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/15">
          <Warehouse className="h-5 w-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Lager / Nachbestellung</h1>
          <p className="text-sm text-white/50">
            QR-Etiketten erstellen, ins Regal kleben — Mitarbeiter scannen sie in der App zum Nachbestellen.
          </p>
        </div>
      </div>

      {/* Anlegen */}
      <form
        onSubmit={createProduct}
        className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
          Neues QR-Etikett erstellen
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm text-white/70">Titel (wird auf das Etikett gedruckt)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Versandkartons Größe M"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-green-500/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-white/70">Bestellmenge (automatisch)</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-green-500/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-white/70">Produkt-Link (optional)</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-green-500/50"
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Etikett erstellen & drucken
        </button>
      </form>

      {/* Liste */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
        Bestehende Etiketten ({products.length})
      </h2>
      {products.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-white/40">
          Noch keine Produkte angelegt.
        </p>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.title}</p>
                <p className="text-sm text-white/50">
                  Menge: {p.quantity}
                  {p.product_url && (
                    <>
                      {' · '}
                      <a href={p.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-green-400 hover:underline">
                        Link <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </p>
              </div>
              <a
                href={`/dashboard/lager/label/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 transition hover:bg-white/8"
              >
                <Printer className="h-4 w-4" /> Etikett
              </a>
              <button
                onClick={() => deactivate(p.id)}
                title="Entfernen"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 p-2 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
