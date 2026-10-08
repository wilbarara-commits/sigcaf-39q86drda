import { describe, it, expect } from 'vitest'
import { coordenadaSugestoesService, TOLERANCIA_DISTANCIA_METROS } from './coordenada-sugestoes'

describe('coordenadaSugestoesService', () => {
  it('tolerância padrão é de 50 metros', () => {
    expect(TOLERANCIA_DISTANCIA_METROS).toBe(50)
  })

  it('calcula comparativo de distância quando a escola já possui coordenadas', () => {
    // Coordenadas próximas (~200m)
    const latEscola = -22.28
    const lngEscola = -42.53
    const latSugerida = -22.2818
    const lngSugerida = -42.53

    const comp = coordenadaSugestoesService.compararDistancia(
      latEscola,
      lngEscola,
      latSugerida,
      lngSugerida,
    )

    expect(comp.temCoordAtual).toBe(true)
    expect(comp.distanciaMetros).toBeGreaterThan(150)
    expect(comp.distanciaMetros).toBeLessThan(250)
    expect(comp.rotuloFormatado).toContain('metros de diferença')
  })

  it('indica claramente quando a escola não tem coordenadas cadastradas no mestre', () => {
    const comp = coordenadaSugestoesService.compararDistancia(null, null, -22.2818, -42.53)

    expect(comp.temCoordAtual).toBe(false)
    expect(comp.rotuloFormatado).toContain('Sem coordenadas cadastradas')
  })
})
