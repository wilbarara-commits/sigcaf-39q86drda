import pb from '@/lib/pocketbase/client'
import type { RotaRecord } from '@/lib/types'

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

  async create(data: { contrato_id: string; nome: string; ordem?: number }): Promise<RotaRecord> {
    return await pb.collection('rotas').create<RotaRecord>(data)
  },

  async update(id: string, data: Partial<RotaRecord>): Promise<RotaRecord> {
    return await pb.collection('rotas').update<RotaRecord>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('rotas').delete(id)
  },

  async findOrCreate(contratoId: string, nome: string): Promise<RotaRecord> {
    const trimmed = nome.trim()
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
    })
  },
}
