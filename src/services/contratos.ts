import pb from '@/lib/pocketbase/client'
import type { ContratoRecord, ContratoItemRecord, ContratoEscolaRecord } from '@/lib/types'

export const contratosService = {
  async getAll(): Promise<ContratoRecord[]> {
    return await pb.collection('contratos').getFullList<ContratoRecord>({
      sort: '-created',
      expand: 'chamada_id',
    })
  },

  async getById(id: string): Promise<ContratoRecord> {
    return await pb.collection('contratos').getOne<ContratoRecord>(id, {
      expand: 'chamada_id',
    })
  },

  async getItems(contratoId: string): Promise<ContratoItemRecord[]> {
    return await pb.collection('contrato_itens').getFullList<ContratoItemRecord>({
      filter: `contrato_id = "${contratoId}"`,
      expand: 'produto_id',
    })
  },

  async getAllItems(): Promise<ContratoItemRecord[]> {
    return await pb.collection('contrato_itens').getFullList<ContratoItemRecord>({
      expand: 'produto_id',
    })
  },

  async getEscolas(
    contratoId?: string,
    apenasAtivos: boolean = true,
  ): Promise<ContratoEscolaRecord[]> {
    const parts: string[] = []
    if (contratoId) {
      parts.push(`contrato_id = "${contratoId}"`)
    }
    if (apenasAtivos) {
      parts.push('(encerrado_em = "" || encerrado_em = null)')
    }
    const filter = parts.join(' && ')
    return await pb.collection('contrato_escolas').getFullList<ContratoEscolaRecord>({
      filter,
      expand: 'escola_id,rota_id,contrato_id',
    })
  },

  async create(data: {
    numero: string
    chamada_id: string
    numero_chamada?: string
    tipo?: string
    modalidade_pedido?: 'individualizado' | 'centralizado'
    tipo_importacao?: 'unica' | 'fracionada'
    abas_planilha?: string
    num_rotas_logisticas?: number
    valor_total: number
    status?: 'Ativo' | 'Encerrado' | 'Cancelado' | 'Pendente'
    encerrado_em?: string
    motivo_cancelamento?: string
  }): Promise<ContratoRecord> {
    return await pb.collection('contratos').create<ContratoRecord>(
      {
        ...data,
        status: data.status || 'Ativo',
      },
      {
        expand: 'chamada_id',
      },
    )
  },

  async update(id: string, data: Partial<ContratoRecord>): Promise<ContratoRecord> {
    return await pb.collection('contratos').update<ContratoRecord>(id, data, {
      expand: 'chamada_id',
    })
  },
  async delete(id: string): Promise<boolean> {
    // Delete associated contract items
    const items = await pb.collection('contrato_itens').getFullList<ContratoItemRecord>({
      filter: `contrato_id = "${id}"`,
    })
    for (const item of items) {
      await pb.collection('contrato_itens').delete(item.id)
    }

    // Delete associated contract schools
    const ceList = await pb.collection('contrato_escolas').getFullList<ContratoEscolaRecord>({
      filter: `contrato_id = "${id}"`,
    })
    for (const ce of ceList) {
      await pb.collection('contrato_escolas').delete(ce.id)
    }

    return await pb.collection('contratos').delete(id)
  },

  async syncItems(
    contratoId: string,
    items: Array<{
      id?: string
      produto_id: string
      preco: number
      quantidade_contratada?: number
      nome_contrato?: string
      apelidos?: string
    }>,
  ): Promise<void> {
    const existingItems = await pb.collection('contrato_itens').getFullList<ContratoItemRecord>({
      filter: `contrato_id = "${contratoId}"`,
    })

    const existingMap = new Map(existingItems.map((item) => [item.id, item]))
    const keptItemIds = new Set<string>()

    for (const item of items) {
      const qtd =
        item.quantidade_contratada !== undefined &&
        item.quantidade_contratada !== null &&
        !isNaN(item.quantidade_contratada) &&
        item.quantidade_contratada > 0
          ? item.quantidade_contratada
          : null

      const nomeContrato = item.nome_contrato !== undefined ? item.nome_contrato.trim() : undefined
      const apelidos = item.apelidos !== undefined ? item.apelidos.trim() : undefined

      if (item.id && existingMap.has(item.id)) {
        keptItemIds.add(item.id)
        const current = existingMap.get(item.id)!
        const currentQtd =
          current.quantidade_contratada !== undefined &&
          current.quantidade_contratada !== null &&
          !isNaN(current.quantidade_contratada) &&
          current.quantidade_contratada > 0
            ? current.quantidade_contratada
            : null

        const currentNomeContrato = (current.nome_contrato || '').trim()
        const currentApelidos = (current.apelidos || '').trim()
        const newNomeContrato = nomeContrato !== undefined ? nomeContrato : currentNomeContrato
        const newApelidos = apelidos !== undefined ? apelidos : currentApelidos

        if (
          current.produto_id !== item.produto_id ||
          Math.abs(Number(current.preco) - Number(item.preco)) > 0.0001 ||
          currentQtd !== qtd ||
          currentNomeContrato !== newNomeContrato ||
          currentApelidos !== newApelidos
        ) {
          await pb.collection('contrato_itens').update(item.id, {
            produto_id: item.produto_id,
            preco: item.preco,
            quantidade_contratada: qtd,
            nome_contrato: newNomeContrato,
            apelidos: newApelidos,
          })
        }
      } else {
        const created = await pb.collection('contrato_itens').create<ContratoItemRecord>({
          contrato_id: contratoId,
          produto_id: item.produto_id,
          preco: item.preco,
          quantidade_contratada: qtd,
          nome_contrato: nomeContrato || '',
          apelidos: apelidos || '',
        })
        keptItemIds.add(created.id)
      }
    }

    for (const item of existingItems) {
      if (!keptItemIds.has(item.id)) {
        await pb.collection('contrato_itens').delete(item.id)
      }
    }
  },

  async linkEscola(data: {
    contrato_id: string
    escola_id: string
    rota_id?: string
    rota?: string
    rota_logistica_id?: string
    coleta_por?: 'padrao' | 'formulario' | 'planilha' | string
  }): Promise<ContratoEscolaRecord> {
    const effectiveRotaId = data.rota_id || data.rota_logistica_id || ''
    // Check if link already exists
    const existing = await pb.collection('contrato_escolas').getFullList<ContratoEscolaRecord>({
      filter: `contrato_id = "${data.contrato_id}" && escola_id = "${data.escola_id}"`,
      sort: '-created',
    })
    if (existing.length > 0) {
      const target = existing[0]
      const updates: Record<string, any> = {}
      if (target.encerrado_em) {
        // Reativação de vínculo histórico: limpa explicitamente encerrado_em
        updates.encerrado_em = null
      }
      if (effectiveRotaId && target.rota_id !== effectiveRotaId) {
        updates.rota_id = effectiveRotaId
      }
      if (data.coleta_por && target.coleta_por !== data.coleta_por) {
        updates.coleta_por = data.coleta_por
      }
      if (Object.keys(updates).length > 0) {
        return await pb.collection('contrato_escolas').update(target.id, updates)
      }
      return target
    }
    return await pb.collection('contrato_escolas').create<ContratoEscolaRecord>({
      contrato_id: data.contrato_id,
      escola_id: data.escola_id,
      coleta_por: data.coleta_por || 'padrao',
      ...(effectiveRotaId ? { rota_id: effectiveRotaId } : {}),
    })
  },

  async unlinkEscola(contratoEscolaId: string): Promise<boolean> {
    await pb.collection('contrato_escolas').update(contratoEscolaId, {
      encerrado_em: new Date().toISOString(),
    })
    return true
  },

  async encerrarContrato(contratoId: string): Promise<ContratoRecord> {
    const agora = new Date().toISOString()
    // Atualizar todos os vínculos de contrato_escolas para registrar encerrado_em
    const ceList = await pb.collection('contrato_escolas').getFullList<ContratoEscolaRecord>({
      filter: `contrato_id = "${contratoId}"`,
    })
    for (const ce of ceList) {
      try {
        await pb.collection('contrato_escolas').update(ce.id, {
          encerrado_em: agora,
        })
      } catch (err) {
        console.error(`Erro ao atualizar encerrado_em do vínculo ${ce.id}:`, err)
      }
    }
    return await pb.collection('contratos').update<ContratoRecord>(contratoId, {
      status: 'Encerrado',
      encerrado_em: agora,
    })
  },

  async cancelarContrato(contratoId: string, motivo: string): Promise<ContratoRecord> {
    if (!motivo || !motivo.trim()) {
      throw new Error('Motivo do cancelamento é obrigatório.')
    }
    const agora = new Date().toISOString()
    const ceList = await pb.collection('contrato_escolas').getFullList<ContratoEscolaRecord>({
      filter: `contrato_id = "${contratoId}"`,
    })
    for (const ce of ceList) {
      try {
        await pb.collection('contrato_escolas').update(ce.id, {
          encerrado_em: agora,
        })
      } catch (err) {
        console.error(`Erro ao atualizar encerrado_em do vínculo ${ce.id}:`, err)
      }
    }
    return await pb.collection('contratos').update<ContratoRecord>(contratoId, {
      status: 'Cancelado',
      encerrado_em: agora,
      motivo_cancelamento: motivo.trim(),
    })
  },

  async updateEscolaRota(
    contratoEscolaId: string,
    data: { rotaId?: string; rotaPlanilha?: string },
  ): Promise<ContratoEscolaRecord> {
    const payload: Record<string, any> = {}
    if (data.rotaId !== undefined) payload.rota_id = data.rotaId
    return await pb
      .collection('contrato_escolas')
      .update<ContratoEscolaRecord>(contratoEscolaId, payload)
  },

  async updateEscolaRotaLogistica(
    contratoEscolaId: string,
    rotaId: string,
  ): Promise<ContratoEscolaRecord> {
    return await pb.collection('contrato_escolas').update<ContratoEscolaRecord>(contratoEscolaId, {
      rota_id: rotaId || null,
    })
  },

  async updateEscolaRotaByContratoEscola(
    contratoId: string,
    escolaId: string,
    rotaId: string,
    _rotaPlanilha?: string,
  ): Promise<ContratoEscolaRecord | null> {
    const existing = await pb.collection('contrato_escolas').getFullList<ContratoEscolaRecord>({
      filter: `contrato_id = "${contratoId}" && escola_id = "${escolaId}"`,
    })
    const payload: Record<string, any> = { rota_id: rotaId }

    if (existing.length > 0) {
      return await pb
        .collection('contrato_escolas')
        .update<ContratoEscolaRecord>(existing[0].id, payload)
    }

    // Se não achar vínculo do par (contratoId, escolaId), buscar outros contratos da mesma chamada_id
    // e procurar vínculo ativo da mesma escola com QUALQUER um deles para evitar duplicidade de vínculo na chamada
    try {
      const contratoAlvo = await pb.collection('contratos').getOne<ContratoRecord>(contratoId)
      if (contratoAlvo.chamada_id) {
        const contratosMesmaChamada = await pb.collection('contratos').getFullList<ContratoRecord>({
          filter: `chamada_id = "${contratoAlvo.chamada_id}"`,
        })
        const contratosIds = contratosMesmaChamada.map((c) => c.id)
        if (contratosIds.length > 0) {
          const filterContratos = contratosIds.map((id) => `contrato_id = "${id}"`).join(' || ')
          const vinculosMesmaChamada = await pb
            .collection('contrato_escolas')
            .getFullList<ContratoEscolaRecord>({
              filter: `escola_id = "${escolaId}" && (${filterContratos}) && (encerrado_em = "" || encerrado_em = null)`,
              sort: 'created',
            })
          if (vinculosMesmaChamada.length > 0) {
            return await pb
              .collection('contrato_escolas')
              .update<ContratoEscolaRecord>(vinculosMesmaChamada[0].id, payload)
          }
        }
      }
    } catch (err) {
      console.error('Erro ao verificar vínculos existentes da escola na chamada:', err)
    }

    return await pb.collection('contrato_escolas').create<ContratoEscolaRecord>({
      contrato_id: contratoId,
      escola_id: escolaId,
      ...payload,
    })
  },

  async updateEscolaRotaLogisticaByContratoEscola(
    contratoId: string,
    escolaId: string,
    rotaId: string,
  ): Promise<ContratoEscolaRecord | null> {
    return await this.updateEscolaRotaByContratoEscola(contratoId, escolaId, rotaId)
  },

  /**
   * Sincronização automática do espelho de preço em contrato_itens a partir
   * da fonte soberana chamada_itens (v0.0.255).
   *
   * Regras:
   * 1. Busca chamada_itens da chamada (filter chamada_id = "...").
   *    Monta mapa de preço por produto_id e, como fallback, por nome normalizado (trim + lowercase).
   * 2. Busca contratos com chamada_id igual.
   * 3. Para cada contrato, lista contrato_itens:
   *    - Resolve novo preço: 1º produto_id, 2º nome normalizado (nome_contrato ou expand.produto_id.nome).
   *    - Se o preço mudou (|novo - atual| > 0.0001), atualiza SOMENTE o campo `preco`.
   *      NUNCA altera `quantidade_contratada`, `nome_contrato` ou `apelidos`.
   *    - Item da chamada que não existe no contrato: NÃO cria.
   *    - Item do contrato que não está na chamada: NÃO apaga, permanece como está.
   * 4. Se algum preço mudou e o contrato possui itens com quantidade contratada > 0,
   *    recalcula e persiste `contratos.valor_total` = soma(preço final * quantidade contratada).
   */
  async sincronizarEspelhoChamadaContratos(chamadaId: string): Promise<{
    contratosAtualizados: number
    itensAtualizados: number
  }> {
    if (!chamadaId) {
      return { contratosAtualizados: 0, itensAtualizados: 0 }
    }

    // 1. Buscar chamada_itens da chamada
    const chamadaItens = await pb.collection('chamada_itens').getFullList<any>({
      filter: `chamada_id = "${chamadaId}"`,
      expand: 'produto_id',
    })

    if (chamadaItens.length === 0) {
      return { contratosAtualizados: 0, itensAtualizados: 0 }
    }

    const precoPorProdutoId = new Map<string, number>()
    const precoPorNomeNorm = new Map<string, number>()

    for (const ci of chamadaItens) {
      const preco = Number(ci.preco) || 0
      if (ci.produto_id) {
        precoPorProdutoId.set(ci.produto_id, preco)
      }
      const rawNome = (ci.produto || ci.expand?.produto_id?.nome || '').trim().toLowerCase()
      if (rawNome && !precoPorNomeNorm.has(rawNome)) {
        precoPorNomeNorm.set(rawNome, preco)
      }
    }

    // 2. Buscar todos os contratos vinculados a esta chamada
    const contratos = await pb.collection('contratos').getFullList<ContratoRecord>({
      filter: `chamada_id = "${chamadaId}"`,
    })

    let totalContratosAtualizados = 0
    let totalItensAtualizados = 0

    // 3. Processar cada contrato
    for (const contrato of contratos) {
      const contratoItens = await pb.collection('contrato_itens').getFullList<ContratoItemRecord>({
        filter: `contrato_id = "${contrato.id}"`,
        expand: 'produto_id',
      })

      let contratoTeveMudancaPreco = false

      // Guardar lista atualizada para recálculo do valor_total se necessário
      const itensComPrecoFinal: Array<{ preco: number; qtd?: number | null }> = []

      for (const item of contratoItens) {
        let novoPreco: number | undefined

        // 1º Casamento por produto_id
        if (item.produto_id && precoPorProdutoId.has(item.produto_id)) {
          novoPreco = precoPorProdutoId.get(item.produto_id)
        }

        // 2º Fallback por nome normalizado
        if (novoPreco === undefined) {
          const nomeCandidato = (item.nome_contrato || item.expand?.produto_id?.nome || '')
            .trim()
            .toLowerCase()
          if (nomeCandidato && precoPorNomeNorm.has(nomeCandidato)) {
            novoPreco = precoPorNomeNorm.get(nomeCandidato)
          }
        }

        const precoAtual = Number(item.preco) || 0
        const precoEfetivo = novoPreco !== undefined ? novoPreco : precoAtual

        itensComPrecoFinal.push({
          preco: precoEfetivo,
          qtd: item.quantidade_contratada,
        })

        if (novoPreco !== undefined && Math.abs(novoPreco - precoAtual) > 0.0001) {
          // Atualiza SOMENTE o campo preco em contrato_itens
          await pb.collection('contrato_itens').update(item.id, {
            preco: novoPreco,
          })
          contratoTeveMudancaPreco = true
          totalItensAtualizados++
        }
      }

      // 4. Se algum preço mudou e o contrato tem itens com quantidade contratada > 0,
      // recalcula e persiste contratos.valor_total
      if (contratoTeveMudancaPreco) {
        totalContratosAtualizados++

        const itensComQtd = itensComPrecoFinal.filter(
          (i) =>
            i.qtd !== undefined && i.qtd !== null && !isNaN(Number(i.qtd)) && Number(i.qtd) > 0,
        )

        if (itensComQtd.length > 0) {
          const novoValorTotal = itensComPrecoFinal.reduce((acc, it) => {
            const q =
              it.qtd !== undefined &&
              it.qtd !== null &&
              !isNaN(Number(it.qtd)) &&
              Number(it.qtd) > 0
                ? Number(it.qtd)
                : 0
            return acc + it.preco * q
          }, 0)

          await pb.collection('contratos').update(contrato.id, {
            valor_total: novoValorTotal,
          })
        }
      }
    }

    return {
      contratosAtualizados: totalContratosAtualizados,
      itensAtualizados: totalItensAtualizados,
    }
  },
}
