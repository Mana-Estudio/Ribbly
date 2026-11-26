/**
 * Solo rutas internas: un `next` armado a mano no puede sacar del sitio.
 * `//otro-sitio.com` y `/\otro-sitio.com` también empiezan con "/", pero el
 * navegador los lee como otro dominio.
 */
export function safeNextPath(next: string | undefined | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : '/cuenta'
}
