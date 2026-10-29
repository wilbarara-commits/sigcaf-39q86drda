import { describe, it, expect } from 'vitest'
import {
  calcularPesoPedidosKg,
  calcularDistanciaViariaHaversineKm,
  calcularDuracaoRotaMin,
  gerarSugestaoRotasAssistida,
  recalcularMetricasRota,
} from './assistedRouting'
import { School, Order, Product } from './types'

describe('assistedRouting tests', () => {
  it('calcula o peso correto respeitando kg e fallback 1 kg/un', () => {
    const productsMap = new Map<string, Product>([
      ['prod-1', { id: 'prod-1', name: 'Arroz', unit: 'kg' }],
      ['prod-2', { id: 'prod-2', name: 'Ovos', unit: 'dz' }],
      ['prod-3', { id: 'prod-3', name: 'Abacaxi', unit: 'un', peso: 1.5 } as any],
    ])

    const orders: Order[] = [
      {
        id: 'ord-1',
        numero: 'PED-01',
        schoolId: 'esc-1',
        schoolName: 'Escola A',
        origem: 'manual',
        validacao: { status: 'validado' },
        date: '2026-04-10',
        status: 'Pendente',
        total: 100,
        items: [
          { productId: 'prod-1', name: 'Arroz', quantity: 20, price: 5 }, // 20 kg
          { productId: 'prod-2', name: 'Ovos', quantity: 10, price: 10 }, // 10 * 1 = 10 kg
          { productId: 'prod-3', name: 'Abacaxi', quantity: 4, price: 5 }, // 4 * 1.5 = 6 kg
        ],
      },
    ]

    const peso = calcularPesoPedidosKg(orders, productsMap)
    expect(peso).toBe(36)
  })

  it('calcula distancia viaria haversine com fator 1.3', () => {
    // Nova Friburgo centro aprox
    const lat1 = -22.28
    const lon1 = -42.53
    const lat2 = -22.28
    const lon2 = -42.43 // ~10 km leste
    const dist = calcularDistanciaViariaHaversineKm(lat1, lon1, lat2, lon2)
    expect(dist).toBeGreaterThan(10)
  })

  it('calcula duracao = paradas * tempo + distancia / 40 km/h', () => {
    // 5 paradas a 10 min = 50 min. Distancia 40 km / 40 = 1h (60 min). Total = 110 min
    const duracao = calcularDuracaoRotaMin(5, 40, 10)
    expect(duracao).toBe(110)
  })

  it('gera sugestao dividindo escolas e separando sem coordenadas', () => {
    const escolasInput = [
      {
        escola: { id: 'e1', name: 'Escola Central', address: 'Rua A', contact: '', route: '' },
        pedidos: [{ id: 'p1' } as any],
        pesoKg: 50,
        temCoordenadas: true,
        coords: { latitude: -22.261, longitude: -42.739 },
      },
      {
        escola: { id: 'e2', name: 'Escola Norte', address: 'Rua B', contact: '', route: '' },
        pedidos: [{ id: 'p2' } as any],
        pesoKg: 30,
        temCoordenadas: true,
        coords: { latitude: -22.25, longitude: -42.73 },
      },
      {
        escola: { id: 'e3', name: 'Escola Sul', address: 'Rua C', contact: '', route: '' },
        pedidos: [{ id: 'p3' } as any],
        pesoKg: 40,
        temCoordenadas: true,
        coords: { latitude: -22.28, longitude: -42.75 },
      },
      {
        escola: { id: 'e4', name: 'Escola Sem GPS', address: 'Rua D', contact: '', route: '' },
        pedidos: [{ id: 'p4' } as any],
        pesoKg: 15,
        temCoordenadas: false,
      },
    ]

    const resultado = gerarSugestaoRotasAssistida({
      escolasInput,
      parametros: {
        numRotas: 2,
        tempoParadaMin: 10,
      },
    })

    expect(resultado.escolasSemCoordenadas.length).toBe(1)
    expect(resultado.escolasSemCoordenadas[0].escolaId).toBe('e4')
    expect(resultado.rotas.length).toBe(2)
    const totalEscolasEmRotas = resultado.rotas.reduce((acc, r) => acc + r.escolas.length, 0)
    expect(totalEscolasEmRotas).toBe(3)
  })
})
