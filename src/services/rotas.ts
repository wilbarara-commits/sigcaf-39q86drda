import pb from '@/lib/pocketbase/client'
import type { RotaRecord, ParadaRotaRecord, DespachoRecord } from '@/lib/types'

export const rotasService = {
  async getAll(): Promise<RotaRecord[]> {
    return await pb.collection('rotas').getFullList<RotaRecord>({
      sort: 'ordem,nome',
    })
  },

  async getByChamada(chamadaId: string): Promise<RotaRecord[]> {
    return await pb.collection('rotas').getFullList<RotaRecord>({
      filter: `chamada_id = "${chamadaId}"`,
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
    contrato_id?: string
    chamada_id?: string
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

  async atualizarPosicaoCaminhao(
    id: string,
    posicao: { caminhao_escola_id?: string | null; caminhao_posicao_atual?: number | null },
  ): Promise<RotaRecord> {
    return await pb.collection('rotas').update<RotaRecord>(id, {
      caminhao_escola_id: posicao.caminhao_escola_id || null,
      caminhao_posicao_atual: posicao.caminhao_posicao_atual || null,
    })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('rotas').delete(id)
  },

  async findOrCreate(contratoId: string, nome: string, chamadaId?: string): Promise<RotaRecord> {
    const trimmed = (nome || '').trim().replace(/\s+/g, ' ')
    let resolvedChamadaId = chamadaId?.trim() || ''

    // Se temos chamada_id fornecido, 1ª prioridade: buscar por chamada_id = X && nome = Y
    if (resolvedChamadaId) {
      const existingChamada = await pb.collection('rotas').getFullList<RotaRecord>({
        filter: `chamada_id = "${resolvedChamadaId}" && nome = "${trimmed}"`,
      })
      if (existingChamada.length > 0) {
        return existingChamada[0]
      }
    }

    // 2ª prioridade: fallback por contrato_id = X && nome = Y (se contratoId fornecido)
    if (contratoId) {
      const existingContrato = await pb.collection('rotas').getFullList<RotaRecord>({
        filter: `contrato_id = "${contratoId}" && nome = "${trimmed}"`,
      })
      if (existingContrato.length > 0) {
        return existingContrato[0]
      }

      // 3ª prioridade: se não tínhamos chamadaId mas temos contratoId, resolve o chamada_id do contrato
      if (!resolvedChamadaId) {
        try {
          const cRec = await pb.collection('contratos').getOne<{ chamada_id?: string }>(contratoId)
          if (cRec?.chamada_id) {
            resolvedChamadaId = cRec.chamada_id
            const existingChamadaResolvida = await pb.collection('rotas').getFullList<RotaRecord>({
              filter: `chamada_id = "${resolvedChamadaId}" && nome = "${trimmed}"`,
            })
            if (existingChamadaResolvida.length > 0) {
              return existingChamadaResolvida[0]
            }
          }
        } catch {
          // Fallback silencioso se o contrato não for encontrado ou não tiver chamada_id
        }
      }
    }

    // Se não existia, criar nova rota.
    // Descobrir a contagem para a ordem dentro da chamada (se houver) ou do contrato
    let count = 0
    if (resolvedChamadaId) {
      const rotasChamada = await pb.collection('rotas').getFullList<RotaRecord>({
        filter: `chamada_id = "${resolvedChamadaId}"`,
      })
      count = rotasChamada.length
    } else if (contratoId) {
      const rotasContrato = await pb.collection('rotas').getFullList<RotaRecord>({
        filter: `contrato_id = "${contratoId}"`,
      })
      count = rotasContrato.length
    }

    return await pb.collection('rotas').create<RotaRecord>({
      contrato_id: contratoId || undefined,
      chamada_id: resolvedChamadaId || undefined,
      nome: trimmed,
      ordem: count + 1,
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
    chamada_id?: string
    contrato_id?: string
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
    observacao?: string
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
    // Buscar a parada antes da exclusão para descobrir a rota vinculada
    let rotaId = ''
    try {
      const parada = await pb.collection('paradas_rota').getOne<ParadaRotaRecord>(id)
      rotaId = parada.rota_id || (parada as any).rota_logistica_id || ''
    } catch {
      // Se não encontrou ou erro, prossegue com delete
    }

    const deleted = await pb.collection('paradas_rota').delete(id)

    // Se temos a rota, renumera sequencialmente (1, 2, 3...) as paradas restantes
    if (rotaId) {
      await this.renumerarParadasDaRota(rotaId)
    }

    return deleted
  },

  async removerParadaDaRota(rotaId: string, escolaId: string): Promise<boolean> {
    const filter = `(rota_id = "${rotaId}" || rota_logistica_id = "${rotaId}") && escola_id = "${escolaId}"`
    const records = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
      filter,
    })

    for (const rec of records) {
      await pb.collection('paradas_rota').delete(rec.id)
    }

    // Buscar paradas restantes daquela rota e atualizar cada uma com ordem sequencial 1..N
    const restantes = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
      filter: `rota_id = "${rotaId}" || rota_logistica_id = "${rotaId}"`,
      sort: 'ordem',
    })

    for (let i = 0; i < restantes.length; i++) {
      const p = restantes[i]
      const novaOrdem = i + 1
      if (p.ordem !== novaOrdem) {
        await pb.collection('paradas_rota').update<ParadaRotaRecord>(p.id, { ordem: novaOrdem })
      }
    }

    return true
  },

  async renumerarParadasDaRota(rotaId: string): Promise<ParadaRotaRecord[]> {
    try {
      const restantes = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
        filter: `rota_id = "${rotaId}" || rota_logistica_id = "${rotaId}"`,
        sort: 'ordem,created',
      })

      const atualizadas: ParadaRotaRecord[] = []
      for (let index = 0; index < restantes.length; index++) {
        const parada = restantes[index]
        const novaOrdem = index + 1
        if (parada.ordem !== novaOrdem) {
          const updated = await pb.collection('paradas_rota').update<ParadaRotaRecord>(parada.id, {
            ordem: novaOrdem,
          })
          atualizadas.push(updated)
        } else {
          atualizadas.push(parada)
        }
      }
      return atualizadas
    } catch (err) {
      console.error(`Erro ao renumerar paradas da rota ${rotaId}:`, err)
      return []
    }
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
  async getDespachos(
    filterOpt?: { contratoId?: string; chamadaId?: string } | string,
  ): Promise<DespachoRecord[]> {
    let filter = ''
    if (typeof filterOpt === 'string') {
      filter = filterOpt ? `contrato_id = "${filterOpt}"` : ''
    } else if (filterOpt) {
      if (filterOpt.chamadaId) {
        filter = `chamada_id = "${filterOpt.chamadaId}"`
      } else if (filterOpt.contratoId) {
        filter = `contrato_id = "${filterOpt.contratoId}"`
      }
    }
    return await pb.collection('despachos').getFullList<DespachoRecord>({
      filter,
      sort: '-data_despacho',
      expand: 'contrato_id,chamada_id,ciclo_id,rota_id,usuario_id',
    })
  },

  async criarDespacho(data: {
    contrato_id?: string
    chamada_id?: string
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
