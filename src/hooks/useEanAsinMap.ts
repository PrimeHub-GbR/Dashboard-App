"use client"

import { useCallback, useEffect, useState } from "react"

export interface EanAsinMapping {
  id: string
  ean: string
  asin: string
  created_at: string
}

export function useEanAsinMap() {
  const [mappings, setMappings] = useState<EanAsinMapping[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMappings = useCallback(async () => {
    setError(null)
    try {
      // Fetch all pages to avoid the 200-per-page limit
      const allMappings: EanAsinMapping[] = []
      let page = 1
      while (true) {
        const res = await fetch(`/api/prices/ean-asin-map?page=${page}`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          setError(json.error ?? 'Mappings konnten nicht geladen werden')
          return
        }
        const json = await res.json()
        const batch: EanAsinMapping[] = json.data ?? []
        allMappings.push(...batch)
        if (allMappings.length >= (json.totalCount ?? 0)) break
        page++
      }
      setMappings(allMappings)
    } catch {
      setError('Mappings konnten nicht geladen werden')
    }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    await fetchMappings()
    setIsLoading(false)
  }, [fetchMappings])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addMapping = useCallback(
    async (ean: string, asin: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/prices/ean-asin-map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ean, asin }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return json.error ?? 'Fehler beim Hinzufügen'
        await refresh()
        return null
      } catch {
        return 'Fehler beim Hinzufügen'
      }
    },
    [refresh]
  )

  const deleteMapping = useCallback(async (id: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/prices/ean-asin-map', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return json.error ?? 'Fehler beim Löschen'
      setMappings((prev) => prev.filter((m) => m.id !== id))
      return null
    } catch {
      return 'Fehler beim Löschen'
    }
  }, [])

  return { mappings, isLoading, error, addMapping, deleteMapping, refresh }
}
