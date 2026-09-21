import pb from '@/lib/pocketbase/client'
import type { CicloRecord } from '@/lib/types'

export const ciclosService = {
  async getAll(): Promise<CicloRecord[]> {
    return await pb.collection('ciclos').getFullList<CicloRecord>({
      sort: '-created',
    })
  },

  async getActive(): Promise<CicloRecord | null> {
    const records = await pb.collection('ciclos').getFullList<CicloRecord>({
      filter: 'status != "fechado"',
      sort: '-created',
    })
    return records[0] || null
  },

  async getById(id: string): Promise<CicloRecord> {
    return await pb.collection('ciclos').getOne<CicloRecord>(id)
  },

  async create(data: {
    nome: string
    data_inicio: string
    data_fim: string
    status: 'coletando' | 'correcao' | 'fechado'
    snapshot?: any
  }): Promise<CicloRecord> {
    return await pb.collection('ciclos').create<CicloRecord>(data)
  },

  async update(id: string, data: Partial<CicloRecord>): Promise<CicloRecord> {
    return await pb.collection('ciclos').update<CicloRecord>(id, data)
  },

  async setStatus(id: string, status: 'coletando' | 'correcao' | 'fechado'): Promise<CicloRecord> {
    return await pb.collection('ciclos').update<CicloRecord>(id, { status })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('ciclos').delete(id)
  },
}
