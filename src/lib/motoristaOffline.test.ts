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
