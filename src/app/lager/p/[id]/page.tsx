import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Öffentliche Produkt-Infoseite — Ziel des QR-Links. Wird angezeigt, wenn der
// Code mit einer normalen Kamera (statt der PrimeHub-App) geöffnet wird.
export default async function PublicProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = createSupabaseServiceClient()
  const { data: product } = await service
    .from('reorder_products')
    .select('title, quantity, product_url, is_active')
    .eq('id', id)
    .maybeSingle()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0E10] px-6 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="mb-4 text-3xl font-extrabold tracking-tight">
          <span className="text-white">Prime</span>
          <span style={{ color: '#1AD06A' }}>Hub</span>
        </div>
        {product && product.is_active ? (
          <>
            <h1 className="text-xl font-bold">{product.title}</h1>
            <p className="mt-2 text-white/60">
              Bestellmenge: <span className="font-semibold text-white">{product.quantity} Stück</span>
            </p>
            {product.product_url && (
              <a
                href={product.product_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold hover:bg-green-500"
              >
                Zum Produkt
              </a>
            )}
            <p className="mt-6 rounded-lg bg-white/5 px-4 py-3 text-sm text-white/70">
              Zum Nachbestellen diesen Code in der <strong>PrimeHub-App</strong> scannen.
            </p>
          </>
        ) : (
          <p className="text-white/70">Dieses Produkt ist nicht (mehr) verfügbar.</p>
        )}
      </div>
    </div>
  )
}
