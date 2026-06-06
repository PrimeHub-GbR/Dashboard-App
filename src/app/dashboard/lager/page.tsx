import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { LagerClient, type LagerProduct } from '@/components/lager/LagerClient'

export const dynamic = 'force-dynamic'

export default async function LagerPage() {
  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('reorder_products')
    .select('id, title, quantity, product_url, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return <LagerClient initialProducts={(data ?? []) as LagerProduct[]} />
}
