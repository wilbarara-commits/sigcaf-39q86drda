import pb from '@/lib/pocketbase/client'
import type { RotaLogisticaRecord, ParadaRotaRecord, DespachoRecord } from '@/lib/types'

export const rotasLogisticasService = {
  async getAll(): Promise<RotaLogisticaRecord[]> {
    return await pb.collection('rotas_logisticas').getFullList<RotaLogisticaRecord>({
      sort: 'ordem,nome',
    })
  },

  async getByContrato(contratoId: string): Promise<RotaLogisticaRecord[]> {
    return await pb.collection('rotas_logisticas').getFullList<RotaLogisticaRecord>({
      filter: `contrato_id = "${contratoId}"`,
      sort: 'ordem,nome',
    })
  },

  async create(data: {
    contrato_id: string
    nome: string
    ordem?: number
    ativa?: boolean
  }): Promise<RotaLogisticaRecord> {
    const cleanNome = (data.nome || '').trim().replace(/\s+/g, ' ')
    return await pb.collection('rotas_logisticas').create<RotaLogisticaRecord>({
      ...data,
      nome: cleanNome,
      ativa: data.ativa ?? true,
    })
  },

  async update(id: string, data: Partial<RotaLogisticaRecord>): Promise<RotaLogisticaRecord> {
    const payload = { ...data }
    if (payload.nome !== undefined) {
      payload.nome = (payload.nome || '').trim().replace(/\s+/g, ' ')
    }
    return await pb.collection('rotas_logisticas').update<RotaLogisticaRecord>(id, payload)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('rotas_logisticas').delete(id)
  },

  // Paradas da Rota
  async getParadas(rotaLogisticaId?: string): Promise<ParadaRotaRecord[]> {
    const filter = rotaLogisticaId ? `rota_logistica_id = "${rotaLogisticaId}"` : ''
    return await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
      filter,
      sort: 'ordem',
      expand: 'escola_id,rota_logistica_id',
    })
  },

  async salvarParada(data: {
    rota_logistica_id: string
    escola_id: string
    ordem: number
  }): Promise<ParadaRotaRecord> {
    const existing = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
      filter: `rota_logistica_id = "${data.rota_logistica_id}" && escola_id = "${data.escola_id}"`,
    })
    if (existing.length > 0) {
      return await pb.collection('paradas_rota').update<ParadaRotaRecord>(existing[0].id, {
        ordem: data.ordem,
      })
    }
    return await pb.collection('paradas_rota').create<ParadaRotaRecord>(data)
  },

  async reordenarParadas(
    rotaLogisticaId: string,
    paradas: Array<{ escola_id: string; ordem: number }>,
  ): Promise<ParadaRotaRecord[]> {
    try {
      const res = await pb.send<{ success: boolean; paradas: ParadaRotaRecord[] }>(
        '/backend/v1/rotas-logisticas/salvar-paradas',
        {
          method: 'POST',
          body: { rota_logistica_id: rotaLogisticaId, paradas },
        },
      )
      return res.paradas
    } catch {
      // Fallback local se o hook falhar
      const results: ParadaRotaRecord[] = []
      for (const p of paradas) {
        const saved = await this.salvarParada({
          rota_logistica_id: rotaLogisticaId,
          escola_id: p.escola_id,
          ordem: p.ordem,
        })
        results.push(saved)
      }
      return results
    }
  },

  async despacharRotaBatch(data: {
    rota_logistica_id: string
    contrato_id: string
    ciclo_id?: string
    user_id?: string
  }): Promise<{ despacho: DespachoRecord; pedidos: any[] }> {
    return await pb.send<{ success: boolean; despacho: DespachoRecord; pedidos: any[] }>(
      '/backend/v1/rotas-logisticas/despachar',
      {
        method: 'POST',
        body: data,
      },
    )
  },

  async entregarRotaBatch(data: {
    rota_logistica_id: string
    user_id?: string
  }): Promise<{ pedidos: any[]; produtos: any[] }> {
    return await pb.send<{ success: boolean; pedidos: any[]; produtos: any[] }>(
      '/backend/v1/rotas-logisticas/entregar',
      {
        method: 'POST',
        body: data,
      },
    )
  },

  async removerParada(id: string): Promise<boolean> {
    return await pb.collection('paradas_rota').delete(id)
  },

  // Despachos
  async getDespachos(contratoId?: string): Promise<DespachoRecord[]> {
    const filter = contratoId ? `contrato_id = "${contratoId}"` : ''
    return await pb.collection('despachos').getFullList<DespachoRecord>({
      filter,
      sort: '-data_despacho',
      expand: 'contrato_id,ciclo_id,rota_logistica_id,usuario_id',
    })
  },

  async criarDespacho(data: {
    contrato_id: string
    ciclo_id?: string
    rota_logistica_id: string
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
