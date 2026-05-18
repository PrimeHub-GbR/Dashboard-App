'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useSellers, useRuns, useLastRunItems } from '@/hooks/useBuchpreisbindung'
import { SellerConfigSection } from './SellerConfigSection'
import { LastRunSection } from './LastRunSection'
import { ArchiveSection } from './ArchiveSection'

export function BuchpreisbindungClient() {
  const { sellers, isLoading: sellersLoading, addSeller, updateSeller, deleteSeller } = useSellers()
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const { runs, isLoading: runsLoading, refetch: refetchRuns } = useRuns(selectedSellerId)

  // Last successful run for items display
  const lastSuccessfulRun = runs.find(r => r.status === 'success') ?? null
  const { items, isLoading: itemsLoading } = useLastRunItems(lastSuccessfulRun?.id ?? null)

  async function handleRunSeller(sellerDbId: string) {
    const res = await fetch('/api/buchpreisbindung/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seller_id: sellerDbId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Fehler beim Starten')
    // Refresh runs to show the new running state
    await refetchRuns()
  }

  function handleSelectSeller(id: string) {
    setSelectedSellerId(prev => prev === id ? null : id)
  }

  if (sellersLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-24 rounded-xl bg-white/4 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SellerConfigSection
        sellers={sellers}
        onAddSeller={addSeller}
        onUpdateSeller={updateSeller}
        onDeleteSeller={deleteSeller}
        onRunSeller={handleRunSeller}
        selectedSellerId={selectedSellerId}
        onSelectSeller={handleSelectSeller}
      />

      <LastRunSection
        runs={runs}
        items={items}
        isLoading={runsLoading || itemsLoading}
        selectedSellerId={selectedSellerId}
      />

      <ArchiveSection
        runs={runs}
        selectedSellerId={selectedSellerId}
      />
    </div>
  )
}
