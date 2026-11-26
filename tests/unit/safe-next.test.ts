import { describe, expect, it } from 'vitest'
import { safeNextPath } from '../../app/cuenta/login/safe-next'

describe('safeNextPath (redirección después del login de clientes)', () => {
  it('deja pasar rutas internas', () => {
    expect(safeNextPath('/cuenta/pedidos')).toBe('/cuenta/pedidos')
    expect(safeNextPath('/cuenta?x=1')).toBe('/cuenta?x=1')
  })

  it('no deja salir del sitio', () => {
    expect(safeNextPath('//evil.example')).toBe('/cuenta')
    expect(safeNextPath('/\\evil.example')).toBe('/cuenta')
    expect(safeNextPath('https://evil.example')).toBe('/cuenta')
    expect(safeNextPath('javascript:alert(1)')).toBe('/cuenta')
    expect(safeNextPath(undefined)).toBe('/cuenta')
  })
})
