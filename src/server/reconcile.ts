import 'server-only'
import { serviceDb, unwrap } from './db/client'
import type { Json } from './db/database.types'
import { log } from './log'
import { type MpPayment, searchPaymentsByReference, summarizePayment } from './mercadopago'
import { applyPaymentNotice, type PaymentOutcome } from './payments'
import { exactIlike } from './recovery'

/**
 * Conciliación de pagos: busca órdenes de Mercado Pago que siguen pendientes y
 * le pregunta a MP si tienen un pago aprobado. Cubre el caso en que MP cobró,
 * el webhook no llegó (o falló todos los reintentos) y el comprador cerró la
 * pestaña antes de volver al sitio: sin esto, la orden queda cobrada y el
 * regalo nunca se entrega.
 *
 * Usa el mismo camino que el webhook (`applyPaymentNotice` → `apply_payment`,
 * idempotente): si el aviso llega a la vez, no se crea nada dos veces.
 *
 * Se corre desde el cron (`/api/cron/conciliar`) y, para un comprador, cuando
 * pide "recuperar acceso" en /mi-ribbly.
 */

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

/**
 * La preferencia vence a las 48 h, pero un pago en efectivo generado antes del
 * vencimiento se puede acreditar días después: se mira una semana y media.
 */
export const RECONCILE_MAX_AGE_MS = 10 * DAY
/** En el cron, las órdenes recién creadas se dejan al webhook y al retorno. */
export const RECONCILE_MIN_AGE_MS = 15 * MINUTE
/** Por corrida: cada orden es una llamada a MP. */
export const RECONCILE_BATCH = 100

export interface PendingOrder {
  id: string
}

export interface ReconcileDeps {
  listPending: (filter: {
    from: Date
    to: Date
    email?: string
    limit: number
  }) => Promise<PendingOrder[]>
  searchPayments: (orderId: string) => Promise<MpPayment[]>
  apply: typeof applyPaymentNotice
}

export interface ReconcileResult {
  checked: number
  /** Ribblys creadas por la conciliación: pagos cuyo aviso no había llegado. */
  recovered: number
  /** Órdenes que no se pudieron consultar o aplicar (siguen pendientes). */
  failed: number
}

async function listPendingFromDb({
  from,
  to,
  email,
  limit,
}: {
  from: Date
  to: Date
  email?: string
  limit: number
}): Promise<PendingOrder[]> {
  let query = serviceDb()
    .from('orders')
    .select('id')
    .eq('status', 'pending')
    .eq('payment_provider', 'mercadopago')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
  if (email) query = query.ilike('buyer_email', exactIlike(email))
  return unwrap(
    await query.order('created_at', { ascending: true }).order('id').limit(limit),
    'órdenes pendientes',
  )
}

const defaultDeps: ReconcileDeps = {
  listPending: listPendingFromDb,
  searchPayments: searchPaymentsByReference,
  apply: applyPaymentNotice,
}

export async function reconcilePendingOrders(
  options: { email?: string; now?: Date } = {},
  deps: ReconcileDeps = defaultDeps,
): Promise<ReconcileResult> {
  const now = options.now ?? new Date()
  // Para un comprador puntual no hace falta esperar: apply_payment es idempotente.
  const minAge = options.email ? 0 : RECONCILE_MIN_AGE_MS
  const orders = await deps.listPending({
    from: new Date(now.getTime() - RECONCILE_MAX_AGE_MS),
    to: new Date(now.getTime() - minAge),
    email: options.email,
    limit: options.email ? 10 : RECONCILE_BATCH,
  })

  const result: ReconcileResult = { checked: orders.length, recovered: 0, failed: 0 }
  for (const order of orders) {
    try {
      const approved = (await deps.searchPayments(order.id)).filter(
        (payment) => payment.status === 'approved' && payment.external_reference === order.id,
      )
      for (const payment of approved) {
        const outcome = await deps.apply({
          orderId: order.id,
          provider: 'mercadopago',
          paymentId: String(payment.id),
          status: 'approved',
          amountCents: Math.round(payment.transaction_amount * 100),
          currency: payment.currency_id,
          source: 'reconcile',
          raw: summarizePayment(payment) as unknown as Json,
        })
        report(order.id, payment, outcome)
        if (outcome.created) result.recovered++
      }
    } catch (error) {
      result.failed++
      log.error('Conciliación: no se pudo revisar la orden', error, { orderId: order.id })
    }
  }

  if (result.checked) log.info('Conciliación de pagos', { ...result })
  return result
}

function report(orderId: string, payment: MpPayment, outcome: PaymentOutcome) {
  const fields = { orderId, paymentId: payment.id, outcome: outcome.outcome }
  if (outcome.created) {
    // Que se recupere un pago quiere decir que el webhook está fallando: tiene que avisar.
    log.error(
      'Conciliación: pago aprobado de Mercado Pago que no había llegado por webhook',
      undefined,
      fields,
    )
  } else if (outcome.outcome === 'amount_mismatch' || outcome.outcome === 'double_payment') {
    log.error('Conciliación: pago aprobado que no se pudo entregar', undefined, fields)
  }
}
