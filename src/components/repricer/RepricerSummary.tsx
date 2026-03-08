'use client'

import { ArrowRight } from 'lucide-react'
import type { Job } from '@/lib/job-types'

interface RepricerMetadata {
  total?: number
  final?: number
  b_asin_deleted?: number
  no_ean?: number
  no_price?: number
}

interface RepricerSummaryProps {
  job: Job
}

export function RepricerSummary({ job }: RepricerSummaryProps) {
  if (job.status !== 'success' || !job.metadata) {
    return <span className="text-xs text-muted-foreground">--</span>
  }

  const meta = job.metadata as RepricerMetadata
  const { total, final: finalCount, b_asin_deleted, no_ean, no_price } = meta

  if (total == null || finalCount == null) {
    return <span className="text-xs text-muted-foreground">--</span>
  }

  const details: string[] = []
  if (b_asin_deleted != null && b_asin_deleted > 0) details.push(`B-ASINs: ${b_asin_deleted}`)
  if (no_ean != null && no_ean > 0) details.push(`kein EAN: ${no_ean}`)
  if (no_price != null && no_price > 0) details.push(`kein Preis: ${no_price}`)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-xs font-medium">
        <span>{total}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-green-600 dark:text-green-400">{finalCount}</span>
        <span className="text-muted-foreground">Zeilen</span>
      </div>
      {details.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {details.join(' | ')}
        </span>
      )}
    </div>
  )
}
