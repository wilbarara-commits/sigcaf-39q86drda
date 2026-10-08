import pb from '@/lib/pocketbase/client'
import type { CoordenadaSugestaoRecord, CoordenadaSugestaoStatus } from '@/lib/types'
import { calcularDistanciaHaversineKm, extrairCoordenadas } from '@/lib/routeOptimization'
import { escolasService } from '@/services/escolas'

export interface SugerirCoordenadaInput {
  escola_id: string
  lat: number
  lng: number
  precisao?: number
  rota_id?: string
  ciclo_id?: string
  chamada_id?: string
  motorista_id?: string
  despacho_id?: string
  registro_id?: string
  origem?: string
  entregue_em?: string
  observacao?: string
}

export interface ResultadoSugestao {
  acao: 'criada' | 'atualizada_existente' | 'ignorada_muito_proxima'
  registro?: CoordenadaSugestaoRecord
  motivo?: string
}

/**
 * Tolerância em metros para evitar encher a fila:
 * Se já existe uma sugestão pendente para a mesma escola com distância < 50m,
 * a nova coordenada é considerada trivial / muito próxima.
 */
export const TOLERANCIA_DISTANCIA_METROS = 50

export const coordenadaSugestoesService = {
  /**
   * Lista todas as sugestões com filtros opcionais
   */
  async getAll(filtro?: {
    status?: CoordenadaSugestaoStatus | 'todas'
    escolaId?: string
    cicloId?: string
  }): Promise<CoordenadaSugestaoRecord[]> {
    try {
      const parts: string[] = []
      if (filtro?.status && filtro.status !== 'todas') {
        parts.push(`status = "${filtro.status}"`)
      }
      if (filtro?.escolaId) {
        parts.push(`escola_id = "${filtro.escolaId}"`)
      }
      if (filtro?.cicloId) {
        parts.push(`ciclo_id = "${filtro.cicloId}"`)
      }

      const filter = parts.join(' && ')
      return await pb.collection('coordenada_sugestoes').getFullList<CoordenadaSugestaoRecord>({
        filter: filter || undefined,
        sort: '-created',
        expand: 'escola_id,motorista_id,rota_id,ciclo_id,chamada_id,revisado_por',
      })
    } catch (err) {
      console.warn('Erro ao listar sugestões de coordenadas:', err)
      return []
    }
  },

  /**
   * Contagem de sugestões pendentes
   */
  async countPendentes(): Promise<number> {
    try {
      const res = await pb.collection('coordenada_sugestoes').getList(1, 1, {
        filter: 'status = "pendente"',
      })
      return res.totalItems
    } catch {
      return 0
    }
  },

  /**
   * Registra uma nova sugestão com regra anti-duplicação:
   * 1. Verifica se já existe sugestão PENDENTE para esta escola.
   * 2. Se existir:
   *    - Calcula a distância entre a sugestão pendente e a nova coordenada.
   *    - Se for < 50m (distância trivial): atualiza os metadados (horário/motorista/despacho) ou ignora.
   *    - Se for >= 50m: atualiza a sugestão pendente existente com as novas coordenadas mais recentes.
   *    (Mantém apenas 1 sugestão pendente por escola para não poluir a fila).
   * 3. Se não existir: cria nova sugestão com status 'pendente'.
   */
  async registrarSugestao(input: SugerirCoordenadaInput): Promise<ResultadoSugestao> {
    if (!input.escola_id || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
      return { acao: 'ignorada_muito_proxima', motivo: 'Coordenadas ou escola inválidos' }
    }

    try {
      // 1. Buscar sugestões pendentes existentes para esta escola
      const pendentes = await pb
        .collection('coordenada_sugestoes')
        .getList<CoordenadaSugestaoRecord>(1, 5, {
          filter: `escola_id = "${input.escola_id}" && status = "pendente"`,
          sort: '-created',
        })

      if (pendentes.items.length > 0) {
        const existente = pendentes.items[0]
        const distKm = calcularDistanciaHaversineKm(
          existente.lat,
          existente.lng,
          input.lat,
          input.lng,
        )
        const distMetros = distKm * 1000

        // Se a distância for < 50m da sugestão pendente existente, apenas atualiza timestamp e precisão
        if (distMetros < TOLERANCIA_DISTANCIA_METROS) {
          const atualizado = await pb
            .collection('coordenada_sugestoes')
            .update<CoordenadaSugestaoRecord>(existente.id, {
              precisao: input.precisao ?? existente.precisao,
              motorista_id: input.motorista_id || existente.motorista_id,
              rota_id: input.rota_id || existente.rota_id,
              despacho_id: input.despacho_id || existente.despacho_id,
              ciclo_id: input.ciclo_id || existente.ciclo_id,
              chamada_id: input.chamada_id || existente.chamada_id,
              registro_id: input.registro_id || existente.registro_id,
              entregue_em: input.entregue_em || existente.entregue_em,
            })
          return {
            acao: 'ignorada_muito_proxima',
            registro: atualizado,
            motivo: `Distância trivial de ${distMetros.toFixed(1)}m em relação à sugestão pendente existente. Registro atualizado.`,
          }
        }

        // Se for >= 50m, atualiza a sugestão pendente com a coordenada mais recente (evita duplicar na fila)
        const atualizado = await pb
          .collection('coordenada_sugestoes')
          .update<CoordenadaSugestaoRecord>(existente.id, {
            lat: input.lat,
            lng: input.lng,
            precisao: input.precisao,
            motorista_id: input.motorista_id || existente.motorista_id,
            rota_id: input.rota_id || existente.rota_id,
            despacho_id: input.despacho_id || existente.despacho_id,
            ciclo_id: input.ciclo_id || existente.ciclo_id,
            chamada_id: input.chamada_id || existente.chamada_id,
            registro_id: input.registro_id || existente.registro_id,
            entregue_em: input.entregue_em || new Date().toISOString(),
          })

        return {
          acao: 'atualizada_existente',
          registro: atualizado,
          motivo: `Sugestão pendente atualizada com nova posição (${distMetros.toFixed(0)}m de diferença).`,
        }
      }

      // Se a escola já possui coordenadas oficiais muito próximas (< 50m), também podemos registrar ou notar
      // Criar nova sugestão pendente
      const criado = await pb.collection('coordenada_sugestoes').create<CoordenadaSugestaoRecord>({
        escola_id: input.escola_id,
        lat: input.lat,
        lng: input.lng,
        precisao: input.precisao,
        status: 'pendente',
        rota_id: input.rota_id || undefined,
        ciclo_id: input.ciclo_id || undefined,
        chamada_id: input.chamada_id || undefined,
        motorista_id: input.motorista_id || undefined,
        despacho_id: input.despacho_id || undefined,
        registro_id: input.registro_id || undefined,
        origem: input.origem || 'portal_motorista',
        entregue_em: input.entregue_em || new Date().toISOString(),
        observacao: input.observacao || undefined,
      })

      return { acao: 'criada', registro: criado }
    } catch (err: any) {
      console.error('Erro ao registrar sugestão de coordenada:', err)
      throw err
    }
  },

  /**
   * Aprovar sugestão:
   * 1. Atualiza as coordenadas na coleção `escolas` (latitude e longitude como strings formatadas com ponto).
   * 2. Marca a sugestão como 'aprovada', guardando revisado_por e revisado_em.
   */
  async aprovarSugestao(
    sugestaoId: string,
    userId?: string,
  ): Promise<{ sugestao: CoordenadaSugestaoRecord }> {
    const sugestao = await pb
      .collection('coordenada_sugestoes')
      .getOne<CoordenadaSugestaoRecord>(sugestaoId, { expand: 'escola_id' })

    const latStr = sugestao.lat.toFixed(6).replace(',', '.')
    const lngStr = sugestao.lng.toFixed(6).replace(',', '.')

    // 1. Atualiza a escola no cadastro mestre
    await escolasService.update(sugestao.escola_id, {
      latitude: latStr,
      longitude: lngStr,
    })

    // 2. Marca a sugestão como aprovada
    const nowIso = new Date().toISOString()
    const atualizada = await pb
      .collection('coordenada_sugestoes')
      .update<CoordenadaSugestaoRecord>(sugestaoId, {
        status: 'aprovada',
        revisado_por: userId || undefined,
        revisado_em: nowIso,
      })

    return { sugestao: atualizada }
  },

  /**
   * Recusar sugestão:
   * NÃO altera a escola. Marca a sugestão como 'recusada' guardando motivo, revisado_por e revisado_em.
   */
  async recusarSugestao(
    sugestaoId: string,
    motivo?: string,
    userId?: string,
  ): Promise<{ sugestao: CoordenadaSugestaoRecord }> {
    const nowIso = new Date().toISOString()
    const atualizada = await pb
      .collection('coordenada_sugestoes')
      .update<CoordenadaSugestaoRecord>(sugestaoId, {
        status: 'recusada',
        motivo_recusa: motivo?.trim() || undefined,
        revisado_por: userId || undefined,
        revisado_em: nowIso,
      })

    return { sugestao: atualizada }
  },

  /**
   * Calcula comparativo de distância entre a coordenada atual da escola e a coordenada sugerida.
   * Retorna distância em metros ou km e formatação amigável.
   */
  compararDistancia(
    escolaLatRaw?: string | number | null,
    escolaLngRaw?: string | number | null,
    sugeridaLat?: number,
    sugeridaLng?: number,
  ): {
    temCoordAtual: boolean
    distanciaMetros?: number
    distanciaKm?: number
    rotuloFormatado: string
  } {
    if (sugeridaLat === undefined || sugeridaLng === undefined) {
      return { temCoordAtual: false, rotuloFormatado: 'Coordenada sugerida ausente' }
    }

    const coordsAtuais = extrairCoordenadas(escolaLatRaw, escolaLngRaw)
    if (!coordsAtuais) {
      return {
        temCoordAtual: false,
        rotuloFormatado: 'Escola sem coordenadas cadastradas (Novo pino)',
      }
    }

    const distKm = calcularDistanciaHaversineKm(
      coordsAtuais.latitude,
      coordsAtuais.longitude,
      sugeridaLat,
      sugeridaLng,
    )
    const distMetros = distKm * 1000

    if (distMetros < 1000) {
      return {
        temCoordAtual: true,
        distanciaMetros: Math.round(distMetros),
        distanciaKm: distKm,
        rotuloFormatado: `~${Math.round(distMetros)} metros de diferença`,
      }
    }

    return {
      temCoordAtual: true,
      distanciaMetros: Math.round(distMetros),
      distanciaKm: distKm,
      rotuloFormatado: `~${distKm.toFixed(2)} km de diferença`,
    }
  },
}
