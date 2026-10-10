import { useState, useEffect, useMemo, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Truck,
  Clock,
  AlertTriangle,
  Volume2,
  VolumeX,
  FileCheck2,
  CheckCircle2,
  ListOrdered,
  Radio,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { useApp } from '@/context/app-context'
import { rotaDespachosService } from '@/services/rota-despachos'
import type {
  CicloRecord,
  RotaDespachoRecord,
  RotaRecord,
  EntregaRegistroRecord,
} from '@/lib/types'
import {
  isDeliveryAudioMuted,
  setDeliveryAudioMuted,
  playDeliveryNotificationSound,
} from '@/lib/deliveryAudio'
import { type DeliveryDetailsData } from '@/components/DeliveryDetailsDialog'

export interface MonitoringDeliveryAlertsProps {
  ciclo: CicloRecord | null
  onOpenDeliveryDetails: (data: DeliveryDetailsData) => void
}

/**
 * Formata duração em minutos para texto relativo em pt-BR
 */
function formatTempoDecorridoMinutos(minutos: number): string {
  if (minutos <= 0) return 'menos de 1 min'
  if (minutos === 1) return '1 min'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const rem = minutos % 60
  if (rem === 0) return h === 1 ? '1 h' : `${h} h`
  return `${h} h ${rem} min`
}

export function MonitoringDeliveryAlerts({
  ciclo,
  onOpenDeliveryDetails,
}: MonitoringDeliveryAlertsProps) {
  const {
    rotasLogisticas,
    paradasRota,
    schools,
    despachos,
    orders,
    entregaRegistros,
    getEntregaRegistrosDaRota,
    ultimoEventoEntrega,
  } = useApp()

  // Controle de som Mute / Unmute
  const [isMuted, setIsMuted] = useState<boolean>(() => isDeliveryAudioMuted())

  const handleToggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    setDeliveryAudioMuted(next)
  }

  // Timer periódico de recálculo (a cada 30 segundos)
  const [timerTick, setTimerTick] = useState<number>(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick((t) => t + 1)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Despachos ativos de cada rota logística
  const [despachosAtivos, setDespachosAtivos] = useState<Record<string, RotaDespachoRecord>>({})
  const [carregandoDespachos, setCarregandoDespachos] = useState<boolean>(true)

  useEffect(() => {
    let isMounted = true

    async function carregarDespachos() {
      try {
        const map: Record<string, RotaDespachoRecord> = {}
        const cicloDatas = ciclo
          ? { data_inicio: ciclo.data_inicio, data_fim: ciclo.data_fim }
          : undefined

        for (const rota of rotasLogisticas) {
          const desp = await rotaDespachosService.getAtivoByRota(rota.id, ciclo?.id, cicloDatas)
          if (desp) {
            map[rota.id] = desp
          }
        }
        if (isMounted) {
          setDespachosAtivos(map)
        }
      } catch (err) {
        console.warn('Erro ao carregar despachos ativos em MonitoringDeliveryAlerts:', err)
      } finally {
        if (isMounted) {
          setCarregandoDespachos(false)
        }
      }
    }

    if (rotasLogisticas.length > 0) {
      carregarDespachos()
    } else {
      setCarregandoDespachos(false)
    }

    // Subscrição em tempo real na coleção rota_despachos:
    // ao receber evento de update/delete com ativo=false do despacho da rota monitorada,
    // limpa o despacho do estado local e recalcula imediatamente (respeitando o ciclo monitorado)
    const unsub = rotaDespachosService.subscribe(({ action, record }) => {
      if (!isMounted) return
      const rotaId = record.rota_id
      if (!rotaId) return

      const targetCicloId = ciclo?.id

      if (action === 'delete' || !record.ativo) {
        setDespachosAtivos((prev) => {
          if (!prev[rotaId]) return prev
          if (targetCicloId && record.ciclo_id && record.ciclo_id !== targetCicloId) {
            return prev
          }
          const next = { ...prev }
          delete next[rotaId]
          return next
        })
      } else if (record.ativo) {
        if (targetCicloId) {
          if (record.ciclo_id === targetCicloId) {
            setDespachosAtivos((prev) => ({
              ...prev,
              [rotaId]: record,
            }))
          } else if (!record.ciclo_id && ciclo?.data_inicio && ciclo?.data_fim) {
            const rawData = record.despachado_em || record.created
            const tRec = rawData ? new Date(rawData).getTime() : 0
            const tIni = new Date(ciclo.data_inicio).getTime()
            const tFim = new Date(ciclo.data_fim).getTime() + 24 * 60 * 60 * 1000
            if (tRec >= tIni && tRec <= tFim) {
              setDespachosAtivos((prev) => ({
                ...prev,
                [rotaId]: record,
              }))
            }
          }
        } else {
          setDespachosAtivos((prev) => ({
            ...prev,
            [rotaId]: record,
          }))
        }
      }
    })

    return () => {
      isMounted = false
      unsub()
    }
  }, [rotasLogisticas, ciclo?.id, ciclo?.data_inicio, ciclo?.data_fim])

  // Identifica rotas despachadas com status "Em Rota" (ou equivalente em andamento) do ciclo monitorado
  const rotasEmAndamentoDoCiclo = useMemo(() => {
    if (!ciclo) return []

    const tCicloIni = ciclo.data_inicio ? new Date(ciclo.data_inicio).getTime() : null
    const tCicloFim = ciclo.data_fim
      ? new Date(ciclo.data_fim).getTime() + 24 * 60 * 60 * 1000
      : null

    return rotasLogisticas.filter((rota) => {
      const despachoAtivo = despachosAtivos[rota.id]

      // 1. Despacho ativo na collection rota_despachos (isolado por ciclo)
      if (despachoAtivo) {
        if (despachoAtivo.ciclo_id && despachoAtivo.ciclo_id === ciclo.id) return true
        // Para registros legados sem ciclo_id, verificar chamada e janela temporal
        if (
          !despachoAtivo.ciclo_id &&
          ciclo.chamada_id &&
          despachoAtivo.chamada_id === ciclo.chamada_id
        ) {
          if (tCicloIni && tCicloFim) {
            const rawData = despachoAtivo.despachado_em || despachoAtivo.created
            const tD = rawData ? new Date(rawData).getTime() : 0
            if (tD >= tCicloIni && tD <= tCicloFim) return true
          }
        }
      }

      // 2. Despacho na collection legada despachos com status 'Em Rota'
      const temDespachoEmRota = despachos.some((d) => {
        if (d.status !== 'Em Rota') return false
        const rotaCasa = d.rota_id === rota.id || (d as any).rota_logistica_id === rota.id
        if (!rotaCasa) return false
        if (d.ciclo_id && d.ciclo_id === ciclo.id) return true
        if (!d.ciclo_id && ciclo.chamada_id && d.chamada_id === ciclo.chamada_id) {
          if (tCicloIni && tCicloFim) {
            const rawData = d.data_despacho || d.created
            const tD = rawData ? new Date(rawData).getTime() : 0
            return tD >= tCicloIni && tD <= tCicloFim
          }
        }
        return false
      })
      if (temDespachoEmRota) return true

      // 3. Pedidos do ciclo com status 'Em Rota' nesta rota
      const temPedidoEmRota = orders.some(
        (o) =>
          o.cicloId === ciclo.id &&
          (o.rotaLogisticaId === rota.id || o.rotaId === rota.id) &&
          o.status === 'Em Rota',
      )
      if (temPedidoEmRota) return true

      return false
    })
  }, [ciclo, rotasLogisticas, despachosAtivos, despachos, orders])

  // AVISO SONORO: dispara som curto quando um NOVO registro de entrega confirmada chega via realtime
  // Não toca na carga inicial (isInitialLoadRef) e não repete para o mesmo ID/client_uid
  const isInitialLoadRef = useRef(true)
  const processedRecordsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Na primeira execução / montagem, registrar os IDs existentes sem tocar som
    if (isInitialLoadRef.current) {
      entregaRegistros.forEach((r) => {
        if (r.id) processedRecordsRef.current.add(r.id)
        if (r.client_uid) processedRecordsRef.current.add(r.client_uid)
      })
      isInitialLoadRef.current = false
      return
    }

    // Se houver novos registros chegando após a montagem
    let hasNewConfirmedDelivery = false
    const rotasEmAndamentoIds = new Set(rotasEmAndamentoDoCiclo.map((r) => r.id))

    const tCicloIni = ciclo?.data_inicio ? new Date(ciclo.data_inicio).getTime() : null
    const tCicloFim = ciclo?.data_fim
      ? new Date(ciclo.data_fim).getTime() + 24 * 60 * 60 * 1000
      : null

    for (const r of entregaRegistros) {
      const chaveId = r.id
      const chaveUid = r.client_uid

      const jaProcessado =
        (chaveId && processedRecordsRef.current.has(chaveId)) ||
        (chaveUid && processedRecordsRef.current.has(chaveUid))

      if (!jaProcessado) {
        if (chaveId) processedRecordsRef.current.add(chaveId)
        if (chaveUid) processedRecordsRef.current.add(chaveUid)

        // Se o registro pertence a uma rota do ciclo em andamento e possui confirmação
        if (r.confirmado_em && r.rota_id && rotasEmAndamentoIds.has(r.rota_id)) {
          // Validação estrita de pertencimento ao ciclo selecionado
          let pertenceAoCiclo = false
          if (ciclo?.id) {
            if (r.ciclo_id) {
              pertenceAoCiclo = r.ciclo_id === ciclo.id
            } else if (tCicloIni && tCicloFim) {
              // Registro legado sem ciclo_id: validação na janela data_inicio a data_fim + 24h
              const rawData = r.confirmado_em || (r as any).created
              const tRec = rawData ? new Date(rawData).getTime() : 0
              pertenceAoCiclo = tRec >= tCicloIni && tRec <= tCicloFim
            }
          } else {
            pertenceAoCiclo = true
          }

          if (pertenceAoCiclo) {
            hasNewConfirmedDelivery = true
          }
        }
      }
    }

    if (hasNewConfirmedDelivery) {
      playDeliveryNotificationSound()
    }
  }, [
    entregaRegistros,
    rotasEmAndamentoDoCiclo,
    ultimoEventoEntrega,
    ciclo?.id,
    ciclo?.data_inicio,
    ciclo?.data_fim,
  ])

  // Análise detalhada de cada rota em andamento
  const analiseRotas = useMemo(() => {
    // Força dependência do timer periódico para atualizar contagem de minutos a cada 30s
    void timerTick

    const agora = Date.now()

    return rotasEmAndamentoDoCiclo.map((rota) => {
      const despachoAtivo = despachosAtivos[rota.id]
      const motoristaNome =
        despachoAtivo?.expand?.motorista_id?.nome ||
        (despachoAtivo as any)?.motorista_nome ||
        'Não atribuído'

      // Paradas cadastradas da rota ordenadas pela sequência oficial
      const paradasCadastradas = paradasRota
        .filter((p) => (p.rota_id || (p as any).rota_logistica_id) === rota.id)
        .sort((a, b) => a.ordem - b.ordem)

      // Registros deduplicados da rota (do contexto) estritamente pelo ciclo selecionado
      const rawRegistros = ciclo?.id
        ? getEntregaRegistrosDaRota(rota.id, ciclo.id)
        : getEntregaRegistrosDaRota(rota.id)

      // Filtro defensivo: manter apenas registros do ciclo selecionado
      // Se tiver ciclo_id, deve ser idêntico ao ciclo.id.
      // Se for registro legado sem ciclo_id, aceitar apenas se confirmado_em / created estiver na janela data_inicio a data_fim + 24h
      const tCicloIni = ciclo?.data_inicio ? new Date(ciclo.data_inicio).getTime() : null
      const tCicloFim = ciclo?.data_fim
        ? new Date(ciclo.data_fim).getTime() + 24 * 60 * 60 * 1000
        : null

      const registrosDeduplicados = rawRegistros.filter((reg) => {
        if (!ciclo?.id) return true
        if (reg.ciclo_id) {
          return reg.ciclo_id === ciclo.id
        }
        // Legado sem ciclo_id
        if (tCicloIni && tCicloFim) {
          const rawData = reg.confirmado_em || (reg as any).created
          const tReg = rawData ? new Date(rawData).getTime() : 0
          return tReg >= tCicloIni && tReg <= tCicloFim
        }
        return false
      })

      // Regra anti-vazamento: se existem pedidos da rota com cicloId === ciclo.id e status "Em Rota"
      // e nenhuma entrega confirmada no ciclo, então entregasFeitas = 0 e paradas pendentes = todas.
      const pedidosDaRotaNoCiclo = ciclo?.id
        ? orders.filter(
            (o) =>
              o.cicloId === ciclo.id && (o.rotaLogisticaId === rota.id || o.rotaId === rota.id),
          )
        : []
      const temPedidosEmRota = pedidosDaRotaNoCiclo.some((o) => o.status === 'Em Rota')

      // Entregas confirmadas válidas no ciclo para escolas da rota
      const temEntregaConfirmadaNoCiclo = registrosDeduplicados.some((r) =>
        Boolean(r.confirmado_em && r.confirmado_em.trim() !== ''),
      )

      const aplicarRegraAntiVazamento = temPedidosEmRota && !temEntregaConfirmadaNoCiclo

      // Mapa de confirmações indexado pelo ID do banco da escola (nunca por nome)
      const registrosPorEscolaId = new Map<string, EntregaRegistroRecord>()
      if (!aplicarRegraAntiVazamento) {
        registrosDeduplicados.forEach((reg) => {
          if (reg.escola_id && reg.confirmado_em) {
            registrosPorEscolaId.set(reg.escola_id, reg)
          }
        })
      }

      // Cálculo de sincronização e alerta de "Rota parada" (> 30 minutos)
      // Base de cálculo: horário da última entrega confirmada da rota (o registro mais recente).
      // Se nenhuma entrega chegou ainda, base = horário do despacho (despachado_em ou created do despacho).
      let baseCalculoTimestamp: number | null = null
      let baseOrigem: 'entrega' | 'despacho' = 'despacho'
      let ultimaEntregaRegistro: EntregaRegistroRecord | null = null

      // Busca o registro com confirmação mais recente
      if (registrosDeduplicados.length > 0) {
        const confirmados = registrosDeduplicados
          .filter((r) => Boolean(r.confirmado_em))
          .sort((a, b) => {
            const tA = new Date(a.confirmado_em || 0).getTime()
            const tB = new Date(b.confirmado_em || 0).getTime()
            return tB - tA
          })

        if (confirmados.length > 0) {
          ultimaEntregaRegistro = confirmados[0]
          const t = new Date(ultimaEntregaRegistro.confirmado_em!).getTime()
          if (!isNaN(t)) {
            baseCalculoTimestamp = t
            baseOrigem = 'entrega'
          }
        }
      }

      if (baseCalculoTimestamp === null) {
        // Fallback: horário do despacho
        const tDespacho = despachoAtivo?.despachado_em || despachoAtivo?.created
        if (tDespacho) {
          const t = new Date(tDespacho).getTime()
          if (!isNaN(t)) {
            baseCalculoTimestamp = t
            baseOrigem = 'despacho'
          }
        }
      }

      // Minutos decorridos desde a última sincronização/despacho
      const minutosSemSync =
        baseCalculoTimestamp !== null
          ? Math.max(0, Math.floor((agora - baseCalculoTimestamp) / 60000))
          : 0

      // Alerta rota parada: quando o motorista está sem sincronizar há mais de 30 MINUTOS
      // Limite exato definido pelo usuário: 30 min (gravidade de alerta real)
      const isRotaParada = minutosSemSync > 30

      // Paradas pendentes: escolas da rota ainda não entregues, na ordem da rota
      const paradasPendentes = paradasCadastradas
        .filter((parada) => !registrosPorEscolaId.has(parada.escola_id))
        .map((parada) => {
          const escolaObj = schools.find((s) => s.id === parada.escola_id)
          return {
            paradaId: parada.id,
            escolaId: parada.escola_id,
            escolaNome: escolaObj?.name || 'Escola não identificada',
            escolaEndereco: escolaObj?.address,
            ordem: parada.ordem,
          }
        })

      const totalParadas = paradasCadastradas.length
      const entregasFeitas = totalParadas - paradasPendentes.length

      // Alerta entrega sem assinatura: escolas cuja entrega foi confirmada SEM assinatura
      // Itens "sem foto" e "sem nome do responsável" NÃO entram por especificação explícita
      const entregasSemAssinatura = paradasCadastradas
        .map((parada) => {
          const reg = registrosPorEscolaId.get(parada.escola_id)
          if (!reg) return null
          const temAssinatura = Boolean(reg.assinatura && reg.assinatura.trim())
          if (temAssinatura) return null

          const escolaObj = schools.find((s) => s.id === parada.escola_id)
          return {
            paradaId: parada.id,
            escolaId: parada.escola_id,
            escolaNome: escolaObj?.name || 'Escola não identificada',
            escolaEndereco: escolaObj?.address,
            ordem: parada.ordem,
            registro: reg,
            motoristaNome,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      return {
        rota,
        despachoAtivo,
        motoristaNome,
        totalParadas,
        entregasFeitas,
        paradasPendentes,
        minutosSemSync,
        isRotaParada,
        baseOrigem,
        entregasSemAssinatura,
      }
    })
  }, [
    timerTick,
    rotasEmAndamentoDoCiclo,
    despachosAtivos,
    paradasRota,
    ciclo,
    orders,
    getEntregaRegistrosDaRota,
    schools,
  ])

  // Contagem agregada de alertas da fase de entrega
  const contadoresAlertas = useMemo(() => {
    let rotasParadasCount = 0
    let paradasPendentesCount = 0
    let entregasSemAssinaturaCount = 0

    analiseRotas.forEach((r) => {
      if (r.isRotaParada) rotasParadasCount++
      paradasPendentesCount += r.paradasPendentes.length
      entregasSemAssinaturaCount += r.entregasSemAssinatura.length
    })

    return {
      rotasParadasCount,
      paradasPendentesCount,
      entregasSemAssinaturaCount,
      totalAlertas: rotasParadasCount + entregasSemAssinaturaCount,
    }
  }, [analiseRotas])

  // Se o ciclo não possui rota despachada em andamento e terminou o loading
  if (!carregandoDespachos && rotasEmAndamentoDoCiclo.length === 0) {
    return null
  }

  return (
    <Card className="border-l-4 border-l-amber-500 shadow-xs">
      <CardHeader className="p-4 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                Alertas da Fase de Entrega
              </CardTitle>
              <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-xs font-semibold border-amber-300 dark:border-amber-800">
                Rotas em Andamento ({rotasEmAndamentoDoCiclo.length})
              </Badge>
              <Badge className="bg-emerald-600 text-white text-[10px] font-semibold gap-1">
                <Radio className="h-3 w-3 animate-pulse" /> Ao Vivo
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Monitoramento ativo de sincronização, paradas pendentes e entregas sem assinatura com
              atualização em tempo real.
            </CardDescription>
          </div>

          {/* Botão de MUTE e resumo de badges */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleMute}
              className={`h-8 px-2.5 text-xs gap-1.5 font-medium transition ${
                isMuted
                  ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                  : 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50'
              }`}
              title={
                isMuted
                  ? 'Aviso sonoro desativado (clique para ativar o som de nova entrega)'
                  : 'Aviso sonoro ativo (clique para silenciar notificações de entrega)'
              }
            >
              {isMuted ? (
                <>
                  <VolumeX className="h-4 w-4" />
                  <span>Som Desativado</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4" />
                  <span>Som Ativo</span>
                </>
              )}
            </Button>

            {contadoresAlertas.rotasParadasCount > 0 && (
              <Badge variant="destructive" className="text-xs font-semibold animate-pulse gap-1">
                <span>⚠️</span>
                <span>{contadoresAlertas.rotasParadasCount} rota(s) parada(s)</span>
              </Badge>
            )}
            {contadoresAlertas.entregasSemAssinaturaCount > 0 && (
              <Badge className="bg-amber-600 text-white text-xs font-semibold">
                {contadoresAlertas.entregasSemAssinaturaCount} sem assinatura
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-1 space-y-4">
        {analiseRotas.map((item) => {
          const {
            rota,
            motoristaNome,
            totalParadas,
            entregasFeitas,
            paradasPendentes,
            minutosSemSync,
            isRotaParada,
            baseOrigem,
            entregasSemAssinatura,
          } = item

          return (
            <div
              key={rota.id}
              className="p-3.5 bg-muted/20 border rounded-lg space-y-3 transition-colors"
            >
              {/* Topo do card da Rota */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Rota {rota.nome}
                    </span>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Motorista: <strong className="ml-1 text-foreground">{motoristaNome}</strong>
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      • {entregasFeitas} de {totalParadas} entregas realizadas
                    </span>
                  </div>
                </div>

                {/* Sincronização / Alerta Rota Parada */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isRotaParada ? (
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-destructive text-destructive-foreground animate-pulse shadow-2xs"
                      title="Alerta crítico: motorista sem sincronizar há mais de 30 minutos!"
                    >
                      <span
                        className="text-sm leading-none"
                        role="img"
                        aria-label="Alerta rota parada"
                      >
                        ⚠️
                      </span>
                      <span>
                        Rota parada: sem sincronizar há{' '}
                        {formatTempoDecorridoMinutos(minutosSemSync)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground border"
                      title={
                        baseOrigem === 'entrega'
                          ? 'Última entrega sincronizada'
                          : 'Horário do despacho'
                      }
                    >
                      <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Última sync há {formatTempoDecorridoMinutos(minutosSemSync)} (
                        {baseOrigem === 'entrega' ? 'última entrega' : 'despacho'})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bloco de Alertas Específicos da Rota */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                {/* 1. Alerta "Paradas Pendentes" */}
                <div className="p-3 bg-card border rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      <span
                        className="text-base leading-none"
                        role="img"
                        aria-label="Paradas pendentes"
                      >
                        📍
                      </span>
                      <span>Paradas Pendentes</span>
                    </div>
                    <Badge variant="outline" className="text-[11px] font-semibold text-amber-700">
                      Faltam {paradasPendentes.length} de {totalParadas}
                    </Badge>
                  </div>
                  {paradasPendentes.length === 0 ? (
                    <div className="py-2 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Todas as escolas desta rota já foram entregues!</span>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {paradasPendentes.map((p) => (
                        <div
                          key={p.escolaId}
                          className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/40 text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-white text-[9px] font-bold shrink-0">
                              {p.ordem}
                            </span>
                            <span className="font-semibold text-foreground truncate">
                              {p.escolaNome}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[9px] shrink-0 font-mono">
                            Pendente
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Alerta "Entrega sem Assinatura" */}
                <div className="p-3 bg-card border rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      <FileCheck2 className="h-4 w-4 text-destructive" />
                      <span>Entrega sem Assinatura</span>
                    </div>
                    <Badge
                      variant={entregasSemAssinatura.length > 0 ? 'destructive' : 'outline'}
                      className="text-[11px] font-semibold"
                    >
                      {entregasSemAssinatura.length} pendência(s)
                    </Badge>
                  </div>

                  {entregasSemAssinatura.length === 0 ? (
                    <div className="py-2 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>
                        Nenhuma pendência: todas as entregas confirmadas possuem assinatura.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {entregasSemAssinatura.map((itemSemAssinatura) => {
                        const horaConf = itemSemAssinatura.registro.confirmado_em
                          ? new Date(itemSemAssinatura.registro.confirmado_em).toLocaleTimeString(
                              'pt-BR',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )
                          : '—'

                        return (
                          <button
                            key={itemSemAssinatura.escolaId}
                            type="button"
                            onClick={() =>
                              onOpenDeliveryDetails({
                                registro: itemSemAssinatura.registro,
                                escolaNome: itemSemAssinatura.escolaNome,
                                escolaEndereco: itemSemAssinatura.escolaEndereco,
                                motoristaNome: itemSemAssinatura.motoristaNome,
                                ordem: itemSemAssinatura.ordem,
                              })
                            }
                            className="w-full text-left flex items-center justify-between gap-2 p-1.5 rounded-md border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition cursor-pointer group"
                            title="Clique para abrir os Dados da Entrega"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-white text-[9px] font-bold shrink-0">
                                {itemSemAssinatura.ordem}
                              </span>
                              <div className="min-w-0">
                                <span className="font-semibold text-foreground truncate block group-hover:text-primary transition-colors">
                                  {itemSemAssinatura.escolaNome}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  Confirmada às {horaConf} • Sem assinatura
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-primary font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                              <span>Ver Dados</span>
                              <ChevronRight className="h-3 w-3" />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
