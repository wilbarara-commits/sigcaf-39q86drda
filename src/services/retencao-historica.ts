import pb from '@/lib/pocketbase/client'
import type { RotaSnapshotRecord, EntregaComprovanteRecord, ParadaSnapshotItem } from '@/lib/types'

export interface SalvarSnapshotRotaInput {
  rotaId: string
  cicloId?: string
  chamadaId?: string
  motoristaId?: string
  despachoId?: string
  rotaNome?: string
  versaoEvento: 'despacho' | 'fechamento' | 'manual'
  totalParadas?: number
  totalPedidos?: number
  paradasSnapshot?: ParadaSnapshotItem[] | string
  snapshotEm?: string
  observacao?: string
}

export interface SalvarComprovanteEntregaInput {
  escolaId: string
  rotaId?: string
  cicloId?: string
  chamadaId?: string
  pedidoId?: string
  motoristaId?: string
  registroId?: string
  escolaNome?: string
  responsavelNome?: string
  responsavelCpf?: string
  chegadaEm?: string
  confirmadoEm?: string
  assinatura?: string
  foto?: string
  observacao?: string
  origem: 'portal_motorista' | 'fechamento_secretaria' | 'backfill'
  clientUid?: string
}

export const retencaoHistoricaService = {
  /**
   * Salva ou atualiza um snapshot de rota de forma idempotente e segura (não-bloqueante).
   * Não dispara rollback e não interrompe a operação se falhar.
   */
  async salvarSnapshot(input: SalvarSnapshotRotaInput): Promise<RotaSnapshotRecord | null> {
    try {
      if (!input.rotaId) return null

      const nowIso = new Date().toISOString()
      let rotaNome = input.rotaNome || ''
      if (!rotaNome) {
        try {
          const rRec = await pb.collection('rotas').getOne(input.rotaId)
          rotaNome = rRec.nome || 'Rota'
        } catch {
          rotaNome = 'Rota'
        }
      }

      // Paradas formatadas em JSON
      let paradasJson = ''
      let totalParadas = input.totalParadas ?? 0
      if (input.paradasSnapshot) {
        if (typeof input.paradasSnapshot === 'string') {
          paradasJson = input.paradasSnapshot
          try {
            const parsed = JSON.parse(input.paradasSnapshot)
            if (Array.isArray(parsed) && totalParadas === 0) {
              totalParadas = parsed.length
            }
          } catch {
            /* tolerante */
          }
        } else if (Array.isArray(input.paradasSnapshot)) {
          paradasJson = JSON.stringify(input.paradasSnapshot)
          totalParadas = input.paradasSnapshot.length
        }
      }

      // Se paradas não foram informadas, buscar na collection paradas_rota
      if (!paradasJson) {
        try {
          const pList = await pb.collection('paradas_rota').getFullList({
            filter: `rota_id = "${input.rotaId}"`,
            sort: 'ordem',
            expand: 'escola_id',
          })
          const items: ParadaSnapshotItem[] = pList.map((p, idx) => ({
            escola_id: p.escola_id,
            escola_nome: (p as any).expand?.escola_id?.nome || '',
            ordem: p.ordem || idx + 1,
            endereco: (p as any).expand?.escola_id?.endereco || '',
          }))
          paradasJson = JSON.stringify(items)
          totalParadas = items.length
        } catch {
          /* tolerante */
        }
      }

      // Contagem de pedidos se não informado
      let totalPedidos = input.totalPedidos ?? 0
      if (totalPedidos === 0 && input.cicloId) {
        try {
          const pList = await pb.collection('pedidos').getFullList({
            filter: `rota_id = "${input.rotaId}" && ciclo_id = "${input.cicloId}"`,
          })
          totalPedidos = pList.length
        } catch {
          /* tolerante */
        }
      }

      // Filtro idempotente: buscar snapshot existente para mesma rota, ciclo e versao_evento
      const filterConditions = [
        `rota_id = "${input.rotaId}"`,
        `versao_evento = "${input.versaoEvento}"`,
      ]
      if (input.cicloId) {
        filterConditions.push(`ciclo_id = "${input.cicloId}"`)
      }
      const filterStr = filterConditions.join(' && ')

      const snapExistentes = await pb
        .collection('rota_snapshots')
        .getList<RotaSnapshotRecord>(1, 1, {
          filter: filterStr,
          sort: '-snapshot_em,-created',
        })

      const payload: Record<string, any> = {
        rota_id: input.rotaId,
        ciclo_id: input.cicloId || undefined,
        chamada_id: input.chamadaId || undefined,
        motorista_id: input.motoristaId || undefined,
        despacho_id: input.despachoId || undefined,
        rota_nome: rotaNome,
        versao_evento: input.versaoEvento,
        total_paradas: totalParadas,
        total_pedidos: totalPedidos,
        paradas_snapshot: paradasJson || '[]',
        snapshot_em: input.snapshotEm || nowIso,
        observacao: input.observacao || undefined,
      }

      if (snapExistentes.items.length > 0) {
        const existId = snapExistentes.items[0].id
        return await pb.collection('rota_snapshots').update<RotaSnapshotRecord>(existId, payload)
      } else {
        return await pb.collection('rota_snapshots').create<RotaSnapshotRecord>(payload)
      }
    } catch (err) {
      console.warn('Aviso não-bloqueante ao reter snapshot em rota_snapshots:', err)
      return null
    }
  },

  /**
   * Salva ou atualiza um comprovante de entrega individual de forma idempotente e segura (não-bloqueante).
   * Garante a retenção em entrega_comprovantes com ciclo_id e chamada_id.
   */
  async salvarComprovante(
    input: SalvarComprovanteEntregaInput,
  ): Promise<EntregaComprovanteRecord | null> {
    try {
      if (!input.escolaId) return null

      const nowIso = new Date().toISOString()
      let escolaNome = input.escolaNome || ''
      if (!escolaNome) {
        try {
          const escRec = await pb.collection('escolas').getOne(input.escolaId)
          escolaNome = escRec.nome || ''
        } catch {
          /* tolerante */
        }
      }

      // Idempotência:
      // 1. Chave client_uid (se houver)
      // 2. Chave pedido_id (se houver)
      // 3. Chave registro_id (se houver)
      // 4. Combinação escola_id + ciclo_id (+ rota_id)
      let compExistenteId: string | null = null

      if (input.clientUid) {
        try {
          const list = await pb
            .collection('entrega_comprovantes')
            .getList<EntregaComprovanteRecord>(1, 1, {
              filter: `client_uid = "${input.clientUid}"`,
            })
          if (list.items.length > 0) compExistenteId = list.items[0].id
        } catch {
          /* tolerante */
        }
      }

      if (!compExistenteId && input.pedidoId) {
        try {
          const list = await pb
            .collection('entrega_comprovantes')
            .getList<EntregaComprovanteRecord>(1, 1, {
              filter: `pedido_id = "${input.pedidoId}"`,
            })
          if (list.items.length > 0) compExistenteId = list.items[0].id
        } catch {
          /* tolerante */
        }
      }

      if (!compExistenteId && input.registroId) {
        try {
          const list = await pb
            .collection('entrega_comprovantes')
            .getList<EntregaComprovanteRecord>(1, 1, {
              filter: `registro_id = "${input.registroId}"`,
            })
          if (list.items.length > 0) compExistenteId = list.items[0].id
        } catch {
          /* tolerante */
        }
      }

      if (!compExistenteId && input.cicloId && input.escolaId) {
        try {
          const filterEsc = input.rotaId
            ? `escola_id = "${input.escolaId}" && ciclo_id = "${input.cicloId}" && rota_id = "${input.rotaId}"`
            : `escola_id = "${input.escolaId}" && ciclo_id = "${input.cicloId}"`
          const list = await pb
            .collection('entrega_comprovantes')
            .getList<EntregaComprovanteRecord>(1, 1, {
              filter: filterEsc,
              sort: '-created',
            })
          if (list.items.length > 0) compExistenteId = list.items[0].id
        } catch {
          /* tolerante */
        }
      }

      const payload: Record<string, any> = {
        escola_id: input.escolaId,
        escola_nome: escolaNome,
        rota_id: input.rotaId || undefined,
        ciclo_id: input.cicloId || undefined,
        chamada_id: input.chamadaId || undefined,
        pedido_id: input.pedidoId || undefined,
        motorista_id: input.motoristaId || undefined,
        registro_id: input.registroId || undefined,
        responsavel_nome: input.responsavelNome || undefined,
        responsavel_cpf: input.responsavelCpf || undefined,
        chegada_em: input.chegadaEm || undefined,
        confirmado_em: input.confirmadoEm || nowIso,
        assinatura: input.assinatura || undefined,
        foto: input.foto || undefined,
        observacao: input.observacao || undefined,
        origem: input.origem,
        client_uid: input.clientUid || undefined,
      }

      if (compExistenteId) {
        return await pb
          .collection('entrega_comprovantes')
          .update<EntregaComprovanteRecord>(compExistenteId, payload)
      } else {
        return await pb.collection('entrega_comprovantes').create<EntregaComprovanteRecord>(payload)
      }
    } catch (err) {
      console.warn('Aviso não-bloqueante ao reter comprovante em entrega_comprovantes:', err)
      return null
    }
  },

  /**
   * Salva comprovantes em lote para múltiplos pedidos/escolas de uma rota no fechamento.
   * Não-bloqueante e tolerante a falhas parciais.
   */
  async salvarComprovantesFechamentoLote(input: {
    rotaId: string
    cicloId?: string
    chamadaId?: string
    motoristaId?: string
    pedidos: Array<{
      id: string
      escola_id: string
      observacao_entrega?: string
      entregue_em?: string
    }>
    escolaNomesMap?: Map<string, string>
    responsavelNome?: string
    observacaoGeral?: string
  }): Promise<number> {
    let sucessos = 0
    try {
      const nowIso = new Date().toISOString()
      for (const ped of input.pedidos) {
        const obs = ped.observacao_entrega || input.observacaoGeral || undefined
        const escNome = input.escolaNomesMap?.get(ped.escola_id) || ''
        const comp = await this.salvarComprovante({
          escolaId: ped.escola_id,
          escolaNome: escNome,
          rotaId: input.rotaId,
          cicloId: input.cicloId,
          chamadaId: input.chamadaId,
          pedidoId: ped.id,
          motoristaId: input.motoristaId,
          responsavelNome: input.responsavelNome,
          confirmado_em: ped.entregue_em || nowIso,
          observacao: obs,
          origem: 'fechamento_secretaria',
        })
        if (comp) sucessos++
      }
    } catch (err) {
      console.warn('Aviso não-bloqueante no salvamento de comprovantes em lote:', err)
    }
    return sucessos
  },

  /**
   * Busca todos os comprovantes permanentes de entrega de um ciclo específico.
   * Isolamento por ciclo estrito: filtra por ciclo_id.
   * Suporta filtro opcional por rotaId.
   */
  async getComprovantesByCiclo(
    cicloId: string,
    rotaId?: string,
  ): Promise<EntregaComprovanteRecord[]> {
    if (!cicloId) return []
    try {
      const filters = [`ciclo_id = "${cicloId}"`]
      if (rotaId) {
        filters.push(`rota_id = "${rotaId}"`)
      }
      return await pb.collection('entrega_comprovantes').getFullList<EntregaComprovanteRecord>({
        filter: filters.join(' && '),
        sort: 'confirmado_em,created',
        expand: 'escola_id,motorista_id,pedido_id',
      })
    } catch (err) {
      console.warn('Erro ao consultar entrega_comprovantes por ciclo:', err)
      return []
    }
  },

  /**
   * Busca o snapshot mais relevante de uma rota em um ciclo específico.
   * Ordem de precedência: 'fechamento' -> 'despacho' -> 'edicao' -> mais recente.
   */
  async getSnapshotByRotaECiclo(
    rotaId: string,
    cicloId: string,
  ): Promise<RotaSnapshotRecord | null> {
    if (!rotaId || !cicloId) return null
    try {
      const list = await pb.collection('rota_snapshots').getFullList<RotaSnapshotRecord>({
        filter: `rota_id = "${rotaId}" && ciclo_id = "${cicloId}"`,
        sort: '-snapshot_em,-created',
      })
      if (list.length === 0) return null

      // Procura primeiro fechamento, depois despacho, depois edicao/mais recente
      const snapFechamento = list.find((s) => s.versao_evento === 'fechamento')
      if (snapFechamento) return snapFechamento

      const snapDespacho = list.find((s) => s.versao_evento === 'despacho')
      if (snapDespacho) return snapDespacho

      return list[0]
    } catch (err) {
      console.warn('Aviso ao consultar snapshot de rota por ciclo:', err)
      return null
    }
  },

  /**
   * Busca todos os snapshots de rotas de um ciclo específico.
   * Agrupa e retorna um Map de rotaId -> RotaSnapshotRecord com a versão mais qualificada.
   */
  async getSnapshotsByCiclo(cicloId: string): Promise<Map<string, RotaSnapshotRecord>> {
    const map = new Map<string, RotaSnapshotRecord>()
    if (!cicloId) return map
    try {
      const list = await pb.collection('rota_snapshots').getFullList<RotaSnapshotRecord>({
        filter: `ciclo_id = "${cicloId}"`,
        sort: '-snapshot_em,-created',
      })

      // Ordenar por prioridade de versão de evento para garantir a mais fidedigna
      const getPriority = (versao?: string) => {
        if (versao === 'fechamento') return 3
        if (versao === 'despacho') return 2
        if (versao === 'edicao') return 1
        return 0
      }

      for (const snap of list) {
        if (!snap.rota_id) continue
        const atual = map.get(snap.rota_id)
        if (!atual || getPriority(snap.versao_evento) > getPriority(atual.versao_evento)) {
          map.set(snap.rota_id, snap)
        }
      }
    } catch (err) {
      console.warn('Aviso ao consultar snapshots do ciclo:', err)
    }
    return map
  },

  /**
   * Salva a composição e ordem das paradas de uma rota estritamente para um ciclo_id (versaoEvento 'edicao').
   * Idempotente e não-bloqueante: atualiza snapshot existente daquele ciclo ou cria um novo com versao_evento 'edicao'.
   */
  async salvarComposicaoCiclo(input: {
    rotaId: string
    cicloId: string
    chamadaId?: string
    paradas: ParadaSnapshotItem[]
    rotaNome?: string
    observacao?: string
  }): Promise<RotaSnapshotRecord | null> {
    if (!input.rotaId || !input.cicloId) return null
    try {
      const nowIso = new Date().toISOString()
      const paradasJson = JSON.stringify(input.paradas)
      const totalParadas = input.paradas.length

      // Verificar se já existe um snapshot para este par (rota_id, ciclo_id)
      const snapExistentes = await pb
        .collection('rota_snapshots')
        .getList<RotaSnapshotRecord>(1, 1, {
          filter: `rota_id = "${input.rotaId}" && ciclo_id = "${input.cicloId}" && (versao_evento = "edicao" || versao_evento = "manual")`,
          sort: '-snapshot_em,-created',
        })

      let rotaNome = input.rotaNome || ''
      if (!rotaNome) {
        try {
          const rRec = await pb.collection('rotas').getOne(input.rotaId)
          rotaNome = rRec.nome || 'Rota'
        } catch {
          rotaNome = 'Rota'
        }
      }

      const payload: Record<string, any> = {
        rota_id: input.rotaId,
        ciclo_id: input.cicloId,
        chamada_id: input.chamadaId || undefined,
        rota_nome: rotaNome,
        versao_evento: 'edicao',
        total_paradas: totalParadas,
        paradas_snapshot: paradasJson,
        snapshot_em: nowIso,
        observacao: input.observacao || 'Ordem de paradas personalizada para o ciclo',
      }

      if (snapExistentes.items.length > 0) {
        return await pb
          .collection('rota_snapshots')
          .update<RotaSnapshotRecord>(snapExistentes.items[0].id, payload)
      } else {
        return await pb.collection('rota_snapshots').create<RotaSnapshotRecord>(payload)
      }
    } catch (err) {
      console.warn('Aviso não-bloqueante ao salvar composição da rota por ciclo:', err)
      return null
    }
  },
}
