import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/server/cron-auth'
import { isDemoMode } from '@/server/demo'
import { env } from '@/server/env'
import { reconcilePendingOrders } from '@/server/reconcile'

export const dynamic = 'force-dynamic'

/**
 * Conciliación de pagos (ver `src/server/reconcile.ts`): entrega las Ribblys
 * de pagos aprobados en Mercado Pago cuyo aviso nunca llegó. Lo llama Vercel
 * Cron con CRON_SECRET.
 */
export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request)
  if (rejected) return rejected
  if (isDemoMode() || env().PAYMENTS_PROVIDER !== 'mercadopago') {
    return NextResponse.json({ ok: true, skipped: 'sin Mercado Pago' })
  }

  const result = await reconcilePendingOrders()
  return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
}
