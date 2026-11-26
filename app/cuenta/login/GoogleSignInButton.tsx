'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabase } from '@/client/supabase'
import { Spinner } from '@/ui/motion'
import { safeNextPath } from './safe-next'

/**
 * Botón oficial de Google (Google Identity Services) con el token validado por
 * Supabase (`signInWithIdToken`). Antes el login iba a Supabase y de ahí a
 * Google, y Google mostraba "Ir a ftnwgj….supabase.co". Así el pedido sale de
 * nuestro dominio: Google muestra "ribbly.com.ar" (o "Ribbly", con la marca
 * verificada en Google Cloud).
 *
 * Nonce: Google recibe el SHA-256 y Supabase el valor crudo; un token robado
 * no se puede reusar en otra sesión.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client'

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    nonce: string
    use_fedcm_for_button?: boolean
    ux_mode?: 'popup' | 'redirect'
    context?: 'signin' | 'signup' | 'use'
    itp_support?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'large' | 'medium' | 'small'
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      logo_alignment?: 'left' | 'center'
      width?: number
      locale?: string
    },
  ): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('gis')), { once: true })
    if (!existing) {
      script.src = GIS_SRC
      script.async = true
      document.head.appendChild(script)
    }
  })
}

async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const raw = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { raw, hashed }
}

export function GoogleSignInButton({
  clientId,
  nextUrl,
  onError,
  disabled,
}: {
  clientId: string
  nextUrl: string
  onError: (message: string) => void
  disabled?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [nonce] = await Promise.all([makeNonce(), loadGis()])
        if (cancelled || !container.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          context: 'signin',
          use_fedcm_for_button: true,
          itp_support: true,
          callback: async ({ credential }) => {
            setSigningIn(true)
            const { error } = await getBrowserSupabase().auth.signInWithIdToken({
              provider: 'google',
              token: credential,
              nonce: nonce.raw,
            })
            if (error) {
              setSigningIn(false)
              onError('No pudimos entrar con Google. Probá de nuevo o usá tu email.')
              return
            }
            // Navegación completa: el servidor lee la sesión recién guardada en las cookies.
            window.location.assign(safeNextPath(nextUrl))
          },
        })
        window.google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.min(400, Math.max(240, container.current.offsetWidth || 320)),
          locale: 'es-419',
        })
        setReady(true)
      } catch {
        if (!cancelled) onError('No se pudo cargar el botón de Google. Probá con tu email.')
      }
    })()
    return () => {
      cancelled = true
    }
    // onError es estable para este uso; reinicializar en cada render no hace falta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, nextUrl])

  return (
    <div className="relative flex min-h-[44px] w-full justify-center">
      <div
        ref={container}
        className={`flex w-full justify-center ${disabled || signingIn ? 'pointer-events-none opacity-50' : ''}`}
        aria-busy={!ready || signingIn}
      />
      {(!ready || signingIn) && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-neutral-600">
          <Spinner className="size-5" />
          <span>{signingIn ? 'Entrando…' : 'Cargando Google…'}</span>
        </div>
      )}
    </div>
  )
}
