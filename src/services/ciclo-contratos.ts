import pb from '@/lib/pocketbase/client'
import type { CicloContratoRecord } from '@/lib/types'

export const cicloContratosService = {
  async getAll(): Promise<CicloContratoRecord[]> {
    return await pb.collection('ciclo_contratos').getFullList<CicloContratoRecord>({
      sort: '-created',
      expand: 'contrato_id,ciclo_id',
    })
  },

  async getByCiclo(cicloId: string): Promise<CicloContratoRecord[]> {
    return await pb.collection('ciclo_contratos').getFullList<CicloContratoRecord>({
      filter: `ciclo_id = "${cicloId}"`,
      expand: 'contrato_id',
    })
  },

  async getByCicloAndContrato(
    cicloId: string,
    contratoId: string,
  ): Promise<CicloContratoRecord | null> {
    const list = await pb.collection('ciclo_contratos').getFullList<CicloContratoRecord>({
      filter: `ciclo_id = "${cicloId}" && contrato_id = "${contratoId}"`,
      limit: 1,
    })
    return list[0] || null
  },

  async create(data: {
    ciclo_id: string
    contrato_id: string
    fase: string
    motivo_cancelamento?: string
    data_cancelamento?: string
  }): Promise<CicloContratoRecord> {
    return await pb.collection('ciclo_contratos').create<CicloContratoRecord>(data)
  },

  async update(id: string, data: Partial<CicloContratoRecord>): Promise<CicloContratoRecord> {
    return await pb.collection('ciclo_contratos').update<CicloContratoRecord>(id, data)
  },

  async setFase(id: string, fase: string): Promise<CicloContratoRecord> {
    return await pb.collection('ciclo_contratos').update<CicloContratoRecord>(id, { fase })
  },

  async cancelar(id: string, motivo: string): Promise<CicloContratoRecord> {
    return await pb.collection('ciclo_contratos').update<CicloContratoRecord>(id, {
      fase: 'cancelado',
      motivo_cancelamento: motivo,
      data_cancelamento: new Date().toISOString(),
    })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('ciclo_contratos').delete(id)
  },
}
