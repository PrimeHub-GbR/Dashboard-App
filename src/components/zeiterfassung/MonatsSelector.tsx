'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMonthLabel, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'

interface Props {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}

export function MonatsSelector({ year, month, onChange }: Props) {
  const now = currentBerlinYearMonth()
  const isCurrentMonth = year === now.year && month === now.month

  function prev() {
    if (month === 1) onChange(year - 1, 12)
    else onChange(year, month - 1)
  }

  function next() {
    if (isCurrentMonth) return
    if (month === 12) onChange(year + 1, 1)
    else onChange(year, month + 1)
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={prev} className="h-8 w-8">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium min-w-[120px] text-center">
        {formatMonthLabel(year, month)}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={next}
        disabled={isCurrentMonth}
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
