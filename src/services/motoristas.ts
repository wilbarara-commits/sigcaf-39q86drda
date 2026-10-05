import pb from '@/lib/pocketbase/client'
import type { MotoristaRecord } from '@/lib/types'

export const motoristasService = {
  async getAll(): Promise<MotoristaRecord[]> {
    return await pb.collection('motoristas').getFullList<MotoristaRecord>({
      sort: 'nome',
    })
  },

  async getAtivos(): Promise<MotoristaRecord[]> {
    return await pb.collection('motoristas').getFullList<MotoristaRecord>({
      filter: 'ativo = true',
      sort: 'nome',
    })
  },

  async getById(id: string): Promise<MotoristaRecord | null> {
    try {
      return await pb.collection('motoristas').getOne<MotoristaRecord>(id)
    } catch {
      return null
    }
  },

  async create(data: {
    nome: string
    telefone?: string
    ativo?: boolean
    observacoes?: string
  }): Promise<MotoristaRecord> {
    const cleanNome = (data.nome || '').trim().replace(/\s+/g, ' ')
    return await pb.collection('motoristas').create<MotoristaRecord>({
      nome: cleanNome,
      telefone: data.telefone?.trim() || '',
      ativo: data.ativo ?? true,
      observacoes: data.observacoes?.trim() || '',
    })
  },

  async update(id: string, data: Partial<MotoristaRecord>): Promise<MotoristaRecord> {
    const payload: Partial<MotoristaRecord> = { ...data }
    if (payload.nome !== undefined) {
      payload.nome = (payload.nome || '').trim().replace(/\s+/g, ' ')
    }
    if (payload.telefone !== undefined) {
      payload.telefone = payload.telefone?.trim() || ''
    }
    if (payload.observacoes !== undefined) {
      payload.observacoes = payload.observacoes?.trim() || ''
    }
    return await pb.collection('motoristas').update<MotoristaRecord>(id, payload)
  },

  async toggleAtivo(id: string, currentAtivo: boolean): Promise<MotoristaRecord> {
    return await pb.collection('motoristas').update<MotoristaRecord>(id, {
      ativo: !currentAtivo,
    })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('motoristas').delete(id)
  },
}
