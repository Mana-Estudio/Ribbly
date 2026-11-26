-- Conciliación de pagos (src/server/reconcile.ts): un pago aprobado que se
-- encuentra consultando a Mercado Pago, porque su aviso nunca llegó, queda en
-- payment_events con source = 'reconcile'. Así se distingue de los que llegaron
-- por webhook o por el retorno, y se ve si el webhook está fallando.

alter table public.payment_events drop constraint if exists payment_events_source_check;
alter table public.payment_events
  add constraint payment_events_source_check
  check (source in ('webhook', 'return', 'admin', 'checkout', 'reconcile'));
