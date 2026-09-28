import pb from '@/lib/pocketbase/client'
import type { TokenFormularioRecord, ContratoEscolaRecord, ContratoRecord } from '@/lib/types'
import { isVinculoElegivelParaTokenFormulario, getColetaPorEfetivo } from '@/lib/coletaPor'

export const tokensFormularioService = {
  /**
   * Busca token ativo por escola, contrato e ciclo
   */
  async getByEscolaContratoECiclo(
    escolaId: string,
    contratoId: string,
    cicloId: string,
  ): Promise<TokenFormularioRecord | null> {
    try {
      const records = await pb
        .collection('tokens_formulario')
        .getList<TokenFormularioRecord>(1, 1, {
          filter: `escola_id = "${escolaId}" && contrato_id = "${contratoId}" && ciclo_id = "${cicloId}"`,
          sort: '-created',
        })
      return records.items[0] || null
    } catch (err) {
      console.error('Erro ao buscar token_formulario por escola, contrato e ciclo:', err)
      return null
    }
  },

  /**
   * Busca token ativo por escola e ciclo (mantido por retrocompatibilidade)
   */
  async getByEscolaECiclo(
    escolaId: string,
    cicloId: string,
    contratoId?: string,
  ): Promise<TokenFormularioRecord | null> {
    if (contratoId) {
      return this.getByEscolaContratoECiclo(escolaId, contratoId, cicloId)
    }
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
   * Gera ou retorna o token único da escola para o contrato e ciclo informado.
   * Expira no fim do ciclo (data_fim).
   *
   * REGRAS DE COERÊNCIA E COORDENAÇÃO (R25):
   * 1. O token só é gerado se o coleta_por EFETIVO da escola no contrato for 'formulario'.
   *    Se o efetivo for 'planilha', NUNCA gera token.
   * 2. Vínculo com encerrado_em preenchido (escola desvinculada) NÃO gera token.
   * 3. Contrato fora de status 'Ativo' NÃO gera token.
   *
   * O parâmetro `opcoes` permite passar o vínculo e contrato já carregados na memória
   * (evitando roundtrips adicionais), ou o serviço consulta o PocketBase caso não fornecidos.
   */
  async getOrCreateToken(
    escolaId: string,
    contratoId: string,
    cicloId: string,
    expiraEm?: string,
    opcoes?: {
      vinculo?: Partial<ContratoEscolaRecord> | null
      contrato?: Partial<ContratoRecord> | null
    },
  ): Promise<TokenFormularioRecord> {
    // 1. Verificar se já existe token emitido para essa trinca (escola x contrato x ciclo)
    const existing = await this.getByEscolaContratoECiclo(escolaId, contratoId, cicloId)
    if (existing) {
      return existing
    }

    // 2. Resolver dados do vínculo e do contrato para validação de coerência
    let vinculo = opcoes?.vinculo
    let contrato = opcoes?.contrato

    if (!vinculo) {
      try {
        const ceList = await pb.collection('contrato_escolas').getList<ContratoEscolaRecord>(1, 1, {
          filter: `escola_id = "${escolaId}" && contrato_id = "${contratoId}"`,
        })
        vinculo = ceList.items[0] || null
      } catch (ceErr) {
        console.warn('Não foi possível carregar vínculo contrato_escolas para validação:', ceErr)
      }
    }

    if (!contrato) {
      try {
        contrato = await pb.collection('contratos').getOne<ContratoRecord>(contratoId)
      } catch (cErr) {
        console.warn('Não foi possível carregar contrato para validação:', cErr)
      }
    }

    // Se encontramos os dados de vínculo e contrato, valida coerência
    if (vinculo && contrato) {
      const elegivel = isVinculoElegivelParaTokenFormulario({
        vinculo,
        contrato,
      })

      if (!elegivel) {
        const efetivo = getColetaPorEfetivo(vinculo, contrato.modalidade_pedido)
        throw new Error(
          `Geração de token rejeitada: contrato status=${contrato.status}, vínculo encerrado_em=${vinculo.encerrado_em || 'não'}, coleta_por efetivo="${efetivo}". Apenas vínculos ativos de contratos ativos com coleta_por efetivo "formulario" podem ter token.`,
        )
      }
    } else if (contrato) {
      // Caso haja contrato sem vínculo encontrado
      if (contrato.status !== 'Ativo') {
        throw new Error(`Geração de token rejeitada: contrato "${contratoId}" não está Ativo.`)
      }
    }

    // 3. Gerar token alfanumérico seguro e amigável
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
