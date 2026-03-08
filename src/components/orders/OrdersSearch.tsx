"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface OrdersSearchProps {
  value: string
  onChange: (value: string) => void
  resultCount: number
  totalCount: number
}

export function OrdersSearch({
  value,
  onChange,
  resultCount,
  totalCount,
}: OrdersSearchProps) {
  const [localValue, setLocalValue] = useState(value)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange(newValue: string) {
    setLocalValue(newValue)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      onChange(newValue)
    }, 300)
  }

  function handleClear() {
    setLocalValue("")
    onChange("")
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Bestellungen durchsuchen..."
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          className="pl-9 pr-9"
          aria-label="Bestellungen durchsuchen"
        />
        {localValue && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
            onClick={handleClear}
            aria-label="Suche loeschen"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {value && (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {resultCount} von {totalCount} Ergebnissen
        </span>
      )}
    </div>
  )
}
