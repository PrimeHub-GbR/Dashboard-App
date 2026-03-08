"use client"

import { Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { OrderFilters } from "@/lib/order-types"

interface OrdersFiltersProps {
  filters: OrderFilters
  onFiltersChange: (filters: OrderFilters) => void
  onReset: () => void
  suppliers: string[]
  statuses: string[]
}

export function OrdersFilters({
  filters,
  onFiltersChange,
  onReset,
  suppliers,
  statuses,
}: OrdersFiltersProps) {
  const activeFilterCount = [filters.status, filters.supplier].filter(Boolean).length

  const hasActiveFilters = activeFilterCount > 0

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {hasActiveFilters && (
              <Badge
                variant="secondary"
                className="ml-2 rounded-full px-1.5 py-0 text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Filter</h4>

            {/* Status filter */}
            <div className="space-y-2">
              <Label htmlFor="filter-status" className="text-xs">
                Status
              </Label>
              <Select
                value={filters.status ?? "all"}
                onValueChange={(val) =>
                  onFiltersChange({
                    ...filters,
                    status: val === "all" ? null : val,
                  })
                }
              >
                <SelectTrigger id="filter-status">
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Supplier filter */}
            <div className="space-y-2">
              <Label htmlFor="filter-supplier" className="text-xs">
                Lieferant
              </Label>
              <Select
                value={filters.supplier ?? "all"}
                onValueChange={(val) =>
                  onFiltersChange({
                    ...filters,
                    supplier: val === "all" ? null : val,
                  })
                }
              >
                <SelectTrigger id="filter-supplier">
                  <SelectValue placeholder="Alle Lieferanten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Lieferanten</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter badges */}
      {filters.status && (
        <Badge variant="secondary" className="gap-1">
          Status: {filters.status}
          <button
            onClick={() => onFiltersChange({ ...filters, status: null })}
            className="ml-1 hover:text-destructive"
            aria-label={`Filter Status ${filters.status} entfernen`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {filters.supplier && (
        <Badge variant="secondary" className="gap-1">
          Lieferant: {filters.supplier}
          <button
            onClick={() => onFiltersChange({ ...filters, supplier: null })}
            className="ml-1 hover:text-destructive"
            aria-label={`Filter Lieferant ${filters.supplier} entfernen`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-8 text-xs"
        >
          Alle Filter zuruecksetzen
        </Button>
      )}
    </div>
  )
}
