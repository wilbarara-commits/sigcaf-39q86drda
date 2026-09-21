import pb from '@/lib/pocketbase/client'
import type { ConfiguracoesRecord } from '@/lib/types'

export const configuracoesService = {
  async get(): Promise<ConfiguracoesRecord | null> {
    try {
      const records = await pb.collection('configuracoes').getList(1, 1, {
        sort: '-created',
      })
      if (records.items.length === 0) return null
      const item = records.items[0]
      return {
        id: item.id,
        nome_cooperativa: item.nome_cooperativa || 'CooperGestão',
        sigla: item.sigla || '',
        cnpj: item.cnpj || '',
        telefone: item.telefone || '',
        email: item.email || '',
        cidade_uf: item.cidade_uf || '',
        exibir_atalhos_demo: item.exibir_atalhos_demo !== false,
        logotipo: item.logotipo || '',
        created: item.created,
        updated: item.updated,
      }
    } catch (err) {
      console.error('Erro ao buscar configurações:', err)
      return null
    }
  },

  getLogoUrl(config: ConfiguracoesRecord | null): string {
    if (!config || !config.logotipo) return ''
    try {
      const recordObj = {
        id: config.id,
        collectionId: 'pbc_477892449',
        collectionName: 'configuracoes',
        logotipo: config.logotipo,
      }
      return pb.files.getURL(recordObj as any, config.logotipo)
    } catch (err) {
      console.error('Erro ao gerar URL do logotipo:', err)
      return ''
    }
  },

  async save(
    data: Partial<Omit<ConfiguracoesRecord, 'id' | 'created' | 'updated'>> | FormData,
    existingId?: string,
  ): Promise<ConfiguracoesRecord> {
    // 1. Se não foi passado existingId, tentar localizar o singleton existente no banco
    let targetId = existingId
    if (!targetId) {
      try {
        const existing = await pb.collection('configuracoes').getList(1, 1, { sort: '-created' })
        if (existing.items.length > 0) {
          targetId = existing.items[0].id
        }
      } catch (err) {
        console.warn('Não foi possível verificar singleton antes de salvar:', err)
      }
    }

    // 2. Se temos targetId, tenta update; se falhar com 404 (não encontrado), cai para create
    if (targetId) {
      try {
        const updated = await pb.collection('configuracoes').update(targetId, data)
        return {
          id: updated.id,
          nome_cooperativa: updated.nome_cooperativa,
          sigla: updated.sigla || '',
          cnpj: updated.cnpj || '',
          telefone: updated.telefone || '',
          email: updated.email || '',
          cidade_uf: updated.cidade_uf || '',
          exibir_atalhos_demo: updated.exibir_atalhos_demo !== false,
          logotipo: updated.logotipo || '',
          created: updated.created,
          updated: updated.updated,
        }
      } catch (err: any) {
        if (err?.status === 404) {
          console.warn('Registro singleton não encontrado no update. Criando novo...')
        } else {
          throw err
        }
      }
    }

    // 3. Criar caso não exista
    const created = await pb.collection('configuracoes').create(data)
    return {
      id: created.id,
      nome_cooperativa: created.nome_cooperativa,
      sigla: created.sigla || '',
      cnpj: created.cnpj || '',
      telefone: created.telefone || '',
      email: created.email || '',
      cidade_uf: created.cidade_uf || '',
      exibir_atalhos_demo: created.exibir_atalhos_demo !== false,
      logotipo: created.logotipo || '',
      created: created.created,
      updated: created.updated,
    }
  },
}
