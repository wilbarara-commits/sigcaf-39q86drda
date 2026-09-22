import pb from '@/lib/pocketbase/client'
import type { RotaRecord, ParadaRotaRecord, DespachoRecord } from '@/lib/types'

export const rotasService = {
  async getAll(): Promise<RotaRecord[]> {
    return await pb.collection('rotas').getFullList<RotaRecord>({
      sort: 'ordem,nome',
    })
  },

  async getByContrato(contratoId: string): Promise<RotaRecord[]> {
    return await pb.collection('rotas').getFullList<RotaRecord>({
      filter: `contrato_id = "${contratoId}"`,
      sort: 'ordem,nome',
    })
  },

  async create(data: {
    contrato_id: string
    nome: string
    ordem?: number
    ativa?: boolean
  }): Promise<RotaRecord> {
    const cleanNome = (data.nome || '').trim().replace(/\s+/g, ' ')
    return await pb.collection('rotas').create<RotaRecord>({
      ...data,
      nome: cleanNome,
      ativa: data.ativa ?? true,
    })
  },

  async update(id: string, data: Partial<RotaRecord>): Promise<RotaRecord> {
    const payload = { ...data }
    if (payload.nome !== undefined) {
      payload.nome = (payload.nome || '').trim().replace(/\s+/g, ' ')
    }
    return await pb.collection('rotas').update<RotaRecord>(id, payload)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('rotas').delete(id)
  },

  async findOrCreate(contratoId: string, nome: string): Promise<RotaRecord> {
    const trimmed = (nome || '').trim().replace(/\s+/g, ' ')
    const existing = await pb.collection('rotas').getFullList<RotaRecord>({
      filter: `contrato_id = "${contratoId}" && nome = "${trimmed}"`,
    })
    if (existing.length > 0) {
      return existing[0]
    }
    const count = await pb.collection('rotas').getFullList<RotaRecord>({
      filter: `contrato_id = "${contratoId}"`,
    })
    return await pb.collection('rotas').create<RotaRecord>({
      contrato_id: contratoId,
      nome: trimmed,
      ordem: count.length + 1,
      ativa: true,
    })
  },

  // Paradas da Rota (sequenciamento)
  async getParadas(rotaId?: string): Promise<ParadaRotaRecord[]> {
    const filter = rotaId ? `rota_id = "${rotaId}"` : ''
    return await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
      filter,
      sort: 'ordem',
      expand: 'escola_id,rota_id',
    })
  },

  async salvarParada(data: {
    rota_id: string
    escola_id: string
    ordem: number
  }): Promise<ParadaRotaRecord> {
    const existing = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
      filter: `rota_id = "${data.rota_id}" && escola_id = "${data.escola_id}"`,
    })
    if (existing.length > 0) {
      return await pb.collection('paradas_rota').update<ParadaRotaRecord>(existing[0].id, {
        ordem: data.ordem,
      })
    }
    return await pb.collection('paradas_rota').create<ParadaRotaRecord>(data)
  },

  async reordenarParadas(
    rotaId: string,
    paradas: Array<{ escola_id: string; ordem: number }>,
  ): Promise<ParadaRotaRecord[]> {
    try {
      const res = await pb.send<{ success: boolean; paradas: ParadaRotaRecord[] }>(
        '/backend/v1/rotas/salvar-paradas',
        {
          method: 'POST',
          body: { rota_id: rotaId, paradas },
        },
      )
      return res.paradas
    } catch {
      // Fallback local se o hook falhar
      const results: ParadaRotaRecord[] = []
      for (const p of paradas) {
        const saved = await this.salvarParada({
          rota_id: rotaId,
          escola_id: p.escola_id,
          ordem: p.ordem,
        })
        results.push(saved)
      }
      return results
    }
  },

  async despacharRotaBatch(data: {
    rota_id: string
    contrato_id: string
    ciclo_id?: string
    user_id?: string
  }): Promise<{ despacho: DespachoRecord; pedidos: any[] }> {
    return await pb.send<{ success: boolean; despacho: DespachoRecord; pedidos: any[] }>(
      '/backend/v1/rotas/despachar',
      {
        method: 'POST',
        body: data,
      },
    )
  },

  async entregarRotaBatch(data: {
    rota_id: string
    user_id?: string
  }): Promise<{ pedidos: any[]; produtos: any[] }> {
    return await pb.send<{ success: boolean; pedidos: any[]; produtos: any[] }>(
      '/backend/v1/rotas/entregar',
      {
        method: 'POST',
        body: data,
      },
    )
  },

  async removerParada(id: string): Promise<boolean> {
    return await pb.collection('paradas_rota').delete(id)
  },

  async moverEscolaEntreRotas(data: {
    escola_id: string
    origem_rota_id?: string
    destino_rota_id: string
    target_ordem?: number
  }): Promise<{
    success: boolean
    paradas_origem?: ParadaRotaRecord[]
    paradas_destino?: ParadaRotaRecord[]
  }> {
    return await pb.send<{
      success: boolean
      paradas_origem?: ParadaRotaRecord[]
      paradas_destino?: ParadaRotaRecord[]
    }>('/backend/v1/rotas/mover-escola', {
      method: 'POST',
      body: data,
    })
  },

  // Despachos
  async getDespachos(contratoId?: string): Promise<DespachoRecord[]> {
    const filter = contratoId ? `contrato_id = "${contratoId}"` : ''
    return await pb.collection('despachos').getFullList<DespachoRecord>({
      filter,
      sort: '-data_despacho',
      expand: 'contrato_id,ciclo_id,rota_id,usuario_id',
    })
  },

  async criarDespacho(data: {
    contrato_id: string
    ciclo_id?: string
    rota_id: string
    usuario_id?: string
    data_despacho: string
    status: 'Em Rota' | 'Entregue' | 'Cancelado'
  }): Promise<DespachoRecord> {
    return await pb.collection('despachos').create<DespachoRecord>(data)
  },

  async atualizarStatusDespacho(
    despachoId: string,
    status: 'Em Rota' | 'Entregue' | 'Cancelado',
  ): Promise<DespachoRecord> {
    return await pb.collection('despachos').update<DespachoRecord>(despachoId, { status })
  },
}
