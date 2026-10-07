import pb from '@/lib/pocketbase/client'
import type {
  RotaDespachoRecord,
  EntregaRegistroRecord,
  RotaRecord,
  ParadaRotaRecord,
  EscolaRecord,
} from '@/lib/types'

/**
 * Gera um token longo, URL-safe e criptograficamente aleatório
 */
export function generateDriverToken(): string {
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 24; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `mot_${hex}`
}

/**
 * Monta o texto pronto da mensagem do WhatsApp para copiar
 */
export function buildDriverWhatsAppMessage(options: {
  rotaNome: string
  cicloCodigo?: string
  totalEntregas: number
  token: string
  origin?: string
}): string {
  const base =
    options.origin ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')
  const link = `${base}/motorista?token=${options.token}`
  let cicloInfo = ''
  if (options.cicloCodigo) {
    const limpo = options.cicloCodigo.trim()
    if (/^ciclo\b/i.test(limpo)) {
      cicloInfo = ` — ${limpo}`
    } else {
      cicloInfo = ` — Ciclo ${limpo}`
    }
  }
  const entregasText =
    options.totalEntregas === 1 ? '1 entrega' : `${options.totalEntregas} entregas`

  return `*${options.rotaNome}*${cicloInfo} — ${entregasText}.\nAcompanhe e registre as entregas pelo link:\n${link}`
}

export interface MotoristaPortalParada extends ParadaRotaRecord {
  escola?: EscolaRecord
  contratoNumero?: string
  registro?: EntregaRegistroRecord
}

export interface MotoristaPortalData {
  despacho: RotaDespachoRecord
  rota: RotaRecord
  paradas: MotoristaPortalParada[]
}

export const rotaDespachosService = {
  /**
   * Busca o despacho ativo mais recente de uma rota
   */
  async getAtivoByRota(rotaId: string): Promise<RotaDespachoRecord | null> {
    try {
      const records = await pb.collection('rota_despachos').getList<RotaDespachoRecord>(1, 1, {
        filter: `rota_id = "${rotaId}" && ativo = true`,
        sort: '-despachado_em,-created',
        expand: 'motorista_id,rota_id,ciclo_id,chamada_id',
      })
      return records.items[0] || null
    } catch (err) {
      console.error('Erro ao buscar despacho ativo por rota:', err)
      return null
    }
  },

  /**
   * Busca o histórico de despachos de uma rota
   */
  async getHistoricoByRota(rotaId: string): Promise<RotaDespachoRecord[]> {
    try {
      return await pb.collection('rota_despachos').getFullList<RotaDespachoRecord>({
        filter: `rota_id = "${rotaId}"`,
        sort: '-created',
        expand: 'motorista_id',
      })
    } catch {
      return []
    }
  },

  /**
   * Busca dados pelo token (página pública do motorista)
   * Se o token existir mas ativo === false, retorna { status: 'renovado', record }
   * Se não existir, retorna { status: 'invalido' }
   */
  async getByToken(
    tokenStr: string,
  ): Promise<{ status: 'valido' | 'renovado' | 'invalido'; record?: RotaDespachoRecord }> {
    try {
      const clean = (tokenStr || '').trim()
      if (!clean) return { status: 'invalido' }

      const record = await pb
        .collection('rota_despachos')
        .getFirstListItem<RotaDespachoRecord>(`token = "${clean}"`, {
          expand: 'rota_id,motorista_id,ciclo_id,chamada_id',
        })

      if (!record.ativo) {
        return { status: 'renovado', record }
      }
      return { status: 'valido', record }
    } catch {
      return { status: 'invalido' }
    }
  },

  /**
   * Despacha uma rota pela 1ª vez ou redispara renovando o token
   */
  async despacharOuRenovar(data: {
    rotaId: string
    motoristaId?: string
    cicloId?: string
    chamadaId?: string
    isRedisparo?: boolean
    userId?: string
  }): Promise<{ despacho: RotaDespachoRecord; pedidosAfetados: any[] }> {
    const nowIso = new Date().toISOString()
    const newToken = generateDriverToken()

    // 1. Se houver despachos ativos anteriores desta rota, desativa-os (invalidação / renovação)
    try {
      const anteriores = await pb.collection('rota_despachos').getFullList<RotaDespachoRecord>({
        filter: `rota_id = "${data.rotaId}" && ativo = true`,
      })
      for (const ant of anteriores) {
        await pb.collection('rota_despachos').update(ant.id, {
          ativo: false,
          renovado_em: nowIso,
        })
      }
    } catch (err) {
      console.warn('Aviso ao desativar despachos anteriores:', err)
    }

    // 2. Cria o novo registro de despacho com o token exclusivo
    const createdDespacho = await pb.collection('rota_despachos').create<RotaDespachoRecord>({
      rota_id: data.rotaId,
      motorista_id: data.motoristaId || undefined,
      ciclo_id: data.cicloId || undefined,
      chamada_id: data.chamadaId || undefined,
      token: newToken,
      ativo: true,
      despachado_em: nowIso,
      renovado_em: data.isRedisparo ? nowIso : undefined,
    })

    // 2.1 Garantir retenção histórica em rota_snapshots (versao_evento='despacho')
    // Na 1ª vez do despacho cria o snapshot; no redisparo, atualiza idempotentemente o snapshot existente sem duplicar
    try {
      let rotaNome = 'Rota'
      try {
        const rRec = await pb.collection('rotas').getOne(data.rotaId)
        rotaNome = rRec.nome || 'Rota'
      } catch {
        /* tolerante */
      }

      // Paradas da rota
      let paradasList: any[] = []
      try {
        const pRecords = await pb.collection('paradas_rota').getFullList({
          filter: `rota_id = "${data.rotaId}"`,
          sort: 'ordem',
          expand: 'escola_id',
        })
        paradasList = pRecords.map((p, idx) => ({
          escola_id: p.escola_id,
          escola_nome: (p as any).expand?.escola_id?.nome || '',
          ordem: p.ordem || idx + 1,
          endereco: (p as any).expand?.escola_id?.endereco || '',
        }))
      } catch {
        /* tolerante */
      }

      // Contagem de pedidos da rota
      let totalPedidosCount = 0
      try {
        let pedFilter = `rota_id = "${data.rotaId}"`
        if (data.cicloId) pedFilter += ` && ciclo_id = "${data.cicloId}"`
        const pList = await pb.collection('pedidos').getFullList({ filter: pedFilter })
        totalPedidosCount = pList.length
      } catch {
        /* tolerante */
      }

      // Verificar existência de snapshot do ciclo/rota para despacho
      const filterSnap = data.cicloId
        ? `rota_id = "${data.rotaId}" && ciclo_id = "${data.cicloId}" && versao_evento = "despacho"`
        : `rota_id = "${data.rotaId}" && versao_evento = "despacho"`

      const snapExistentes = await pb.collection('rota_snapshots').getList(1, 1, {
        filter: filterSnap,
        sort: '-snapshot_em,-created',
      })

      const snapPayload: Record<string, any> = {
        rota_id: data.rotaId,
        ciclo_id: data.cicloId || undefined,
        chamada_id: data.chamadaId || undefined,
        motorista_id: data.motoristaId || undefined,
        despacho_id: createdDespacho.id,
        rota_nome: rotaNome,
        versao_evento: 'despacho',
        total_paradas: paradasList.length,
        total_pedidos: totalPedidosCount,
        paradas_snapshot: JSON.stringify(paradasList),
        snapshot_em: nowIso,
        observacao: data.isRedisparo
          ? 'Redisparo da rota pelo motorista'
          : 'Despacho da rota pelo motorista',
      }

      if (snapExistentes.items.length > 0) {
        await pb.collection('rota_snapshots').update(snapExistentes.items[0].id, snapPayload)
      } else {
        await pb.collection('rota_snapshots').create(snapPayload)
      }
    } catch (errSnap) {
      console.warn('Aviso ao sincronizar rota_snapshots no despacharOuRenovar:', errSnap)
    }

    // 3. Ao despachar, zera campos legados de posição do caminhão para começar do depósito
    try {
      await pb.collection('rotas').update(data.rotaId, {
        caminhao_posicao_atual: 0,
        caminhao_escola_id: '',
      })
    } catch (err) {
      console.warn('Aviso ao zerar posição do caminhão da rota no despacho:', err)
    }

    // 3.1 GANCHO DE RETENÇÃO HISTÓRICA NO DESPACHO (rota_snapshots versao_evento='despacho')
    // Grava a composição e ordem das paradas da rota naquele momento, ciclo_id e chamada_id.
    // Idempotente e não-bloqueante (best-effort silencioso).
    try {
      let rotaNome = ''
      try {
        const rRec = await pb.collection('rotas').getOne(data.rotaId)
        rotaNome = rRec.nome || 'Rota'
      } catch {
        rotaNome = 'Rota'
      }

      // Buscar paradas atuais com escolas ordenadas
      let paradasList = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
        filter: `rota_id = "${data.rotaId}"`,
        sort: 'ordem',
        expand: 'escola_id',
      })

      const paradasSnapshot = paradasList.map((p, idx) => ({
        escola_id: p.escola_id,
        escola_nome: (p as any).expand?.escola_id?.nome || '',
        ordem: p.ordem || idx + 1,
        endereco: (p as any).expand?.escola_id?.endereco || '',
      }))

      // Idempotência em rota_snapshots: verificar se já existe snapshot deste despacho/rota no ciclo
      const snapFilter = data.cicloId
        ? `rota_id = "${data.rotaId}" && versao_evento = "despacho" && ciclo_id = "${data.cicloId}"`
        : `rota_id = "${data.rotaId}" && versao_evento = "despacho"`
      const snapExistentes = await pb.collection('rota_snapshots').getList(1, 1, {
        filter: snapFilter,
        sort: '-snapshot_em,-created',
      })

      const snapPayload: Record<string, any> = {
        rota_id: data.rotaId,
        ciclo_id: data.cicloId || undefined,
        chamada_id: data.chamadaId || undefined,
        motorista_id: data.motoristaId || undefined,
        despacho_id: createdDespacho.id,
        rota_nome: rotaNome,
        versao_evento: 'despacho',
        total_paradas: paradasSnapshot.length,
        paradas_snapshot: JSON.stringify(paradasSnapshot),
        snapshot_em: nowIso,
      }

      if (snapExistentes.items.length > 0) {
        await pb.collection('rota_snapshots').update(snapExistentes.items[0].id, snapPayload)
      } else {
        await pb.collection('rota_snapshots').create(snapPayload)
      }
    } catch (errSnap) {
      console.warn(
        'Aviso não-bloqueante ao gravar snapshot de despacho em rota-despachos:',
        errSnap,
      )
    }

    const pedidosAfetados: any[] = []

    // 4. Se for novo despacho (!isRedisparo), atualizar os pedidos pendentes para "Em Rota"
    // e criar registro correspondente na collection despachos (status "Em Rota")
    if (!data.isRedisparo) {
      try {
        // Localizar as escolas da rota via paradas_rota
        let paradas = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
          filter: `rota_id = "${data.rotaId}"`,
          sort: 'ordem',
        })
        const escolaIds = new Set(paradas.map((p) => p.escola_id))

        // Se paradas_rota estiver vazio, fallback por contrato_escolas
        if (escolaIds.size === 0) {
          try {
            const vinculos = await pb.collection('contrato_escolas').getFullList<any>({
              filter: `rota_id = "${data.rotaId}"`,
            })
            vinculos.forEach((v) => escolaIds.add(v.escola_id))
          } catch {
            /* intentionally ignored */
          }
        }

        // Buscar pedidos do ciclo ativo com status Pendente
        let pedidosFilter = `status = "Pendente"`
        if (data.cicloId) {
          pedidosFilter += ` && ciclo_id = "${data.cicloId}"`
        }

        const pedidosPendentes = await pb.collection('pedidos').getFullList<any>({
          filter: pedidosFilter,
        })

        // Filtrar pedidos que pertencem a esta rota (por rota_id ou pelas escolas das paradas)
        const elegiveis = pedidosPendentes.filter(
          (p) => p.rota_id === data.rotaId || escolaIds.has(p.escola_id),
        )

        for (const ped of elegiveis) {
          const atualizado = await pb.collection('pedidos').update(ped.id, {
            status: 'Em Rota',
            rota_id: data.rotaId,
          })
          pedidosAfetados.push(atualizado)
        }

        // Criar registro na collection despachos com status "Em Rota"
        try {
          const despExistentes = await pb.collection('despachos').getList(1, 1, {
            filter: `rota_id = "${data.rotaId}" && status = "Em Rota"${
              data.cicloId ? ` && ciclo_id = "${data.cicloId}"` : ''
            }`,
          })
          if (despExistentes.items.length === 0) {
            await pb.collection('despachos').create({
              rota_id: data.rotaId,
              chamada_id: data.chamadaId || undefined,
              ciclo_id: data.cicloId || undefined,
              usuario_id: data.userId || undefined,
              data_despacho: nowIso,
              status: 'Em Rota',
            })
          }
        } catch (errDesp) {
          console.warn('Aviso ao criar registro na collection despachos:', errDesp)
        }
      } catch (errPedidos) {
        console.error('Erro ao atualizar pedidos para Em Rota no despacho:', errPedidos)
      }
    }

    return { despacho: createdDespacho, pedidosAfetados }
  },

  /**
   * Carrega os dados completos para a tela pública do motorista:
   * rota, paradas com escolas ordenadas, contrato de origem do vínculo e registros de entrega já realizados.
   * Suporta o modelo atual de vínculos (chamada x contrato x escola) com fallback resiliente.
   */
  /**
   * Subscrição em tempo real para mudanças na coleção rota_despachos
   */
  subscribe(callback: (data: { action: string; record: RotaDespachoRecord }) => void): () => void {
    let cancelled = false
    let unsubscribeFn: (() => Promise<void>) | undefined

    pb.collection<RotaDespachoRecord>('rota_despachos')
      .subscribe('*', (e) => {
        if (!cancelled && e.record) {
          callback({ action: e.action, record: e.record })
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn().catch(() => {})
        } else {
          unsubscribeFn = fn
        }
      })
      .catch((err) => {
        console.warn('Erro ao assinar realtime de rota_despachos:', err)
      })

    return () => {
      cancelled = true
      if (unsubscribeFn) {
        unsubscribeFn().catch(() => {})
      }
    }
  },

  async carregarPortalMotorista(despacho: RotaDespachoRecord): Promise<MotoristaPortalData> {
    const rotaId = despacho.rota_id
    const rota = await pb.collection('rotas').getOne<RotaRecord>(rotaId, {
      expand: 'chamada_id,contrato_id',
    })

    // 1. Carregar paradas cadastradas em paradas_rota (ordenadas por ordem)
    let paradas = await pb.collection('paradas_rota').getFullList<ParadaRotaRecord>({
      filter: `rota_id = "${rotaId}"`,
      sort: 'ordem',
      expand: 'escola_id',
    })

    // 2. Fallback resiliente: se paradas_rota estiver vazio, buscar pelos vínculos contrato_escolas
    if (paradas.length === 0) {
      try {
        const vinculos = await pb.collection('contrato_escolas').getFullList<any>({
          filter: `rota_id = "${rotaId}"`,
          expand: 'escola_id,contrato_id',
          sort: 'created',
        })
        paradas = vinculos.map((v, idx) => ({
          id: v.id,
          rota_id: rotaId,
          escola_id: v.escola_id,
          ordem: idx + 1,
          expand: {
            escola_id: v.expand?.escola_id,
          },
          created: v.created,
          updated: v.updated,
        }))
      } catch (e) {
        console.warn('Fallback por contrato_escolas falhou:', e)
      }
    }

    // 3. Resolver número do contrato de cada escola na chamada/rota
    const contratoPorEscolaMap = new Map<string, string>()
    try {
      const vinculosComContrato = await pb.collection('contrato_escolas').getFullList<any>({
        filter: `rota_id = "${rotaId}"`,
        expand: 'contrato_id',
      })
      for (const v of vinculosComContrato) {
        const num = v.expand?.contrato_id?.numero || v.expand?.contrato_id?.numero_chamada
        if (num && !contratoPorEscolaMap.has(v.escola_id)) {
          contratoPorEscolaMap.set(v.escola_id, num)
        }
      }
    } catch (e) {
      console.warn('Não foi possível obter números de contrato dos vínculos:', e)
    }

    // 4. Buscar registros de entrega já existentes para esta rota
    let registros: EntregaRegistroRecord[] = []
    try {
      registros = await pb.collection('entrega_registros').getFullList<EntregaRegistroRecord>({
        filter: `rota_id = "${rotaId}"`,
        sort: '-confirmado_em',
      })
    } catch (err) {
      console.warn('Não foi possível carregar registros prévios de entrega:', err)
    }

    const registrosPorEscola = new Map<string, EntregaRegistroRecord>()
    for (const reg of registros) {
      if (!registrosPorEscola.has(reg.escola_id)) {
        registrosPorEscola.set(reg.escola_id, reg)
      }
    }

    const paradasCompletas: MotoristaPortalParada[] = paradas.map((p) => ({
      ...p,
      escola: p.expand?.escola_id,
      contratoNumero: contratoPorEscolaMap.get(p.escola_id),
      registro: registrosPorEscola.get(p.escola_id),
    }))

    return {
      despacho,
      rota,
      paradas: paradasCompletas,
    }
  },
}

export const entregaRegistrosService = {
  /**
   * Lista todos os registros de uma rota
   */
  async getByRota(rotaId: string): Promise<EntregaRegistroRecord[]> {
    try {
      return await pb.collection('entrega_registros').getFullList<EntregaRegistroRecord>({
        filter: `rota_id = "${rotaId}"`,
        sort: 'confirmado_em,created',
        expand: 'escola_id,motorista_id',
      })
    } catch {
      return []
    }
  },

  /**
   * Salva registro de entrega (com proteção contra duplicidade por client_uid ou rota+escola)
   */
  /**
   * Salva registro de entrega (com proteção contra duplicidade por client_uid ou rota+escola)
   */
  async salvarRegistro(data: {
    rota_id: string
    escola_id: string
    motorista_id?: string
    despacho_id?: string
    ciclo_id?: string
    chamada_id?: string
    responsavel_nome?: string
    responsavel_cpf?: string
    chegada_em?: string
    confirmado_em?: string
    assinatura?: string
    observacao?: string
    foto?: string
    status_sync?: string
    client_uid?: string
  }): Promise<EntregaRegistroRecord> {
    const payload: Record<string, any> = {
      ...data,
      status_sync: 'sincronizado',
    }

    // Resolver ciclo_id e chamada_id caso o despacho tenha sido informado
    let resolvedCicloId = payload.ciclo_id || ''
    let resolvedChamadaId = payload.chamada_id || ''
    let resolvedMotoristaId = payload.motorista_id || ''

    if (data.despacho_id && (!resolvedCicloId || !resolvedChamadaId || !resolvedMotoristaId)) {
      try {
        const despRec = await pb.collection('rota_despachos').getOne(data.despacho_id)
        if (!resolvedCicloId && despRec.ciclo_id) resolvedCicloId = despRec.ciclo_id
        if (!resolvedChamadaId && despRec.chamada_id) resolvedChamadaId = despRec.chamada_id
        if (!resolvedMotoristaId && despRec.motorista_id) resolvedMotoristaId = despRec.motorista_id
      } catch {
        /* tolerante */
      }
    }

    if (data.rota_id && (!resolvedChamadaId || !resolvedCicloId)) {
      try {
        const rRec = await pb.collection('rotas').getOne(data.rota_id)
        if (!resolvedChamadaId && rRec.chamada_id) resolvedChamadaId = rRec.chamada_id
      } catch {
        /* tolerante */
      }

      if (!resolvedCicloId && resolvedChamadaId) {
        try {
          const ciclosList = await pb.collection('ciclos').getList(1, 1, {
            filter: `chamada_id = "${resolvedChamadaId}" && status != "fechado" && status != "cancelado"`,
            sort: '-created,-data_inicio',
          })
          if (ciclosList.items.length > 0) {
            resolvedCicloId = ciclosList.items[0].id
          }
        } catch {
          /* tolerante */
        }
      }
    }

    if (resolvedCicloId) payload.ciclo_id = resolvedCicloId
    if (resolvedChamadaId) payload.chamada_id = resolvedChamadaId
    if (resolvedMotoristaId) payload.motorista_id = resolvedMotoristaId

    let registroSalvo: EntregaRegistroRecord | null = null

    // Se vier client_uid, tenta atualizar ou evitar duplicação
    if (data.client_uid) {
      try {
        const existList = await pb
          .collection('entrega_registros')
          .getList<EntregaRegistroRecord>(1, 1, {
            filter: `client_uid = "${data.client_uid}"`,
          })
        if (existList.items.length > 0) {
          const id = existList.items[0].id
          registroSalvo = await pb
            .collection('entrega_registros')
            .update<EntregaRegistroRecord>(id, payload)
        }
      } catch {
        /* intentionally ignored */
      }
    }

    // Checar se já existe registro desta escola na mesma rota e despacho
    if (!registroSalvo && data.rota_id && data.escola_id) {
      try {
        const filterStr = data.despacho_id
          ? `rota_id = "${data.rota_id}" && escola_id = "${data.escola_id}" && despacho_id = "${data.despacho_id}"`
          : `rota_id = "${data.rota_id}" && escola_id = "${data.escola_id}"`
        const exist = await pb
          .collection('entrega_registros')
          .getList<EntregaRegistroRecord>(1, 1, { filter: filterStr, sort: '-created' })
        if (exist.items.length > 0) {
          const id = exist.items[0].id
          registroSalvo = await pb
            .collection('entrega_registros')
            .update<EntregaRegistroRecord>(id, payload)
        }
      } catch {
        /* intentionally ignored */
      }
    }

    if (!registroSalvo) {
      registroSalvo = await pb
        .collection('entrega_registros')
        .create<EntregaRegistroRecord>(payload)
    }

    // 2. GANCHO DE RETENÇÃO HISTÓRICA DO PORTAL DO MOTORISTA (entrega_comprovantes):
    // Garante a gravação ou atualização permanente com ciclo_id e chamada_id.
    // É idempotente e NÃO bloqueante (erro só em console/log).
    try {
      const nowIso = new Date().toISOString()
      let escolaNome = ''
      try {
        const escRec = await pb.collection('escolas').getOne(data.escola_id)
        escolaNome = escRec.nome || ''
      } catch {
        /* tolerante */
      }

      // Idempotência em entrega_comprovantes: buscar por client_uid ou registro_id ou (escola + ciclo + rota)
      let compExistId: string | null = null
      if (data.client_uid) {
        try {
          const cList = await pb.collection('entrega_comprovantes').getList(1, 1, {
            filter: `client_uid = "${data.client_uid}"`,
          })
          if (cList.items.length > 0) compExistId = cList.items[0].id
        } catch {
          /* tolerante */
        }
      }

      if (!compExistId && registroSalvo.id) {
        try {
          const cList = await pb.collection('entrega_comprovantes').getList(1, 1, {
            filter: `registro_id = "${registroSalvo.id}"`,
          })
          if (cList.items.length > 0) compExistId = cList.items[0].id
        } catch {
          /* tolerante */
        }
      }

      if (!compExistId && data.escola_id && data.rota_id) {
        try {
          const compFilter = resolvedCicloId
            ? `escola_id = "${data.escola_id}" && rota_id = "${data.rota_id}" && ciclo_id = "${resolvedCicloId}"`
            : `escola_id = "${data.escola_id}" && rota_id = "${data.rota_id}"`
          const cList = await pb.collection('entrega_comprovantes').getList(1, 1, {
            filter: compFilter,
            sort: '-created',
          })
          if (cList.items.length > 0) compExistId = cList.items[0].id
        } catch {
          /* tolerante */
        }
      }

      const compPayload: Record<string, any> = {
        escola_id: data.escola_id,
        escola_nome: escolaNome,
        rota_id: data.rota_id || undefined,
        ciclo_id: resolvedCicloId || undefined,
        chamada_id: resolvedChamadaId || undefined,
        motorista_id: resolvedMotoristaId || undefined,
        registro_id: registroSalvo.id,
        responsavel_nome: data.responsavel_nome || undefined,
        responsavel_cpf: data.responsavel_cpf || undefined,
        chegada_em: data.chegada_em || undefined,
        confirmado_em: data.confirmado_em || nowIso,
        assinatura: data.assinatura || undefined,
        foto: data.foto || undefined,
        observacao: data.observacao || undefined,
        origem: 'portal_motorista',
        client_uid: data.client_uid || undefined,
      }

      if (compExistId) {
        await pb.collection('entrega_comprovantes').update(compExistId, compPayload)
      } else {
        await pb.collection('entrega_comprovantes').create(compPayload)
      }
    } catch (errComp) {
      console.warn('Aviso ao sincronizar entrega_comprovantes no salvarRegistro:', errComp)
    }

    return registroSalvo
  },
}
