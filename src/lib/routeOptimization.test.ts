import { describe, it, expect } from 'vitest'
import {
  calcularDistanciaHaversineKm,
  extrairCoordenadas,
  otimizarSequenciaParadas,
  type ParadaOtimizavel,
} from './routeOptimization'

describe('routeOptimization', () => {
  describe('calcularDistanciaHaversineKm', () => {
    it('deve retornar 0 para o mesmo ponto', () => {
      const d = calcularDistanciaHaversineKm(-23.5505, -46.6333, -23.5505, -46.6333)
      expect(d).toBeCloseTo(0, 4)
    })

    it('deve calcular distância razoável entre São Paulo e Rio de Janeiro (~360-440 km)', () => {
      // SP: -23.5505, -46.6333; RJ: -22.9068, -43.1729
      const dist = calcularDistanciaHaversineKm(-23.5505, -46.6333, -22.9068, -43.1729)
      expect(dist).toBeGreaterThan(340)
      expect(dist).toBeLessThan(400)
    })
  })

  describe('extrairCoordenadas', () => {
    it('aceita números finitos', () => {
      expect(extrairCoordenadas(-23.5, -46.6)).toEqual({ latitude: -23.5, longitude: -46.6 })
    })

    it('aceita strings com ponto ou vírgula', () => {
      expect(extrairCoordenadas('-23,5505', '-46.6333')).toEqual({
        latitude: -23.5505,
        longitude: -46.6333,
      })
    })

    it('rejeita valores nulos, vazios ou fora do range', () => {
      expect(extrairCoordenadas(null, null)).toBeNull()
      expect(extrairCoordenadas('', '')).toBeNull()
      expect(extrairCoordenadas('abc', 'def')).toBeNull()
      expect(extrairCoordenadas(100, -46)).toBeNull() // lat > 90
      expect(extrairCoordenadas(0, 0)).toBeNull() // ponto 0,0
    })
  })

  describe('otimizarSequenciaParadas', () => {
    it('desabilita otimização se rota tiver menos de 3 paradas', () => {
      const paradas: ParadaOtimizavel[] = [
        { escolaId: '1', nome: 'Escola 1', ordem: 1, latitude: -23.5, longitude: -46.6 },
        { escolaId: '2', nome: 'Escola 2', ordem: 2, latitude: -23.51, longitude: -46.61 },
      ]
      const res = otimizarSequenciaParadas(paradas)
      expect(res.podeOtimizar).toBe(false)
      expect(res.motivoNaoOtimizavel).toContain('a partir de 3 paradas')
    })

    it('desabilita otimização se nenhuma escola tiver coordenadas', () => {
      const paradas: ParadaOtimizavel[] = [
        { escolaId: '1', nome: 'Escola 1', ordem: 1 },
        { escolaId: '2', nome: 'Escola 2', ordem: 2 },
        { escolaId: '3', nome: 'Escola 3', ordem: 3 },
      ]
      const res = otimizarSequenciaParadas(paradas)
      expect(res.podeOtimizar).toBe(false)
      expect(res.motivoNaoOtimizavel).toContain('Nenhuma escola')
    })

    it('mantém a 1ª parada como âncora e preserva badges de contrato', () => {
      // Suponhamos 4 paradas em linha reta: A(0km), D(30km), B(10km), C(20km)
      // A ordem original é A -> D -> B -> C (percurso vai e volta: 0 -> 30 -> 10 -> 20 = 30 + 20 + 10 = 60km)
      // A ordem otimizada partindo de A deve ser A -> B -> C -> D (0 -> 10 -> 20 -> 30 = 30km)
      const paradas: ParadaOtimizavel[] = [
        {
          escolaId: 'A',
          nome: 'Escola Âncora A',
          ordem: 1,
          contratoNumero: 'CT-01',
          latitude: -23.0,
          longitude: -46.0,
        },
        {
          escolaId: 'D',
          nome: 'Escola Distante D',
          ordem: 2,
          contratoNumero: 'CT-02',
          latitude: -23.3,
          longitude: -46.0,
        },
        {
          escolaId: 'B',
          nome: 'Escola Próxima B',
          ordem: 3,
          contratoNumero: 'CT-01',
          latitude: -23.1,
          longitude: -46.0,
        },
        {
          escolaId: 'C',
          nome: 'Escola Média C',
          ordem: 4,
          contratoNumero: 'CT-03',
          latitude: -23.2,
          longitude: -46.0,
        },
      ]

      const res = otimizarSequenciaParadas(paradas)
      expect(res.podeOtimizar).toBe(true)
      expect(res.houveMudanca).toBe(true)
      expect(res.paradasSugeridas[0].escolaId).toBe('A') // Âncora preservada
      expect(res.paradasSugeridas[1].escolaId).toBe('B')
      expect(res.paradasSugeridas[2].escolaId).toBe('C')
      expect(res.paradasSugeridas[3].escolaId).toBe('D')

      // Preservação de badges e numeração sequencial
      expect(res.paradasSugeridas[0].ordemSugerida).toBe(1)
      expect(res.paradasSugeridas[1].ordemSugerida).toBe(2)
      expect(res.paradasSugeridas[1].contratoNumero).toBe('CT-01')
      expect(res.paradasSugeridas[2].contratoNumero).toBe('CT-03')
      expect(res.paradasSugeridas[3].contratoNumero).toBe('CT-02')

      // Distância sugerida deve ser substancialmente menor
      expect(res.distanciaSugeridaKm).toBeLessThan(res.distanciaAtualKm)
      expect(res.economiaKm).toBeGreaterThan(0)
    })

    it('mantém escolas sem coordenadas ao final na ordem relativa original', () => {
      const paradas: ParadaOtimizavel[] = [
        {
          escolaId: 'A',
          nome: 'Escola A',
          ordem: 1,
          latitude: -23.0,
          longitude: -46.0,
        },
        {
          escolaId: 'SEM-1',
          nome: 'Escola Sem Coordenada 1',
          ordem: 2,
          latitude: null,
          longitude: null,
        },
        {
          escolaId: 'B',
          nome: 'Escola B',
          ordem: 3,
          latitude: -23.1,
          longitude: -46.0,
        },
        {
          escolaId: 'SEM-2',
          nome: 'Escola Sem Coordenada 2',
          ordem: 4,
          latitude: null,
          longitude: null,
        },
      ]

      const res = otimizarSequenciaParadas(paradas)
      expect(res.podeOtimizar).toBe(true)
      expect(res.escolasSemCoordenadasCount).toBe(2)
      expect(res.escolasComCoordenadasCount).toBe(2)

      // As duas últimas devem ser SEM-1 e SEM-2
      const ids = res.paradasSugeridas.map((p) => p.escolaId)
      expect(ids.slice(-2)).toEqual(['SEM-1', 'SEM-2'])
      expect(res.paradasSugeridas.find((p) => p.escolaId === 'SEM-1')?.semCoordenada).toBe(true)
    })
  })
})
