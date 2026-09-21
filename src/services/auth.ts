import pb from '@/lib/pocketbase/client'
import type { UserRecord, UserPerfil } from '@/lib/types'

function normalizeUser(model: any): UserRecord {
  const rawPerfil = String(model.perfil || 'SECRETARIA').toUpperCase()
  let normalizedPerfil: UserPerfil = 'SECRETARIA'
  if (rawPerfil === 'MASTER') normalizedPerfil = 'MASTER'
  else if (rawPerfil === 'ADMINISTRADOR') normalizedPerfil = 'ADMINISTRADOR'
  else normalizedPerfil = 'SECRETARIA'

  let fotoUrl = ''
  if (model.foto) {
    fotoUrl = pb.files.getURL(model, model.foto)
  } else if (model.avatar) {
    fotoUrl = model.avatar.startsWith('http') ? model.avatar : pb.files.getURL(model, model.avatar)
  }

  return {
    id: model.id,
    email: model.email,
    nome: model.nome || model.name || '',
    name: model.name || model.nome || '',
    celular: model.celular || '',
    perfil: normalizedPerfil,
    foto: model.foto || '',
    avatar: fotoUrl,
    ativo: model.ativo !== false,
    created: model.created,
    updated: model.updated,
  }
}

export const authService = {
  getCurrentUser(): UserRecord | null {
    if (!pb.authStore.isValid || !pb.authStore.record) {
      return null
    }
    return normalizeUser(pb.authStore.record)
  },

  async login(email: string, password: string): Promise<UserRecord> {
    const authData = await pb.collection('users').authWithPassword(email, password)
    const user = normalizeUser(authData.record)
    if (user.ativo === false) {
      pb.authStore.clear()
      throw new Error('Esta conta de usuário foi desativada pelo administrador master.')
    }
    return user
  },

  async requestPasswordReset(email: string): Promise<boolean> {
    return await pb.collection('users').requestPasswordReset(email)
  },

  async updateProfile(data: {
    nome?: string
    celular?: string
    email?: string
    fotoFile?: File | null
  }): Promise<UserRecord> {
    if (!pb.authStore.isValid || !pb.authStore.record) {
      throw new Error('Usuário não autenticado.')
    }
    const currentUserId = pb.authStore.record.id

    const formData = new FormData()
    if (data.nome !== undefined) {
      formData.append('nome', data.nome)
      formData.append('name', data.nome)
    }
    if (data.celular !== undefined) {
      formData.append('celular', data.celular)
    }
    if (data.email !== undefined && data.email !== pb.authStore.record.email) {
      formData.append('email', data.email)
    }
    if (data.fotoFile) {
      formData.append('foto', data.fotoFile)
    }

    const updated = await pb.collection('users').update(currentUserId, formData)
    return normalizeUser(updated)
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!pb.authStore.isValid || !pb.authStore.record) {
      throw new Error('Usuário não autenticado.')
    }
    const currentUserId = pb.authStore.record.id
    await pb.collection('users').update(currentUserId, {
      oldPassword,
      password: newPassword,
      passwordConfirm: newPassword,
    })
  },

  logout(): void {
    pb.authStore.clear()
  },

  subscribe(callback: (user: UserRecord | null) => void): () => void {
    const unsubscribe = pb.authStore.onChange(() => {
      callback(authService.getCurrentUser())
    })
    return unsubscribe
  },
}
