'use client'

import { useState } from 'react'
import { Warehouse, Plus, Printer, Trash2, ExternalLink, Loader2 } from 'lucide-react'
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
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Warehouse className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lager / Nachbestellung</h1>
          <p className="text-sm text-muted-foreground">
            QR-Etiketten erstellen, ins Regal kleben — Mitarbeiter scannen sie in der App zum Nachbestellen.
          </p>
        </div>
      </div>

      {/* Anlegen */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Neues QR-Etikett erstellen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createProduct}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="lg-title" className="mb-1.5 block">
                  Titel (wird auf das Etikett gedruckt)
                </Label>
                <Input
                  id="lg-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="z. B. Versandkartons Größe M"
                />
              </div>
              <div>
                <Label htmlFor="lg-qty" className="mb-1.5 block">Bestellmenge (automatisch)</Label>
                <Input
                  id="lg-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lg-url" className="mb-1.5 block">Produkt-Link (optional)</Label>
                <Input
                  id="lg-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
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

      {/* Liste */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Bestehende Etiketten ({products.length})
      </h2>
      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          Noch keine Produkte angelegt.
        </p>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{p.title}</p>
                <p className="text-sm text-muted-foreground">
                  Menge: {p.quantity}
                  {p.product_url && (
                    <>
                      {' · '}
                      <a href={p.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Link <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={`/dashboard/lager/label/${p.id}`} target="_blank" rel="noreferrer">
                  <Printer className="h-4 w-4" /> Etikett
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Entfernen"
                onClick={() => deactivate(p.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
