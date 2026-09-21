import pb from '@/lib/pocketbase/client'
import type { PedidoRecord, PedidoItemRecord, PedidoValidacao } from '@/lib/types'

export const pedidosService = {
  async getAll(): Promise<PedidoRecord[]> {
    return await pb.collection('pedidos').getFullList<PedidoRecord>({
      expand: 'escola_id,ciclo_id,rota_id,rota_logistica_id,entregue_por',
      sort: '-data_prevista',
    })
  },

  async getAllItems(): Promise<PedidoItemRecord[]> {
    return await pb.collection('pedido_itens').getFullList<PedidoItemRecord>({
      expand: 'produto_id',
    })
  },

  async getItemsByPedidoId(pedidoId: string): Promise<PedidoItemRecord[]> {
    return await pb.collection('pedido_itens').getFullList<PedidoItemRecord>({
      filter: `pedido_id = "${pedidoId}"`,
      expand: 'produto_id',
    })
  },

  async create(data: {
    numero: string
    escola_id: string
    ciclo_id?: string
    origem?: 'excel' | 'whatsapp' | 'manual'
    rota_id?: string
    rota_logistica_id?: string
    validacao?: PedidoValidacao
    data_prevista: string
    status: 'Pendente' | 'Em Rota' | 'Entregue' | 'Cancelado'
    itens: Array<{
      produto_id: string
      quantidade: number
      preco_unitario: number
    }>
  }): Promise<PedidoRecord> {
    const validItens = (data.itens || []).filter(
      (it) =>
        it.produto_id &&
        typeof it.quantidade === 'number' &&
        !isNaN(it.quantidade) &&
        it.quantidade > 0,
    )
    if (validItens.length === 0) {
      throw new Error(
        'Não é possível criar um pedido com zero itens ou itens com quantidade zero. Um pedido deve conter pelo menos 1 item válido com quantidade maior que zero.',
      )
    }

    // Tentar via endpoint backend atômico para garantir consistência e evitar rate limiting
    try {
      const res = await pb.send<{
        success: boolean
        totalCreated: number
        pedidos: Array<{ id: string; numero: string; escola_id: string }>
      }>('/backend/v1/pedidos/batch-create', {
        method: 'POST',
        body: {
          pedidos: [
            {
              numero: data.numero,
              escola_id: data.escola_id,
              ciclo_id: data.ciclo_id || '',
              origem: data.origem || 'manual',
              rota_id: data.rota_id || '',
              rota_logistica_id: data.rota_logistica_id || '',
              validacao: data.validacao || { status: 'validado', motivo: 'Lançamento manual' },
              data_prevista: data.data_prevista,
              status: data.status,
              itens: validItens,
            },
          ],
        },
      })
      if (res?.pedidos?.[0]?.id) {
        return await pb.collection('pedidos').getOne<PedidoRecord>(res.pedidos[0].id)
      }
    } catch (batchErr) {
      console.warn('Fallback para criação direta via SDK PocketBase:', batchErr)
    }

    const pedido = await pb.collection('pedidos').create<PedidoRecord>({
      numero: data.numero,
      escola_id: data.escola_id,
      ciclo_id: data.ciclo_id || '',
      origem: data.origem || 'manual',
      rota_id: data.rota_id || '',
      rota_logistica_id: data.rota_logistica_id || '',
      validacao: data.validacao || { status: 'validado', motivo: 'Lançamento manual' },
      data_prevista: data.data_prevista,
      status: data.status,
    })

    try {
      for (const item of validItens) {
        await pb.collection('pedido_itens').create({
          pedido_id: pedido.id,
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
        })
      }
    } catch (itensErr) {
      // Se falhar ao gravar itens, remover pedido para não deixar pedido órfão sem itens
      try {
        await pb.collection('pedidos').delete(pedido.id)
      } catch {
        /* intentionally ignored */
      }
      throw itensErr
    }

    return pedido
  },

  async createBatch(
    pedidosList: Array<{
      numero: string
      escola_id: string
      ciclo_id?: string
      origem?: 'excel' | 'whatsapp' | 'manual'
      rota_id?: string
      rota_logistica_id?: string
      validacao?: PedidoValidacao
      data_prevista: string
      status: 'Pendente' | 'Em Rota' | 'Entregue' | 'Cancelado'
      itens: Array<{
        produto_id: string
        quantidade: number
        preco_unitario: number
      }>
    }>,
  ): Promise<{
    success: boolean
    totalCreated: number
    pedidos: Array<{ id: string; numero: string; escola_id: string; itens_count: number }>
  }> {
    const cleanList = pedidosList
      .map((p) => ({
        ...p,
        itens: (p.itens || []).filter(
          (it) =>
            it.produto_id &&
            typeof it.quantidade === 'number' &&
            !isNaN(it.quantidade) &&
            it.quantidade > 0,
        ),
      }))
      .filter((p) => p.itens.length > 0)

    if (cleanList.length === 0) {
      return { success: true, totalCreated: 0, pedidos: [] }
    }

    // Chamar hook atômico no backend
    try {
      return await pb.send<{
        success: boolean
        totalCreated: number
        pedidos: Array<{ id: string; numero: string; escola_id: string; itens_count: number }>
      }>('/backend/v1/pedidos/batch-create', {
        method: 'POST',
        body: { pedidos: cleanList },
      })
    } catch (hookErr) {
      console.warn(
        'Falha no endpoint batch-create, executando em lotes controlados com fallback seguro:',
        hookErr,
      )
      const created: Array<{ id: string; numero: string; escola_id: string; itens_count: number }> =
        []

      for (const p of cleanList) {
        const ped = await pedidosService.create(p)
        created.push({
          id: ped.id,
          numero: ped.numero,
          escola_id: ped.escola_id,
          itens_count: p.itens.length,
        })
        // Pequena pausa defensiva caso precise rodar individualmente para não estourar rate limit
        await new Promise((resolve) => setTimeout(resolve, 80))
      }

      return {
        success: true,
        totalCreated: created.length,
        pedidos: created,
      }
    }
  },

  async updateStatus(
    id: string,
    status: PedidoRecord['status'],
    options?: {
      entregue_em?: string
      entregue_por?: string
      cancelamento_motivo?: string
      motivo_cancelamento?: string
      cancelado_em?: string
      rota_logistica_id?: string
    },
  ): Promise<PedidoRecord> {
    const payload: Partial<PedidoRecord> = { status }
    if (options?.entregue_em !== undefined) {
      payload.entregue_em = options.entregue_em
    }
    if (options?.entregue_por !== undefined) {
      payload.entregue_por = options.entregue_por
    }
    if (options?.cancelamento_motivo !== undefined) {
      payload.cancelamento_motivo = options.cancelamento_motivo
      payload.motivo_cancelamento = options.cancelamento_motivo
    }
    if (options?.motivo_cancelamento !== undefined) {
      payload.motivo_cancelamento = options.motivo_cancelamento
      payload.cancelamento_motivo = options.motivo_cancelamento
    }
    if (options?.cancelado_em !== undefined) {
      payload.cancelado_em = options.cancelado_em
    }
    if (options?.rota_logistica_id !== undefined) {
      payload.rota_logistica_id = options.rota_logistica_id
    }
    return await pb.collection('pedidos').update<PedidoRecord>(id, payload)
  },

  async atribuirRotaLogistica(pedidoId: string, rotaLogisticaId: string): Promise<PedidoRecord> {
    return await pb.collection('pedidos').update<PedidoRecord>(pedidoId, {
      rota_logistica_id: rotaLogisticaId,
    })
  },

  async updateValidacao(id: string, validacao: PedidoValidacao): Promise<PedidoRecord> {
    return await pb.collection('pedidos').update<PedidoRecord>(id, { validacao })
  },

  async delete(id: string): Promise<boolean> {
    const items = await pb.collection('pedido_itens').getFullList<PedidoItemRecord>({
      filter: `pedido_id = "${id}"`,
    })
    for (const item of items) {
      await pb.collection('pedido_itens').delete(item.id)
    }
    return await pb.collection('pedidos').delete(id)
  },
}
