import pb from '@/lib/pocketbase/client'
import type { TokenFormularioRecord } from '@/lib/types'

export const tokensFormularioService = {
  /**
   * Busca token ativo por escola e ciclo
   */
  async getByEscolaECiclo(
    escolaId: string,
    cicloId: string,
  ): Promise<TokenFormularioRecord | null> {
    try {
      const records = await pb
        .collection('tokens_formulario')
        .getList<TokenFormularioRecord>(1, 1, {
          filter: `escola_id = "${escolaId}" && ciclo_id = "${cicloId}"`,
          sort: '-created',
        })
      return records.items[0] || null
    } catch (err) {
      console.error('Erro ao buscar token_formulario:', err)
      return null
    }
  },

  /**
   * Busca token pela string do token (acesso público)
   */
  async getByToken(tokenStr: string): Promise<TokenFormularioRecord | null> {
    try {
      const record = await pb
        .collection('tokens_formulario')
        .getFirstListItem<TokenFormularioRecord>(`token = "${tokenStr}"`, {
          expand: 'escola_id,contrato_id,ciclo_id',
        })
      return record
    } catch (err) {
      console.error('Erro ao buscar token pelo hash:', err)
      return null
    }
  },

  /**
   * Gera ou retorna o token único da escola para o ciclo informado.
   * Expira no fim do ciclo (data_fim).
   */
  async getOrCreateToken(
    escolaId: string,
    contratoId: string,
    cicloId: string,
    expiraEm?: string,
  ): Promise<TokenFormularioRecord> {
    const existing = await this.getByEscolaECiclo(escolaId, cicloId)
    if (existing) {
      return existing
    }

    // Gerar token alfanumérico seguro e amigável
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const tokenStr = `f_${randomHex}`
    const nowIso = new Date().toISOString()

    return await pb.collection('tokens_formulario').create<TokenFormularioRecord>({
      escola_id: escolaId,
      contrato_id: contratoId,
      ciclo_id: cicloId,
      token: tokenStr,
      ativo: true,
      criado_em: nowIso,
      expira_em: expiraEm || undefined,
    })
  },

  /**
   * Retorna mapa de todos os tokens de um ciclo indexados por escola_id
   */
  async getAllByCiclo(cicloId: string): Promise<TokenFormularioRecord[]> {
    try {
      return await pb.collection('tokens_formulario').getFullList<TokenFormularioRecord>({
        filter: `ciclo_id = "${cicloId}"`,
      })
    } catch (err) {
      console.error('Erro ao listar tokens por ciclo:', err)
      return []
    }
  },
}
