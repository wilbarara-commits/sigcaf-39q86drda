import pb from '@/lib/pocketbase/client'
import type {
  ChamadaRecord,
  ChamadaStatus,
  ChamadaModalidade,
  ContratoRecord,
  ChamadaItemRecord,
} from '@/lib/types'

export interface CreateChamadaData {
  chamada: string
  programa?: string
  modalidade?: ChamadaModalidade
  status?: ChamadaStatus
}

export interface UpdateChamadaData {
  chamada?: string
  programa?: string
  modalidade?: ChamadaModalidade
  status?: ChamadaStatus
}

export const chamadasService = {
  async getAll(): Promise<ChamadaRecord[]> {
    return await pb.collection('chamadas').getFullList<ChamadaRecord>({
      sort: '-created',
    })
  },

  async getById(id: string): Promise<ChamadaRecord> {
    return await pb.collection('chamadas').getOne<ChamadaRecord>(id)
  },

  async getContratos(chamadaId: string): Promise<ContratoRecord[]> {
    return await pb.collection('contratos').getFullList<ContratoRecord>({
      filter: `chamada_id = "${chamadaId}"`,
      sort: '-created',
      expand: 'chamada_id',
    })
  },

  async create(data: CreateChamadaData): Promise<ChamadaRecord> {
    return await pb.collection('chamadas').create<ChamadaRecord>({
      chamada: data.chamada.trim(),
      programa: data.programa?.trim() || '',
      modalidade: data.modalidade || 'individualizado',
      status: data.status || 'Ativo',
    })
  },

  async update(id: string, data: UpdateChamadaData): Promise<ChamadaRecord> {
    const payload: Record<string, any> = {}
    if (data.chamada !== undefined) payload.chamada = data.chamada.trim()
    if (data.programa !== undefined) payload.programa = data.programa.trim()
    if (data.modalidade !== undefined) payload.modalidade = data.modalidade
    if (data.status !== undefined) payload.status = data.status

    return await pb.collection('chamadas').update<ChamadaRecord>(id, payload)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('chamadas').delete(id)
  },

  async getAllItems(): Promise<ChamadaItemRecord[]> {
    return await pb.collection('chamada_itens').getFullList<ChamadaItemRecord>({
      sort: 'produto',
      expand: 'produto_id',
    })
  },

  async getItems(chamadaId: string): Promise<ChamadaItemRecord[]> {
    return await pb.collection('chamada_itens').getFullList<ChamadaItemRecord>({
      filter: `chamada_id = "${chamadaId}"`,
      sort: 'produto',
      expand: 'produto_id',
    })
  },

  async addItem(data: {
    chamada_id: string
    produto_id?: string
    produto: string
    aka?: string
    unidade: string
    preco: number
  }): Promise<ChamadaItemRecord> {
    return await pb.collection('chamada_itens').create<ChamadaItemRecord>(data)
  },

  async updateItem(
    id: string,
    data: Partial<{
      produto_id?: string
      produto: string
      aka?: string
      unidade: string
      preco: number
    }>,
  ): Promise<ChamadaItemRecord> {
    return await pb.collection('chamada_itens').update<ChamadaItemRecord>(id, data)
  },

  async deleteItem(id: string): Promise<boolean> {
    return await pb.collection('chamada_itens').delete(id)
  },

  async syncItems(
    chamadaId: string,
    items: Array<{
      id?: string
      produto_id?: string
      produto: string
      aka?: string
      unidade: string
      preco: number
    }>,
  ): Promise<ChamadaItemRecord[]> {
    const existingItems = await this.getItems(chamadaId)
    const existingIds = new Set(existingItems.map((i) => i.id))
    const incomingIds = new Set(items.map((i) => i.id).filter(Boolean) as string[])

    for (const exId of existingIds) {
      if (!incomingIds.has(exId)) {
        await pb.collection('chamada_itens').delete(exId)
      }
    }

    const results: ChamadaItemRecord[] = []
    for (const item of items) {
      const payload = {
        chamada_id: chamadaId,
        produto_id: item.produto_id || undefined,
        produto: item.produto,
        aka: item.aka || '',
        unidade: item.unidade || 'Kg',
        preco: Number(item.preco) || 0,
      }

      if (item.id && existingIds.has(item.id)) {
        const updated = await pb
          .collection('chamada_itens')
          .update<ChamadaItemRecord>(item.id, payload)
        results.push(updated)
      } else {
        const created = await pb.collection('chamada_itens').create<ChamadaItemRecord>(payload)
        results.push(created)
      }
    }

    return results
  },
}
