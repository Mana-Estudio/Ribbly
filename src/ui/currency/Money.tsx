'use client'

import type { Cents } from '@/domain/money'
import { useCurrency } from './CurrencyContext'

/**
 * Un monto en pesos que respeta la moneda elegida en el navbar (ARS/USD).
 * Sirve dentro de páginas de servidor: en vez de `formatARS(cents)` (texto
 * fijo en pesos), `<Money cents={cents} />`.
 */
export function Money({ cents }: { cents: Cents }) {
  const { formatPrice } = useCurrency()
  return <>{formatPrice(cents)}</>
}
