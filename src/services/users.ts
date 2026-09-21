import pb from '@/lib/pocketbase/client'
import type { UserRecord, UserPerfil } from '@/lib/types'

function normalizeUserRecord(record: any): UserRecord {
  const rawPerfil = String(record.perfil || 'SECRETARIA').toUpperCase()
  let normalizedPerfil: UserPerfil = 'SECRETARIA'
  if (rawPerfil === 'MASTER') normalizedPerfil = 'MASTER'
  else if (rawPerfil === 'ADMINISTRADOR') normalizedPerfil = 'ADMINISTRADOR'
  else normalizedPerfil = 'SECRETARIA'

  let fotoUrl = ''
  if (record.foto) {
    fotoUrl = pb.files.getURL(record, record.foto)
  } else if (record.avatar) {
    fotoUrl = record.avatar.startsWith('http')
      ? record.avatar
      : pb.files.getURL(record, record.avatar)
  }

  return {
    id: record.id,
    email: record.email,
    nome: record.nome || record.name || '',
    name: record.name || record.nome || '',
    celular: record.celular || '',
    perfil: normalizedPerfil,
    foto: record.foto || '',
    avatar: fotoUrl,
    ativo: record.ativo !== false,
    created: record.created,
    updated: record.updated,
  }
}

export const usersService = {
  async getAll(): Promise<UserRecord[]> {
    const records = await pb.collection('users').getFullList({
      sort: '-created',
    })
    return records.map(normalizeUserRecord)
  },

  async getById(id: string): Promise<UserRecord> {
    const record = await pb.collection('users').getOne(id)
    return normalizeUserRecord(record)
  },

  async create(data: {
    nome: string
    email: string
    celular?: string
    perfil: 'MASTER' | 'ADMINISTRADOR' | 'SECRETARIA'
    password?: string
    fotoFile?: File | null
    ativo?: boolean
  }): Promise<UserRecord> {
    const formData = new FormData()
    formData.append('email', data.email)
    formData.append('nome', data.nome)
    formData.append('name', data.nome)
    if (data.celular) formData.append('celular', data.celular)
    formData.append('perfil', data.perfil)
    formData.append('ativo', String(data.ativo !== false))

    const pass = data.password || 'Mudar@123'
    formData.append('password', pass)
    formData.append('passwordConfirm', pass)
    formData.append('emailVisibility', 'true')

    if (data.fotoFile) {
      formData.append('foto', data.fotoFile)
    }

    const created = await pb.collection('users').create(formData)
    return normalizeUserRecord(created)
  },

  async update(
    id: string,
    data: {
      nome?: string
      email?: string
      celular?: string
      perfil?: 'MASTER' | 'ADMINISTRADOR' | 'SECRETARIA'
      ativo?: boolean
      password?: string
      fotoFile?: File | null
    },
  ): Promise<UserRecord> {
    const formData = new FormData()
    if (data.nome !== undefined) {
      formData.append('nome', data.nome)
      formData.append('name', data.nome)
    }
    if (data.email !== undefined) {
      formData.append('email', data.email)
    }
    if (data.celular !== undefined) {
      formData.append('celular', data.celular)
    }
    if (data.perfil !== undefined) {
      formData.append('perfil', data.perfil)
    }
    if (data.ativo !== undefined) {
      formData.append('ativo', String(data.ativo))
    }
    if (data.password) {
      formData.append('password', data.password)
      formData.append('passwordConfirm', data.password)
    }
    if (data.fotoFile) {
      formData.append('foto', data.fotoFile)
    }

    const updated = await pb.collection('users').update(id, formData)
    return normalizeUserRecord(updated)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('users').delete(id)
  },
}
