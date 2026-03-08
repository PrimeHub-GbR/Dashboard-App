"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Order, OrderFilters, OrderSortField } from "@/lib/order-types"
import { DEFAULT_FILTERS, PAGE_SIZE } from "@/lib/order-types"

export interface OrderSortState {
  field: OrderSortField
  ascending: boolean
}

interface UseOrdersReturn {
  orders: Order[]
  totalCount: number
  unfilteredCount: number
  isLoading: boolean
  error: string | null
  filters: OrderFilters
  setFilters: (filters: OrderFilters) => void
  resetFilters: () => void
  page: number
  setPage: (page: number) => void
  totalPages: number
  refresh: () => Promise<void>
  suppliers: string[]
  statuses: string[]
  sortState: OrderSortState
  setSortState: (state: OrderSortState) => void
}

const DEFAULT_SORT: OrderSortState = {
  field: "order_date",
  ascending: false,
}

export function useOrders(): UseOrdersReturn {
  const [orders, setOrders] = useState<Order[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unfilteredCount, setUnfilteredCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [sortState, setSortState] = useState<OrderSortState>(DEFAULT_SORT)

  const fetchFilterOptions = useCallback(async () => {
    const [suppliersRes, statusesRes] = await Promise.all([
      supabase.rpc("get_order_suppliers"),
      supabase.rpc("get_order_statuses"),
    ])

    if (suppliersRes.data) {
      setSuppliers(suppliersRes.data.map((r: { supplier: string }) => r.supplier))
    }

    if (statusesRes.data) {
      setStatuses(statusesRes.data.map((r: { status: string }) => r.status))
    }
  }, [])

  // BUG-12: Fetch the total unfiltered count separately
  const fetchUnfilteredCount = useCallback(async () => {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })

    setUnfilteredCount(count ?? 0)
  }, [])

  const fetchOrders = useCallback(async () => {
    setError(null)

    let query = supabase
      .from("orders")
      .select("*", { count: "exact" })
      // BUG-7: Server-side sorting
      .order(sortState.field, {
        ascending: sortState.ascending,
        nullsFirst: false,
      })

    // Apply filters (BUG-3: sanitize search to prevent PostgREST filter injection)
    if (filters.search) {
      // Escape characters that have special meaning in PostgREST filter syntax:
      // commas (,) separate filter conditions, dots (.) separate field.operator.value,
      // parentheses are used for grouping. We also escape backslash.
      const sanitized = filters.search
        .replace(/\\/g, "\\\\")
        .replace(/,/g, "\\,")
        .replace(/\./g, "\\.")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")

      query = query.or(
        `supplier.ilike.%${sanitized}%,ean.ilike.%${sanitized}%,title.ilike.%${sanitized}%,status.ilike.%${sanitized}%,notes.ilike.%${sanitized}%,file_name.ilike.%${sanitized}%`
      )
    }

    if (filters.status) {
      query = query.eq("status", filters.status)
    }

    if (filters.supplier) {
      query = query.eq("supplier", filters.supplier)
    }

    if (filters.dateFrom) {
      query = query.gte("order_date", filters.dateFrom)
    }

    if (filters.dateTo) {
      query = query.lte("order_date", filters.dateTo)
    }

    // Pagination
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    const { data, error: fetchError, count } = await query

    if (fetchError) {
      setError("Bestellungen konnten nicht geladen werden")
      return
    }

    setOrders((data as Order[]) ?? [])
    setTotalCount(count ?? 0)
  }, [filters, page, sortState])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchOrders(), fetchFilterOptions(), fetchUnfilteredCount()])
    setIsLoading(false)
  }, [fetchOrders, fetchFilterOptions, fetchUnfilteredCount])

  const silentRefresh = useCallback(async () => {
    await Promise.all([fetchOrders(), fetchUnfilteredCount(), fetchFilterOptions()])
  }, [fetchOrders, fetchUnfilteredCount, fetchFilterOptions])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh every 30 seconds (silent, no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => {
      silentRefresh()
    }, 30_000)
    return () => clearInterval(interval)
  }, [silentRefresh])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [filters])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return {
    orders,
    totalCount,
    unfilteredCount,
    isLoading,
    error,
    filters,
    setFilters,
    resetFilters,
    page,
    setPage,
    totalPages,
    refresh,
    suppliers,
    statuses,
    sortState,
    setSortState,
  }
}
