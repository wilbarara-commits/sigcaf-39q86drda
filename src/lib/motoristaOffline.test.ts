import { describe, it, expect, beforeEach } from 'vitest'
import {
  enfileirarEntrega,
  lerFilaLocal,
  sincronizarFilaEntregas,
  salvarCachePortal,
  lerCachePortal,
  FilaEntregaItem,
} from './motoristaOffline'
import { generateDriverToken, buildDriverWhatsAppMessage } from '@/services/rota-despachos'

// Mock Storage simples em memória para os testes
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

describe('Motorista - Geração de Token e Mensagem WhatsApp', () => {
  it('gera token longo, seguro e com prefixo mot_', () => {
    const token1 = generateDriverToken()
    const token2 = generateDriverToken()

    expect(token1).toMatch(/^mot_[0-9a-f]{48}$/)
    expect(token2).toMatch(/^mot_[0-9a-f]{48}$/)
    expect(token1).not.toBe(token2)
  })

  it('monta mensagem pronta para WhatsApp com link e contagem de entregas', () => {
    const msg = buildDriverWhatsAppMessage({
      rotaNome: 'Rota Centro-Norte',
      cicloCodigo: '40/2026',
      totalEntregas: 11,
      token: 'mot_abcdef123456',
      origin: 'https://sigcaf.coop.br',
    })

    expect(msg).toContain('*Rota Centro-Norte*')
    expect(msg).toContain('Ciclo 40/2026')
    expect(msg).toContain('11 entregas')
    expect(msg).toContain('https://sigcaf.coop.br/motorista?token=mot_abcdef123456')
  })

  it('não duplica o prefixo Ciclo se cicloCodigo já contiver "Ciclo"', () => {
    const msg = buildDriverWhatsAppMessage({
      rotaNome: 'Rota Centro-Norte',
      cicloCodigo: 'Ciclo 40/2026',
      totalEntregas: 5,
      token: 'mot_abcdef123456',
      origin: 'https://sigcaf.coop.br',
    })

    expect(msg).toContain('— Ciclo 40/2026')
    expect(msg).not.toContain('Ciclo Ciclo')
  })
})

describe('Motorista - Fila Offline e Sincronização', () => {
  let storage: Storage
  const tokenTeste = 'mot_test_123'

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('enfileira entregas preservando a ordem cronológica FIFO', () => {
    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_1',
        rota_id: 'rota_a',
        escola_id: 'esc_1',
        confirmado_em: '2026-04-10T10:00:00Z',
        observacao: 'Entrega 1',
      },
      storage,
    )

    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_2',
        rota_id: 'rota_a',
        escola_id: 'esc_2',
        confirmado_em: '2026-04-10T10:15:00Z',
        observacao: 'Entrega 2',
      },
      storage,
    )

    const fila = lerFilaLocal(tokenTeste, storage)
    expect(fila).toHaveLength(2)
    expect(fila[0].client_uid).toBe('uid_1')
    expect(fila[0].status_sync).toBe('pendente')
    expect(fila[1].client_uid).toBe('uid_2')
  })

  it('é idempotente ao reenfileirar a mesma escola/uid (atualiza em vez de duplicar)', () => {
    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_1',
        rota_id: 'rota_a',
        escola_id: 'esc_1',
        confirmado_em: '2026-04-10T10:00:00Z',
        observacao: 'Versão inicial',
      },
      storage,
    )

    // Reenfileira mesma escola com nota diferente
    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_1_atualizado',
        rota_id: 'rota_a',
        escola_id: 'esc_1',
        confirmado_em: '2026-04-10T10:05:00Z',
        observacao: 'Versão corrigida',
      },
      storage,
    )

    const fila = lerFilaLocal(tokenTeste, storage)
    expect(fila).toHaveLength(1)
    expect(fila[0].observacao).toBe('Versão corrigida')
  })

  it('sincroniza itens pendentes na ordem e marca como sincronizado', async () => {
    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_1',
        rota_id: 'rota_a',
        escola_id: 'esc_1',
        confirmado_em: '2026-04-10T10:00:00Z',
      },
      storage,
    )

    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_2',
        rota_id: 'rota_a',
        escola_id: 'esc_2',
        confirmado_em: '2026-04-10T10:15:00Z',
      },
      storage,
    )

    const chamadasServidor: string[] = []
    const mockEnviador = async (item: FilaEntregaItem) => {
      chamadasServidor.push(item.client_uid)
      return { ok: true }
    }

    const resultado = await sincronizarFilaEntregas(tokenTeste, mockEnviador, storage)

    expect(resultado.sucessos).toBe(2)
    expect(resultado.falhas).toBe(0)
    expect(chamadasServidor).toEqual(['uid_1', 'uid_2'])

    const filaApos = lerFilaLocal(tokenTeste, storage)
    expect(filaApos.every((it) => it.status_sync === 'sincronizado')).toBe(true)
  })

  it('interrompe envio na ordem se o servidor der erro de rede', async () => {
    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_1',
        rota_id: 'rota_a',
        escola_id: 'esc_1',
        confirmado_em: '2026-04-10T10:00:00Z',
      },
      storage,
    )

    enfileirarEntrega(
      tokenTeste,
      {
        client_uid: 'uid_2',
        rota_id: 'rota_a',
        escola_id: 'esc_2',
        confirmado_em: '2026-04-10T10:15:00Z',
      },
      storage,
    )

    let tentativas = 0
    const mockEnviadorFalho = async (_item: FilaEntregaItem) => {
      tentativas++
      throw new Error('Sem conexão com a internet')
    }

    const resultado = await sincronizarFilaEntregas(tokenTeste, mockEnviadorFalho, storage)

    expect(resultado.sucessos).toBe(0)
    expect(resultado.falhas).toBe(1)
    expect(tentativas).toBe(1) // Não prosseguiu para o segundo item

    const filaApos = lerFilaLocal(tokenTeste, storage)
    expect(filaApos[0].status_sync).toBe('erro')
    expect(filaApos[0].ultimo_erro).toBe('Sem conexão com a internet')
    expect(filaApos[1].status_sync).toBe('pendente')
  })

  it('salva e recupera cache do portal para visualização sem sinal', () => {
    const dadosMock: any = {
      despacho: { id: 'desp_1', token: tokenTeste },
      rota: { id: 'rota_1', nome: 'Rota Sul' },
      paradas: [],
    }

    salvarCachePortal(tokenTeste, dadosMock, storage)
    const recuperado = lerCachePortal(tokenTeste, storage)

    expect(recuperado).not.toBeNull()
    expect(recuperado?.rota.nome).toBe('Rota Sul')
  })
})

describe('Motorista - Regras do Trecho a Percorrer (Última entregue -> Próxima pendente)', () => {
  interface ParadaMock {
    id: string
    escola_id: string
    ordem: number
    escola?: {
      nome: string
      latitude?: number | string
      longitude?: number | string
    }
    registro?: {
      confirmado_em?: string
    }
  }

  function calcularTrechoOrigemDestino(
    paradas: ParadaMock[],
    filaLocal: Array<{ escola_id: string; confirmado_em?: string }>,
    depositoConfig: { latitude: number; longitude: number; nome: string },
  ) {
    // 1. Próxima entrega pendente na ordem da rota
    const proximaPendente =
      paradas.find((p) => {
        const estaEntregueNoBanco = Boolean(p.registro?.confirmado_em)
        const estaEntregueNaFila = filaLocal.some(
          (f) => f.escola_id === p.escola_id && f.confirmado_em,
        )
        return !estaEntregueNoBanco && !estaEntregueNaFila
      }) || null

    // 2. Última parada fechada (já entregue)
    const entregues = paradas
      .filter((p) => {
        const estaEntregueNoBanco = Boolean(p.registro?.confirmado_em)
        const estaEntregueNaFila = filaLocal.some(
          (f) => f.escola_id === p.escola_id && f.confirmado_em,
        )
        return estaEntregueNoBanco || estaEntregueNaFila
      })
      .sort((a, b) => b.ordem - a.ordem)

    const ultimaEntregue = entregues[0] || null

    // 3. Origem do trecho
    let origem = {
      latitude: depositoConfig.latitude,
      longitude: depositoConfig.longitude,
      tipo: 'deposito' as const,
      nome: depositoConfig.nome,
      ordem: undefined as number | undefined,
    }

    if (ultimaEntregue && ultimaEntregue.escola?.latitude && ultimaEntregue.escola?.longitude) {
      origem = {
        latitude: Number(ultimaEntregue.escola.latitude),
        longitude: Number(ultimaEntregue.escola.longitude),
        tipo: 'parada_anterior' as any,
        nome: ultimaEntregue.escola.nome,
        ordem: ultimaEntregue.ordem,
      }
    }

    // 4. Destino do trecho
    const destino = proximaPendente
      ? {
          latitude: Number(proximaPendente.escola?.latitude),
          longitude: Number(proximaPendente.escola?.longitude),
          nome: proximaPendente.escola?.nome || 'Escola',
          ordem: proximaPendente.ordem,
        }
      : null

    return {
      origem,
      destino,
      todasEntregues: !proximaPendente && paradas.length > 0,
    }
  }

  const depositoTeste = {
    latitude: -22.260264,
    longitude: -42.738042,
    nome: 'Depósito Central Cooperativa',
  }

  const paradasMock: ParadaMock[] = [
    {
      id: 'p1',
      escola_id: 'esc_1',
      ordem: 1,
      escola: { nome: 'Escola A', latitude: -22.25, longitude: -42.73 },
    },
    {
      id: 'p2',
      escola_id: 'esc_2',
      ordem: 2,
      escola: { nome: 'Escola B', latitude: -22.24, longitude: -42.72 },
    },
    {
      id: 'p3',
      escola_id: 'esc_3',
      ordem: 3,
      escola: { nome: 'Escola C', latitude: -22.23, longitude: -42.71 },
    },
  ]

  it('antes da primeira entrega: origem é o Depósito Central e destino é a Parada #1', () => {
    const res = calcularTrechoOrigemDestino(paradasMock, [], depositoTeste)

    expect(res.origem.tipo).toBe('deposito')
    expect(res.origem.nome).toBe('Depósito Central Cooperativa')
    expect(res.origem.latitude).toBe(depositoTeste.latitude)
    expect(res.destino?.ordem).toBe(1)
    expect(res.destino?.nome).toBe('Escola A')
    expect(res.todasEntregues).toBe(false)
  })

  it('após entregar a Parada #1: origem passa a ser a Parada #1 e destino a Parada #2', () => {
    const paradasComUmaEntregue = paradasMock.map((p) =>
      p.ordem === 1 ? { ...p, registro: { confirmado_em: '2026-04-10T08:30:00Z' } } : p,
    )

    const res = calcularTrechoOrigemDestino(paradasComUmaEntregue, [], depositoTeste)

    expect(res.origem.tipo).toBe('parada_anterior')
    expect(res.origem.ordem).toBe(1)
    expect(res.origem.nome).toBe('Escola A')
    expect(res.origem.latitude).toBe(-22.25)
    expect(res.destino?.ordem).toBe(2)
    expect(res.destino?.nome).toBe('Escola B')
    expect(res.todasEntregues).toBe(false)
  })

  it('após entregar a Parada #2 via fila offline: origem é a Parada #2 e destino a Parada #3', () => {
    const paradasComUmaNoBanco = paradasMock.map((p) =>
      p.ordem === 1 ? { ...p, registro: { confirmado_em: '2026-04-10T08:30:00Z' } } : p,
    )
    const filaOffline = [{ escola_id: 'esc_2', confirmado_em: '2026-04-10T09:10:00Z' }]

    const res = calcularTrechoOrigemDestino(paradasComUmaNoBanco, filaOffline, depositoTeste)

    expect(res.origem.tipo).toBe('parada_anterior')
    expect(res.origem.ordem).toBe(2)
    expect(res.origem.nome).toBe('Escola B')
    expect(res.destino?.ordem).toBe(3)
    expect(res.destino?.nome).toBe('Escola C')
    expect(res.todasEntregues).toBe(false)
  })

  it('quando todas as paradas foram entregues: destino é nulo e sinaliza todasEntregues = true', () => {
    const paradasTodasEntregues = paradasMock.map((p) => ({
      ...p,
      registro: { confirmado_em: '2026-04-10T11:00:00Z' },
    }))

    const res = calcularTrechoOrigemDestino(paradasTodasEntregues, [], depositoTeste)

    expect(res.destino).toBeNull()
    expect(res.todasEntregues).toBe(true)
  })
})
