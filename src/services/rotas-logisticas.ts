// Wrapper de compatibilidade que repassa chamadas diretamente para rotasService
// Garante que nenhum código legado quebre e que TODAS as queries usem a coleção 'rotas' e o campo 'rota_id'
import { rotasService } from '@/services/rotas'
import type { RotaRecord, ParadaRotaRecord, DespachoRecord } from '@/lib/types'

export const rotasLogisticasService = {
  async getAll(): Promise<RotaRecord[]> {
    return await rotasService.getAll()
  },

  async getByChamada(chamadaId: string): Promise<RotaRecord[]> {
    return await rotasService.getByChamada(chamadaId)
  },

  async getByContrato(contratoId: string): Promise<RotaRecord[]> {
    return await rotasService.getByContrato(contratoId)
  },

  async create(data: {
    contrato_id?: string
    chamada_id?: string
    nome: string
    ordem?: number
    ativa?: boolean
  }): Promise<RotaRecord> {
    return await rotasService.create(data)
  },

  async update(id: string, data: Partial<RotaRecord>): Promise<RotaRecord> {
    return await rotasService.update(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return await rotasService.delete(id)
  },

  async getParadas(rotaId?: string): Promise<ParadaRotaRecord[]> {
    return await rotasService.getParadas(rotaId)
  },

  async salvarParada(data: {
    rota_id?: string
    rota_logistica_id?: string
    escola_id: string
    ordem: number
  }): Promise<ParadaRotaRecord> {
    const rId = data.rota_id || data.rota_logistica_id || ''
    return await rotasService.salvarParada({
      rota_id: rId,
      escola_id: data.escola_id,
      ordem: data.ordem,
    })
  },

  async reordenarParadas(
    rotaId: string,
    paradas: Array<{ escola_id: string; ordem: number }>,
  ): Promise<ParadaRotaRecord[]> {
    return await rotasService.reordenarParadas(rotaId, paradas)
  },

  async despacharRotaBatch(data: {
    rota_id?: string
    rota_logistica_id?: string
    chamada_id?: string
    contrato_id?: string
    ciclo_id?: string
    user_id?: string
  }): Promise<{ despacho: DespachoRecord; pedidos: any[] }> {
    const rId = data.rota_id || data.rota_logistica_id || ''
    return await rotasService.despacharRotaBatch({
      rota_id: rId,
      chamada_id: data.chamada_id,
      contrato_id: data.contrato_id,
      ciclo_id: data.ciclo_id,
      user_id: data.user_id,
    })
  },

  async entregarRotaBatch(data: {
    rota_id?: string
    rota_logistica_id?: string
    user_id?: string
    observacao?: string
  }): Promise<{ pedidos: any[]; produtos: any[] }> {
    const rId = data.rota_id || data.rota_logistica_id || ''
    return await rotasService.entregarRotaBatch({
      rota_id: rId,
      user_id: data.user_id,
      observacao: data.observacao,
    })
  },

  async removerParada(id: string): Promise<boolean> {
    return await rotasService.removerParada(id)
  },

  async removerParadaDaRota(rotaId: string, escolaId: string): Promise<boolean> {
    return await rotasService.removerParadaDaRota(rotaId, escolaId)
  },

  async renumerarParadasDaRota(rotaId: string): Promise<ParadaRotaRecord[]> {
    return await rotasService.renumerarParadasDaRota(rotaId)
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
    return await rotasService.moverEscolaEntreRotas(data)
  },

  async getDespachos(
    filterOpt?: { contratoId?: string; chamadaId?: string } | string,
  ): Promise<DespachoRecord[]> {
    return await rotasService.getDespachos(filterOpt)
  },

  async criarDespacho(data: {
    contrato_id?: string
    chamada_id?: string
    ciclo_id?: string
    rota_id?: string
    rota_logistica_id?: string
    usuario_id?: string
    data_despacho: string
    status: 'Em Rota' | 'Entregue' | 'Cancelado'
  }): Promise<DespachoRecord> {
    const rId = data.rota_id || data.rota_logistica_id || ''
    return await rotasService.criarDespacho({
      contrato_id: data.contrato_id,
      chamada_id: data.chamada_id,
      ciclo_id: data.ciclo_id,
      rota_id: rId,
      usuario_id: data.usuario_id,
      data_despacho: data.data_despacho,
      status: data.status,
    })
  },

  async atualizarStatusDespacho(
    despachoId: string,
    status: 'Em Rota' | 'Entregue' | 'Cancelado',
  ): Promise<DespachoRecord> {
    return await rotasService.atualizarStatusDespacho(despachoId, status)
  },
}
