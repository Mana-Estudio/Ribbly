import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MpPayment } from '@/server/mercadopago'
import type { PaymentNotice, PaymentOutcome } from '@/server/payments'

/**
 * Conciliación de pagos: qué órdenes mira, qué pagos aplica y cuándo avisa.
 * La base, Mercado Pago y apply_payment se inyectan (apply_payment con source
 * 'reconcile' tiene su test contra Postgres en tests/db/payments.test.ts).
 */

vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SITE_URL: 'https://ribbly.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.ribbly.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    SESSION_SECRET: 'x'.repeat(40),
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    PAYMENTS_PROVIDER: 'mercadopago',
    MP_ACCESS_TOKEN: 'APP_USR-test',
  })
})

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('@/server/log', () => ({ log }))

const { reconcilePendingOrders, RECONCILE_BATCH, RECONCILE_MAX_AGE_MS, RECONCILE_MIN_AGE_MS } =
  await import('@/server/reconcile')

const ORDER_A = '3f2a1b9c-1111-4222-8333-444455556666'
const ORDER_B = '3f2a1b9c-1111-4222-8333-777788889999'
const NOW = new Date('2026-11-26T12:00:00Z')

function payment(overrides: Partial<MpPayment> = {}): MpPayment {
  return {
    id: 111,
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 15000,
    currency_id: 'ARS',
    external_reference: ORDER_A,
    order: { id: 1, type: 'mercadopago' },
    ...overrides,
  }
}

function outcome(overrides: Partial<PaymentOutcome> = {}): PaymentOutcome {
  return { outcome: 'paid', boxieId: 'b-1', created: true, links: null, ...overrides }
}

function deps(payments: Record<string, MpPayment[] | Error>, orders = [ORDER_A]) {
  return {
    listPending: vi.fn(async () => orders.map((id) => ({ id }))),
    searchPayments: vi.fn(async (orderId: string) => {
      const found = payments[orderId] ?? []
      if (found instanceof Error) throw found
      return found
    }),
    apply: vi.fn(async (_notice: PaymentNotice) => outcome()),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('reconcilePendingOrders', () => {
  it('entrega un pago aprobado que no llegó por webhook, con el monto y la moneda de MP', async () => {
    const d = deps({ [ORDER_A]: [payment({ transaction_amount: 15000.5 })] })
    const result = await reconcilePendingOrders({ now: NOW }, d)

    expect(result).toEqual({ checked: 1, recovered: 1, failed: 0 })
    expect(d.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_A,
        provider: 'mercadopago',
        paymentId: '111',
        status: 'approved',
        amountCents: 1500050,
        currency: 'ARS',
        source: 'reconcile',
      }),
    )
    // Recuperar un pago quiere decir que el webhook falla: tiene que llegar a Sentry.
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('no había llegado por webhook'),
      undefined,
      expect.objectContaining({ orderId: ORDER_A, paymentId: 111 }),
    )
  })

  it('no toca pagos pendientes, rechazados ni de otra orden', async () => {
    const d = deps({
      [ORDER_A]: [
        payment({ status: 'pending' }),
        payment({ status: 'rejected' }),
        payment({ external_reference: ORDER_B }),
      ],
    })
    const result = await reconcilePendingOrders({ now: NOW }, d)

    expect(result).toEqual({ checked: 1, recovered: 0, failed: 0 })
    expect(d.apply).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })

  it('si el aviso ya se había procesado (duplicado) no cuenta ni avisa', async () => {
    const d = deps({ [ORDER_A]: [payment()] })
    d.apply.mockResolvedValueOnce(outcome({ outcome: 'duplicate', created: false }))
    const result = await reconcilePendingOrders({ now: NOW }, d)

    expect(result.recovered).toBe(0)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('avisa si el pago aprobado no se puede entregar (monto distinto)', async () => {
    const d = deps({ [ORDER_A]: [payment()] })
    d.apply.mockResolvedValueOnce(outcome({ outcome: 'amount_mismatch', created: false }))
    await reconcilePendingOrders({ now: NOW }, d)

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('no se pudo entregar'),
      undefined,
      expect.objectContaining({ outcome: 'amount_mismatch' }),
    )
  })

  it('una orden que falla (MP caído) no frena las demás', async () => {
    const d = deps(
      { [ORDER_A]: new Error('MP API 500'), [ORDER_B]: [payment({ external_reference: ORDER_B })] },
      [ORDER_A, ORDER_B],
    )
    const result = await reconcilePendingOrders({ now: NOW }, d)

    expect(result).toEqual({ checked: 2, recovered: 1, failed: 1 })
    expect(d.apply).toHaveBeenCalledWith(expect.objectContaining({ orderId: ORDER_B }))
  })

  it('el cron mira de 10 días atrás a 15 minutos atrás, en tandas', async () => {
    const d = deps({})
    await reconcilePendingOrders({ now: NOW }, d)

    expect(d.listPending).toHaveBeenCalledWith({
      from: new Date(NOW.getTime() - RECONCILE_MAX_AGE_MS),
      to: new Date(NOW.getTime() - RECONCILE_MIN_AGE_MS),
      email: undefined,
      limit: RECONCILE_BATCH,
    })
  })

  it('para un comprador (recuperar acceso) mira solo sus órdenes y sin esperar', async () => {
    const d = deps({})
    await reconcilePendingOrders({ now: NOW, email: 'ana@example.com' }, d)

    expect(d.listPending).toHaveBeenCalledWith({
      from: new Date(NOW.getTime() - RECONCILE_MAX_AGE_MS),
      to: NOW,
      email: 'ana@example.com',
      limit: 10,
    })
  })
})
