import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/server/cron-auth'
import { processAnnualReminders } from '@/server/customer/reminders'

/**
 * Recordatorios anuales. Lo llama Vercel Cron con CRON_SECRET: antes usaba
 * TOKEN_ENCRYPTION_KEY como contraseña, y una clave de cifrado no debe viajar
 * en un header.
 */
export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request)
  if (rejected) return rejected

  const result = await processAnnualReminders()
  return NextResponse.json({
    ok: true,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
