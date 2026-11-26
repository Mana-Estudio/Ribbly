# Login de clientes con Google

**Qué cambió (26/11/2026):** `/cuenta/login` usa el botón oficial de Google (Google Identity Services) y Supabase valida
el token con `signInWithIdToken`. Antes el login iba primero a Supabase, y Google mostraba
**"Ir a ftnwgjsyynsnojlewtsv.supabase.co"**. Ahora muestra **"ribbly.com.ar"**, y **"Ribbly"** con el logo una vez que
Google verifica la marca.

Mientras falte `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, el sitio sigue usando el login por redirección de antes: nada se rompe
durante la configuración.

## Configuración (una sola vez)

### 1. Google Cloud (quien administre el proyecto de Google donde está el cliente OAuth)

1. [console.cloud.google.com](https://console.cloud.google.com) → el proyecto que usa Supabase para Google →
   **Google Auth Platform → Clientes** (o _APIs y servicios → Credenciales_) → el **ID de cliente OAuth "Aplicación web"**.
2. En **Orígenes autorizados de JavaScript**, agregar:
   - `https://www.ribbly.com.ar`
   - `https://ribbly.com.ar`
   - `http://localhost:3000` (para probar en local)
3. **No** borrar la URI de redireccionamiento de Supabase (`https://ftnwgjsyynsnojlewtsv.supabase.co/auth/v1/callback`)
   hasta confirmar que el botón nuevo anda en producción: es la del login de respaldo.
4. Copiar el **ID de cliente** (termina en `.apps.googleusercontent.com`). Es público: no es un secreto.

### 2. Supabase (lo puede hacer cualquiera con acceso al proyecto)

**Authentication → Sign In / Providers → Google**:

- Que esté **habilitado**.
- En **Client IDs** (IDs de cliente autorizados), que figure el ID del paso 1. Si ya está como el ID principal del
  proveedor, alcanza.
- **"Skip nonce check" apagado:** el sitio manda un nonce y Supabase tiene que verificarlo.

### 3. Vercel (el agente de tu amigo)

- Variable `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = el ID del paso 1, en Production (y en Preview si se prueba ahí).
- **Redeploy:** las variables `NEXT_PUBLIC_` se incrustan en el build, así que sin un deploy nuevo no se activa.

### 4. Probar

En `https://www.ribbly.com.ar/cuenta/login` → **Continuar con Google**. La ventana de Google tiene que decir
"ribbly.com.ar" y, al elegir la cuenta, el sitio tiene que llevar a `/cuenta`.

### 5. Que diga "Ribbly" con el logo (opcional, gratis)

En Google Cloud → **Google Auth Platform → Desarrollo de la marca**:

- Nombre de la app: **Ribbly** · logo · mail de soporte.
- Página principal: `https://www.ribbly.com.ar` · Privacidad: `https://www.ribbly.com.ar/legales/privacidad` ·
  Términos: `https://www.ribbly.com.ar/legales/terminos`.
- Dominios autorizados: `ribbly.com.ar`. Hay que verificarlo en Google Search Console con un registro DNS. Cuando el
  botón nuevo ande, sacar `supabase.co` de la lista, porque Google no deja verificar un dominio que no es tuyo.
- **Verificar la marca:** Google la revisa en unos días.

## Detalles técnicos

- Código: `app/cuenta/login/GoogleSignInButton.tsx` (botón y nonce) y `app/cuenta/login/safe-next.ts` (redirección
  solo a rutas internas).
- CSP (`proxy.ts`): `frame-src` y `connect-src` permiten `https://accounts.google.com/gsi/`, y `style-src` permite
  `https://accounts.google.com/gsi/style`. El script entra por `strict-dynamic`, porque lo carga nuestro código con
  nonce.
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` (antes `same-origin`): el popup de Google tiene que poder
  avisarle a la pestaña cuando termina.
- La sesión que crea `signInWithIdToken` llega con `amr: oauth` y el mail verificado por Google, así que la acepta
  `getCustomerSession` (ver C1 en el informe de seguridad).
