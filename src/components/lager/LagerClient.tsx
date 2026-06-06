'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Warehouse, Plus, Printer, Trash2, ExternalLink, Loader2,
  ClipboardList, ShoppingCart, Truck, X, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface LagerProduct {
  id: string
  title: string
  quantity: number
  product_url: string | null
  is_active: boolean
  created_at: string
}

interface OpenItem { request_id: string; title: string; quantity: number; added_by_name: string | null; created_at: string }
interface OpenList { list_id: string | null; items: OpenItem[] }
interface OrderedList { list_id: string; ordered_at: string | null; ordered_by_name: string | null; items: { title: string; quantity: number; added_by_name: string | null }[] }
interface ArchivedList { list_id: string; delivered_at: string | null; delivered_by_name: string | null; items: { title: string; quantity: number }[] }

function fmt(ts: string | null) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

export function LagerClient({ initialProducts }: { initialProducts: LagerProduct[] }) {
  // -------- Bestellliste --------
  const [open, setOpen] = useState<OpenList>({ list_id: null, items: [] })
  const [ordered, setOrdered] = useState<OrderedList[]>([])
  const [archive, setArchive] = useState<ArchivedList[]>([])
  const [busy, setBusy] = useState(false)

  const loadOrders = useCallback(async () => {
    const res = await fetch('/api/lager/orders')
    if (!res.ok) return
    const j = await res.json()
    setOpen(j.open ?? { list_id: null, items: [] })
    setOrdered(j.ordered ?? [])
    setArchive(j.archive ?? [])
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  async function action(body: Record<string, string>) {
    setBusy(true)
    try {
      const res = await fetch('/api/lager/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Fehler') }
      await loadOrders()
    } finally { setBusy(false) }
  }

  // -------- Inventar / QR --------
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), quantity: qty, product_url: url.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler beim Anlegen')
      setProducts((p) => [json.product as LagerProduct, ...p])
      setTitle(''); setQuantity('3'); setUrl('')
      window.open(`/dashboard/lager/label/${json.product.id}`, '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally { setSaving(false) }
  }

  async function deactivate(id: string) {
    if (!confirm('Dieses Produkt aus dem Inventar entfernen?')) return
    const res = await fetch(`/api/lager/products?id=${id}`, { method: 'DELETE' })
    if (res.ok) setProducts((p) => p.filter((x) => x.id !== id))
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Warehouse className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lager / Nachbestellung</h1>
          <p className="text-sm text-muted-foreground">
            Inventar mit QR-Etiketten verwalten und die Bestellliste verfolgen, die durch das Scannen der Mitarbeiter entsteht.
          </p>
        </div>
      </div>

      {/* ===================== Bestellliste ===================== */}
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bestellliste</h2>
      </div>

      {/* Offene Liste */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Aktuelle Liste <span className="text-amber-600">(offen)</span>
          </CardTitle>
          {open.list_id && open.items.length > 0 && (
            <Button size="sm" disabled={busy} onClick={() => action({ action: 'order', list_id: open.list_id! })}>
              <ShoppingCart className="h-4 w-4" /> Alles bestellen
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {open.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Noch nichts auf der Liste. Mitarbeiter fügen per QR-Scan in der App Produkte hinzu.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {open.items.map((it) => (
                <div key={it.request_id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{it.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[it.added_by_name ? `von ${it.added_by_name}` : null, fmt(it.created_at)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">× {it.quantity}</span>
                  <Button variant="ghost" size="icon" disabled={busy} title="Entfernen"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => action({ action: 'remove', request_id: it.request_id })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bestellte Listen */}
      {ordered.map((l) => (
        <Card key={l.list_id} className="mb-4 border-blue-500/30">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              Bestellt <span className="text-blue-600">— wartet auf Lieferung</span>
            </CardTitle>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => action({ action: 'deliver', list_id: l.list_id })}>
              <Truck className="h-4 w-4" /> Geliefert
            </Button>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              {[l.ordered_by_name ? `bestellt von ${l.ordered_by_name}` : 'bestellt', fmt(l.ordered_at)].filter(Boolean).join(' · ')}
            </p>
            <ul className="space-y-1">
              {l.items.map((it, i) => (
                <li key={i} className="flex justify-between text-sm text-foreground">
                  <span>{it.title}</span>
                  <span className="font-semibold">× {it.quantity}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {/* Archiv */}
      {archive.length > 0 && (
        <details className="mb-8 rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-medium text-muted-foreground">
            <ChevronDown className="h-4 w-4" /> Archiv (geliefert) · {archive.length}
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            {archive.map((l) => (
              <div key={l.list_id}>
                <p className="mb-1 text-xs font-semibold text-green-600">
                  Geliefert {[fmt(l.delivered_at), l.delivered_by_name].filter(Boolean).join(' · ')}
                </p>
                <ul className="text-sm text-muted-foreground">
                  {l.items.map((it, i) => <li key={i}>• {it.title} × {it.quantity}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ===================== Inventar / QR ===================== */}
      <div className="mb-4 mt-10 flex items-center gap-2">
        <Warehouse className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Inventar / QR-Etiketten</h2>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Neues QR-Etikett erstellen</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createProduct}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="lg-title" className="mb-1.5 block">Titel (wird auf das Etikett gedruckt)</Label>
                <Input id="lg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Versandkartons Größe M" />
              </div>
              <div>
                <Label htmlFor="lg-qty" className="mb-1.5 block">Bestellmenge (automatisch)</Label>
                <Input id="lg-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lg-url" className="mb-1.5 block">Produkt-Link (optional)</Label>
                <Input id="lg-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving} className="mt-4">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Etikett erstellen &amp; drucken
            </Button>
          </form>
        </CardContent>
      </Card>

      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Inventar ({products.length})
      </h3>
      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          Noch keine Produkte angelegt.
        </p>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{p.title}</p>
                <p className="text-sm text-muted-foreground">
                  Menge: {p.quantity}
                  {p.product_url && (
                    <>{' · '}<a href={p.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Link <ExternalLink className="h-3 w-3" /></a></>
                  )}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={`/dashboard/lager/label/${p.id}`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" /> Etikett</a>
              </Button>
              <Button variant="ghost" size="icon" title="Entfernen" onClick={() => deactivate(p.id)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
