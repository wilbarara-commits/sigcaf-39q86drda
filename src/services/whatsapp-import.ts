import pb from '@/lib/pocketbase/client'
import type { EnvioWhatsappRecord, ImportacaoRecord } from '@/lib/types'

export const whatsappService = {
  async getByCiclo(cicloId: string): Promise<EnvioWhatsappRecord[]> {
    return await pb.collection('envios_whatsapp').getFullList<EnvioWhatsappRecord>({
      filter: `ciclo_id = "${cicloId}"`,
      expand: 'escola_id',
    })
  },

  async logEnvio(data: {
    ciclo_id: string
    escola_id: string
    status: 'pendente' | 'enviado' | 'falha'
  }): Promise<EnvioWhatsappRecord> {
    const existing = await pb.collection('envios_whatsapp').getFullList<EnvioWhatsappRecord>({
      filter: `ciclo_id = "${data.ciclo_id}" && escola_id = "${data.escola_id}"`,
    })
    const now = new Date().toISOString()
    if (existing.length > 0) {
      return await pb.collection('envios_whatsapp').update<EnvioWhatsappRecord>(existing[0].id, {
        status: data.status,
        enviado_em: now,
      })
    }
    return await pb.collection('envios_whatsapp').create<EnvioWhatsappRecord>({
      ciclo_id: data.ciclo_id,
      escola_id: data.escola_id,
      status: data.status,
      enviado_em: now,
    })
  },
}

export const importacoesService = {
  async getAll(): Promise<ImportacaoRecord[]> {
    return await pb.collection('importacoes').getFullList<ImportacaoRecord>({
      expand: 'ciclo_id,contrato_id,usuario_id',
      sort: '-created',
    })
  },

  async getByContrato(contratoId: string): Promise<ImportacaoRecord[]> {
    return await pb.collection('importacoes').getFullList<ImportacaoRecord>({
      filter: `contrato_id = "${contratoId}"`,
      expand: 'ciclo_id,contrato_id,usuario_id',
      sort: '-created',
    })
  },

  async create(data: {
    ciclo_id: string
    contrato_id: string
    arquivo: string
    data: string
    usuario_id?: string
    linhas_total: number
    linhas_ok: number
    linhas_erro: number
    erros?: any
  }): Promise<ImportacaoRecord> {
    return await pb.collection('importacoes').create<ImportacaoRecord>(data)
  },
}
