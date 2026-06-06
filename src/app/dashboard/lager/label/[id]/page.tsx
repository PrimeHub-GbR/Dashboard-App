import { notFound } from 'next/navigation'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { QrLabel } from '@/components/lager/QrLabel'

export const dynamic = 'force-dynamic'

// Feste Produktions-Basis-URL, damit gedruckte QR-Codes immer auf die
// Live-Domain zeigen (unabhängig davon, wo das Etikett erzeugt wurde).
const SITE_URL = 'https://dashboard.primehubgbr.com'

export default async function LabelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = createSupabaseServiceClient()
  const { data: product } = await service
    .from('reorder_products')
    .select('id, title, quantity')
    .eq('id', id)
    .maybeSingle()

  if (!product) notFound()

  return (
    <QrLabel
      title={product.title as string}
      quantity={product.quantity as number}
      url={`${SITE_URL}/lager/p/${product.id}`}
    />
  )
}
