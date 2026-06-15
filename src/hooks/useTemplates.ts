'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

export interface WhatsAppTemplate {
  id: string
  name: string
  display_name: string | null
  category: string
  language: string
  body_text: string
  variables_count: number
  example_values: string[]
  status: string
  meta_template_id: string | null
  status_detail: string | null
  created_at: string
}

export interface CreateTemplateInput {
  name: string
  display_name?: string
  category: 'UTILITY' | 'MARKETING'
  language: string
  body_text: string
  example_values: string[]
}

/** Zaehlt {{1}}, {{2}} … im Body (hoechster Index). */
export function countVars(body: string): number {
  const idx = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => parseInt(m[1], 10))
  return idx.length ? Math.max(...idx) : 0
}

/** Ersetzt {{1}}, {{2}} … durch die gegebenen Werte. */
export function renderTemplate(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_m, n) => values[parseInt(n, 10) - 1] ?? `{{${n}}}`)
}

export function useTemplates() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kommunikation/templates', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { templates: WhatsAppTemplate[] }
      setTemplates(data.templates ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = useCallback(
    async (input: CreateTemplateInput): Promise<boolean> => {
      const res = await fetch('/api/kommunikation/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown }
        const msg =
          typeof data.error === 'string'
            ? data.error
            : 'Vorlage konnte nicht angelegt werden'
        toast.error(msg)
        return false
      }
      toast.success('Vorlage angelegt — wird von Meta geprüft')
      await load()
      return true
    },
    [load]
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await fetch(`/api/kommunikation/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Löschen fehlgeschlagen')
        return false
      }
      toast.success('Vorlage gelöscht')
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      return true
    },
    []
  )

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/kommunikation/templates/refresh', { method: 'POST' })
      if (!res.ok) {
        toast.error('Status-Abgleich fehlgeschlagen')
        return
      }
      // Meta antwortet asynchron — kurz warten, dann neu laden.
      await new Promise((r) => setTimeout(r, 2500))
      await load()
      toast.success('Status aktualisiert')
    } finally {
      setRefreshing(false)
    }
  }, [load])

  return { templates, loading, refreshing, reload: load, create, remove, refresh }
}
