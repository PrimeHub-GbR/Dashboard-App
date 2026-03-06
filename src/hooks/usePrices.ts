"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PriceEntry } from "@/lib/price-types"
import { PRICES_PAGE_SIZE } from "@/lib/price-types"

interface UsePricesReturn {
  prices: PriceEntry[]
  totalCount: number
  isLoading: boolean
  error: string | null
  search: string
  setSearch: (search: string) => void
  page: number
  setPage: (page: number) => void
  totalPages: number
  refresh: () => void
}

const DEBOUNCE_MS = 350

export function usePrices(): UsePricesReturn {
  const [prices, setPrices] = useState<PriceEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearchRaw] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Debounce search; atomically reset page to 1 when search changes
  const setSearch = useCallback((value: string) => {
    setSearchRaw(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, DEBOUNCE_MS)
  }, [])

  const fetchPrices = useCallback(async (currentSearch: string, currentPage: number) => {
    // Cancel in-flight request to prevent stale results
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PRICES_PAGE_SIZE),
      })
      if (currentSearch) params.set("q", currentSearch)

      const res = await fetch(`/api/prices?${params}`, { signal: controller.signal })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? "Preisdaten konnten nicht geladen werden")
        return
      }

      const json = await res.json()
      setPrices(json.data ?? [])
      setTotalCount(json.totalCount ?? 0)
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError("Preisdaten konnten nicht geladen werden")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrices(debouncedSearch, page)
  }, [debouncedSearch, page, fetchPrices])

  const refresh = useCallback(() => {
    fetchPrices(debouncedSearch, page)
  }, [fetchPrices, debouncedSearch, page])

  const totalPages = Math.max(1, Math.ceil(totalCount / PRICES_PAGE_SIZE))

  return {
    prices,
    totalCount,
    isLoading,
    error,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
    refresh,
  }
}
