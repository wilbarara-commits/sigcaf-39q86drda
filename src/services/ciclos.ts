import pb from '@/lib/pocketbase/client'
import type { CicloRecord } from '@/lib/types'

export const ciclosService = {
  async getAll(): Promise<CicloRecord[]> {
    return await pb.collection('ciclos').getFullList<CicloRecord>({
      sort: '-created',
      expand: 'chamada_id',
    })
  },

  async getActive(): Promise<CicloRecord | null> {
    const records = await pb.collection('ciclos').getFullList<CicloRecord>({
      filter: 'status != "fechado"',
      sort: '-created',
      expand: 'chamada_id',
    })
    return records[0] || null
  },

  async getById(id: string): Promise<CicloRecord> {
    return await pb.collection('ciclos').getOne<CicloRecord>(id)
  },

  async create(data: {
    nome: string
    chamada_id?: string
    data_inicio: string
    data_fim: string
    data_despacho?: string
    status: string
    snapshot?: any
    motivo_cancelamento?: string
    data_cancelamento?: string
  }): Promise<CicloRecord> {
    return await pb.collection('ciclos').create<CicloRecord>(data)
  },

  async update(id: string, data: Partial<CicloRecord>): Promise<CicloRecord> {
    return await pb.collection('ciclos').update<CicloRecord>(id, data)
  },

  async setStatus(id: string, status: string): Promise<CicloRecord> {
    return await pb.collection('ciclos').update<CicloRecord>(id, { status })
  },

  async cancelar(id: string, motivo: string): Promise<CicloRecord> {
    return await pb.collection('ciclos').update<CicloRecord>(id, {
      status: 'cancelado',
      motivo_cancelamento: motivo,
      data_cancelamento: new Date().toISOString(),
    })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('ciclos').delete(id)
  },
}
