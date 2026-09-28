import pb from '@/lib/pocketbase/client'
import type { ChamadaRecord, ChamadaStatus, ChamadaModalidade, ContratoRecord } from '@/lib/types'

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
}
