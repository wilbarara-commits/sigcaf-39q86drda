import pb from '@/lib/pocketbase/client'
import type { FornecedorRecord, FornecedorVinculo, FornecedorSexo } from '@/lib/types'

function normalizeFornecedorRecord(record: any): FornecedorRecord {
  let fotoUrl = ''
  if (record.foto) {
    fotoUrl = pb.files.getURL(record, record.foto)
  }

  const rawVinculo = String(record.vinculo || 'COOPERADO').toUpperCase()
  const vinculo: FornecedorVinculo = rawVinculo === 'EXTERNO' ? 'EXTERNO' : 'COOPERADO'

  return {
    id: record.id,
    nome: record.nome || '',
    sexo: record.sexo || undefined,
    data_nascimento: record.data_nascimento || undefined,
    foto: record.foto || '',
    fotoUrl,
    vinculo,
    identidade: record.identidade || '',
    data_validade_caf: record.data_validade_caf || undefined,
    endereco: record.endereco || '',
    bairro: record.bairro || '',
    cep: record.cep || '',
    latitude:
      typeof record.latitude === 'number'
        ? record.latitude
        : record.latitude
          ? Number(record.latitude)
          : undefined,
    longitude:
      typeof record.longitude === 'number'
        ? record.longitude
        : record.longitude
          ? Number(record.longitude)
          : undefined,
    whatsapp: record.whatsapp || '',
    created: record.created,
    updated: record.updated,
  }
}

export interface FornecedorFormData {
  nome: string
  sexo?: FornecedorSexo | string
  data_nascimento?: string
  fotoFile?: File | null
  removerFoto?: boolean
  vinculo: FornecedorVinculo
  identidade?: string
  data_validade_caf?: string
  endereco?: string
  bairro?: string
  cep?: string
  latitude?: number | null
  longitude?: number | null
  whatsapp?: string
}

export const fornecedoresService = {
  async getAll(): Promise<FornecedorRecord[]> {
    const records = await pb.collection('fornecedores').getFullList({
      sort: 'nome',
    })
    return records.map(normalizeFornecedorRecord)
  },

  async getById(id: string): Promise<FornecedorRecord> {
    const record = await pb.collection('fornecedores').getOne(id)
    return normalizeFornecedorRecord(record)
  },

  async create(data: FornecedorFormData): Promise<FornecedorRecord> {
    const formData = new FormData()
    formData.append('nome', data.nome.trim())
    formData.append('vinculo', data.vinculo)

    if (data.sexo) formData.append('sexo', data.sexo)
    if (data.data_nascimento) formData.append('data_nascimento', data.data_nascimento)
    if (data.identidade) formData.append('identidade', data.identidade.trim())
    if (data.data_validade_caf) formData.append('data_validade_caf', data.data_validade_caf)
    if (data.endereco) formData.append('endereco', data.endereco.trim())
    if (data.bairro) formData.append('bairro', data.bairro.trim())
    if (data.cep) formData.append('cep', data.cep.trim())
    if (data.whatsapp) formData.append('whatsapp', data.whatsapp.trim())

    if (data.latitude !== undefined && data.latitude !== null && !isNaN(data.latitude)) {
      formData.append('latitude', String(data.latitude))
    }
    if (data.longitude !== undefined && data.longitude !== null && !isNaN(data.longitude)) {
      formData.append('longitude', String(data.longitude))
    }

    if (data.fotoFile) {
      formData.append('foto', data.fotoFile)
    }

    const created = await pb.collection('fornecedores').create(formData)
    return normalizeFornecedorRecord(created)
  },

  async update(id: string, data: Partial<FornecedorFormData>): Promise<FornecedorRecord> {
    const formData = new FormData()

    if (data.nome !== undefined) formData.append('nome', data.nome.trim())
    if (data.vinculo !== undefined) formData.append('vinculo', data.vinculo)
    if (data.sexo !== undefined) formData.append('sexo', data.sexo || '')
    if (data.data_nascimento !== undefined)
      formData.append('data_nascimento', data.data_nascimento || '')
    if (data.identidade !== undefined)
      formData.append('identidade', data.identidade ? data.identidade.trim() : '')
    if (data.data_validade_caf !== undefined)
      formData.append('data_validade_caf', data.data_validade_caf || '')
    if (data.endereco !== undefined)
      formData.append('endereco', data.endereco ? data.endereco.trim() : '')
    if (data.bairro !== undefined) formData.append('bairro', data.bairro ? data.bairro.trim() : '')
    if (data.cep !== undefined) formData.append('cep', data.cep ? data.cep.trim() : '')
    if (data.whatsapp !== undefined)
      formData.append('whatsapp', data.whatsapp ? data.whatsapp.trim() : '')

    if (data.latitude !== undefined) {
      formData.append(
        'latitude',
        data.latitude !== null && !isNaN(data.latitude) ? String(data.latitude) : '',
      )
    }
    if (data.longitude !== undefined) {
      formData.append(
        'longitude',
        data.longitude !== null && !isNaN(data.longitude) ? String(data.longitude) : '',
      )
    }

    if (data.fotoFile) {
      formData.append('foto', data.fotoFile)
    } else if (data.removerFoto) {
      formData.append('foto', '')
    }

    const updated = await pb.collection('fornecedores').update(id, formData)
    return normalizeFornecedorRecord(updated)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('fornecedores').delete(id)
  },
}
