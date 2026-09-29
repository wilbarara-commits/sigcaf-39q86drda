import { describe, it, expect } from 'vitest'
import {
  calcularDistanciaHaversineKm,
  extrairCoordenadas,
  otimizarSequenciaParadas,
  resolverDepositoCentral,
  DEPOSITO_CENTRAL,
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

  describe('DEPOSITO_CENTRAL', () => {
    it('possui as coordenadas e nome corretos do Depósito Central', () => {
      expect(DEPOSITO_CENTRAL.latitude).toBeCloseTo(-22.260264, 5)
      expect(DEPOSITO_CENTRAL.longitude).toBeCloseTo(-42.738042, 5)
      expect(DEPOSITO_CENTRAL.nome).toBe('Depósito Central')
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

    it('inicia no Depósito Central e ordena pela proximidade a partir dele, preservando badges de contrato', () => {
      // Depósito Central em (-22.260264, -42.738042)
      // Definimos 3 escolas em ordem de afastamento progressivo ao norte do depósito:
      // Perto (-22.25, -42.738), Media (-22.24, -42.738), Longe (-22.23, -42.738)
      // Se a ordem original na rota era Longe -> Perto -> Media:
      // Sem depósito ou com depósito, Longe -> Perto -> Media faz zigue-zague.
      // Partindo do Depósito, o primeiro nó mais próximo é Perto, depois Media, depois Longe.
      const paradas: ParadaOtimizavel[] = [
        {
          escolaId: 'LONGE',
          nome: 'Escola Longe',
          ordem: 1,
          contratoNumero: 'CT-02',
          latitude: -22.23,
          longitude: -42.738,
        },
        {
          escolaId: 'PERTO',
          nome: 'Escola Perto',
          ordem: 2,
          contratoNumero: 'CT-01',
          latitude: -22.25,
          longitude: -42.738,
        },
        {
          escolaId: 'MEDIA',
          nome: 'Escola Media',
          ordem: 3,
          contratoNumero: 'CT-03',
          latitude: -22.24,
          longitude: -42.738,
        },
      ]

      const res = otimizarSequenciaParadas(paradas)
      expect(res.podeOtimizar).toBe(true)
      expect(res.houveMudanca).toBe(true)
      expect(res.depositoPartida?.nome).toBe('Depósito Central')
      expect(res.depositoPartida?.latitude).toBeCloseTo(-22.260264, 5)

      // Partindo do depósito (-22.260264), a ordem ótima é PERTO (-22.25) -> MEDIA (-22.24) -> LONGE (-22.23)
      expect(res.paradasSugeridas[0].escolaId).toBe('PERTO')
      expect(res.paradasSugeridas[1].escolaId).toBe('MEDIA')
      expect(res.paradasSugeridas[2].escolaId).toBe('LONGE')

      // Preservação de badges e numeração sequencial
      expect(res.paradasSugeridas[0].ordemSugerida).toBe(1)
      expect(res.paradasSugeridas[1].ordemSugerida).toBe(2)
      expect(res.paradasSugeridas[2].ordemSugerida).toBe(3)
      expect(res.paradasSugeridas[0].contratoNumero).toBe('CT-01')
      expect(res.paradasSugeridas[1].contratoNumero).toBe('CT-03')
      expect(res.paradasSugeridas[2].contratoNumero).toBe('CT-02')

      // Distância sugerida incluindo o trecho do depósito até a 1ª escola deve ser menor que a atual
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

    it('permite customizar o Depósito Central configurado mantendo resiliência e fallback', () => {
      const depositoCustomizado = {
        nome: 'Galpão Regional Sul',
        latitude: -22.34,
        longitude: -42.84,
      }

      const paradas: ParadaOtimizavel[] = [
        {
          escolaId: '1',
          nome: 'Escola A (perto do galpão customizado)',
          ordem: 1,
          latitude: -22.341,
          longitude: -42.841,
        },
        {
          escolaId: '2',
          nome: 'Escola B (longe do galpão customizado, perto do depósito padrão)',
          ordem: 2,
          latitude: -22.260264,
          longitude: -42.738042,
        },
        {
          escolaId: '3',
          nome: 'Escola C (intermediária)',
          ordem: 3,
          latitude: -22.35,
          longitude: -42.85,
        },
      ]

      // Com o depósito customizado, Escola A deve ser a primeira parada
      const resultadoCustom = otimizarSequenciaParadas(paradas, depositoCustomizado)
      expect(resultadoCustom.depositoPartida.nome).toBe('Galpão Regional Sul')
      expect(resultadoCustom.paradasSugeridas[0].escolaId).toBe('1')

      // Testar helper resolverDepositoCentral com campos nulos/vazios
      const resolvidoPadrao = resolverDepositoCentral(null)
      expect(resolvidoPadrao.nome).toBe(DEPOSITO_CENTRAL.nome)
      expect(resolvidoPadrao.latitude).toBe(DEPOSITO_CENTRAL.latitude)
      expect(resolvidoPadrao.longitude).toBe(DEPOSITO_CENTRAL.longitude)

      // Testar com strings e números válidos
      const resolvidoParcial = resolverDepositoCentral({
        deposito_nome: 'Novo Depósito',
        deposito_latitude: '-22.500000',
        deposito_longitude: '-42.900000',
      })
      expect(resolvidoParcial.nome).toBe('Novo Depósito')
      expect(resolvidoParcial.latitude).toBeCloseTo(-22.5)
      expect(resolvidoParcial.longitude).toBeCloseTo(-42.9)

      // Testar fallback quando latitude/longitude são inválidas
      const resolvidoInvalido = resolverDepositoCentral({
        deposito_nome: 'Depósito Inválido',
        deposito_latitude: 'invalido',
        deposito_longitude: '999',
      })
      expect(resolvidoInvalido.nome).toBe('Depósito Inválido')
      expect(resolvidoInvalido.latitude).toBe(DEPOSITO_CENTRAL.latitude)
      expect(resolvidoInvalido.longitude).toBe(DEPOSITO_CENTRAL.longitude)
    })
  })
})
