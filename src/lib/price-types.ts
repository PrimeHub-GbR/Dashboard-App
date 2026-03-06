// PROJ-3: Price database types

export interface PriceEntry {
  ean: string
  asin: string | null
  ek_price: number | null
  supplier: string | null
  order_date: string | null
}

export const PRICES_PAGE_SIZE = 100
