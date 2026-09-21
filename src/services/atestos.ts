import pb from '@/lib/pocketbase/client'
import type { AtestoRecord } from '@/lib/types'

export const atestosService = {
  async getAll(): Promise<AtestoRecord[]> {
    return await pb.collection('atestos').getFullList<AtestoRecord>({
      expand: 'pedido_id,pedido_id.escola_id',
      sort: '-data_emissao',
    })
  },

  async create(data: {
    numero: string
    pedido_id: string
    data_emissao?: string
    status: 'Pendente Assinatura' | 'Confirmado' | 'Arquivado'
    arquivo?: File | Blob
  }): Promise<AtestoRecord> {
    const dataEmissao =
      data.data_emissao || new Date().toISOString().replace('T', ' ').substring(0, 19)

    if (data.arquivo) {
      const formData = new FormData()
      formData.append('numero', data.numero)
      formData.append('pedido_id', data.pedido_id)
      formData.append('data_emissao', dataEmissao)
      formData.append('status', data.status)

      // Garantir nome de arquivo seguro e com extensão .pdf
      const safeFilename = `Termo_Recebimento_${data.numero.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      let fileToUpload: File | Blob = data.arquivo
      if (typeof File !== 'undefined' && !(data.arquivo instanceof File)) {
        fileToUpload = new File([data.arquivo], safeFilename, { type: 'application/pdf' })
      }
      formData.append('arquivo', fileToUpload, safeFilename)

      return await pb.collection('atestos').create<AtestoRecord>(formData)
    }

    return await pb.collection('atestos').create<AtestoRecord>({
      numero: data.numero,
      pedido_id: data.pedido_id,
      data_emissao: dataEmissao,
      status: data.status,
    })
  },

  async updatePdf(id: string, pdfBlob: Blob, filename?: string): Promise<AtestoRecord> {
    const formData = new FormData()
    const safeFilename = (filename || `Termo_Recebimento_${id}.pdf`).endsWith('.pdf')
      ? filename || `Termo_Recebimento_${id}.pdf`
      : `${filename || `Termo_Recebimento_${id}`}.pdf`

    let fileToUpload: File | Blob = pdfBlob
    if (typeof File !== 'undefined' && !(pdfBlob instanceof File)) {
      fileToUpload = new File([pdfBlob], safeFilename, { type: 'application/pdf' })
    }

    formData.append('arquivo', fileToUpload, safeFilename)
    return await pb.collection('atestos').update<AtestoRecord>(id, formData)
  },

  getFileUrl(
    record: { id: string; collectionId?: string; collectionName?: string; arquivo?: string },
    filename?: string,
  ): string {
    const fn = filename || record.arquivo
    if (!fn) return ''
    const recordPayload = {
      id: record.id,
      collectionId: record.collectionId || 'pbc_3783575615',
      collectionName: record.collectionName || 'atestos',
    }
    return pb.files.getURL(recordPayload as any, fn)
  },

  async getById(id: string): Promise<AtestoRecord> {
    return await pb.collection('atestos').getOne<AtestoRecord>(id, {
      expand: 'pedido_id,pedido_id.escola_id',
    })
  },

  async updateStatus(id: string, status: AtestoRecord['status']): Promise<AtestoRecord> {
    return await pb.collection('atestos').update<AtestoRecord>(id, { status })
  },

  async confirm(id: string): Promise<AtestoRecord> {
    return await pb.collection('atestos').update<AtestoRecord>(id, { status: 'Confirmado' })
  },
}
