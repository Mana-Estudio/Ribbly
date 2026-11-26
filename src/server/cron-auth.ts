import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { env } from './env'

/** Comparación en tiempo constante: el secreto no se adivina por cuánto tarda. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`. Devuelve la
 * respuesta de rechazo, o null si el pedido puede seguir. Sin CRON_SECRET no
 * corre en producción (en desarrollo, sí, para probar a mano).
 */
export function rejectUnauthorizedCron(request: Request): NextResponse | null {
  const cronSecret = env().CRON_SECRET
  if (!cronSecret) {
    return process.env.NODE_ENV === 'production'
      ? NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
      : null
  }
  if (!sameSecret(request.headers.get('authorization') ?? '', `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return null
}
