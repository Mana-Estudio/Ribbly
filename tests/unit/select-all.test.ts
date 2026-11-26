import { describe, expect, it, vi } from 'vitest'
import { DbError, PAGE_SIZE, selectAll } from '@/server/db/client'

/** Simula PostgREST: devuelve el tramo pedido de `total` filas, como `.range(from, to)`. */
function table(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }))
}

describe('selectAll', () => {
  it('trae más de una página completa (antes se cortaba en 1.000)', async () => {
    const page = table(2_345)
    const rows = await selectAll(page, 'órdenes')
    expect(rows).toHaveLength(2_345)
    expect(rows.at(-1)).toEqual({ id: 2_344 })
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999],
    ])
  })

  it('con justo una página pide una más para confirmar que no hay otra', async () => {
    const page = table(PAGE_SIZE)
    expect(await selectAll(page, 'órdenes')).toHaveLength(PAGE_SIZE)
    expect(page).toHaveBeenCalledTimes(2)
  })

  it('una tabla vacía devuelve una lista vacía', async () => {
    expect(await selectAll(table(0), 'gastos')).toEqual([])
  })

  it('respeta un tamaño de página propio', async () => {
    const page = table(5)
    expect(await selectAll(page, 'cupones', 2)).toHaveLength(5)
    expect(page).toHaveBeenCalledTimes(3)
  })

  it('un error en cualquier página corta todo, en vez de devolver datos a medias', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: Array(2).fill({}), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout', code: '57014' } })
    await expect(selectAll(page, 'Ribblys', 2)).rejects.toBeInstanceOf(DbError)
  })
})
