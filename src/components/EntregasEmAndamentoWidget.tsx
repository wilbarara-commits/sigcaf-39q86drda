import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Truck,
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle2,
  User,
  Radio,
  ExternalLink,
} from 'lucide-react'
import { useApp } from '@/context/app-context'
import { rotaDespachosService } from '@/services/rota-despachos'
import type { RotaDespachoRecord } from '@/lib/types'

/**
 * Formata um timestamp em texto relativo em pt-BR ("há poucos segundos", "há 2 min", "há 1 h")
 */
function formatRelativeTimePtBR(isoString: string | null | undefined): string {
  if (!isoString) return 'aguardando primeira sincronização'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return 'aguardando primeira sincronização'

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'agora'

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 45) return 'há poucos segundos'
  if (diffSec < 90) return 'há 1 min'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin} min`

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour === 1) return 'há 1 h'
  if (diffHour < 24) return `há ${diffHour} h`

  const diffDays = Math.floor(diffHour / 24)
  if (diffDays === 1) return 'há 1 dia'
  return `há ${diffDays} dias`
}

export function EntregasEmAndamentoWidget() {
  const {
    rotasLogisticas,
    paradasRota,
    schools,
    despachos,
    orders,
    entregaRegistros,
    getEntregaRegistrosDaRota,
    ultimoEventoEntrega,
    chamadas,
    ciclos,
  } = useApp()

  // Mapa de despachos ativos da collection rota_despachos por rota_id
  const [despachosAtivos, setDespachosAtivos] = useState<Record<string, RotaDespachoRecord>>({})
  const [loadingDespachos, setLoadingDespachos] = useState<boolean>(true)

  // Timer para recalcular o rótulo relativo a cada ~30s
  const [relTimerTick, setRelTimerTick] = useState<number>(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setRelTimerTick((t) => t + 1)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Carrega despachos ativos (status 'Em Rota') de cada rota
  useEffect(() => {
    let isMounted = true

    async function carregarDespachosAtivos() {
      try {
        const map: Record<string, RotaDespachoRecord> = {}
        for (const rota of rotasLogisticas) {
          const desp = await rotaDespachosService.getAtivoByRota(rota.id)
          if (desp) {
            map[rota.id] = desp
          }
        }
        if (isMounted) {
          setDespachosAtivos(map)
        }
      } catch (err) {
        console.warn('Erro ao carregar despachos ativos no widget:', err)
      } finally {
        if (isMounted) {
          setLoadingDespachos(false)
        }
      }
    }

    if (rotasLogisticas.length > 0) {
      carregarDespachosAtivos()
    } else {
      setLoadingDespachos(false)
    }

    return () => {
      isMounted = false
    }
  }, [rotasLogisticas])

  // Identifica rotas que estão em andamento:
  // 1. Possui despacho ativo em rota_despachos (via rotaDespachosService.getAtivoByRota)
  // 2. OU possui despacho ativo com status 'Em Rota' em despachos
  // 3. OU possui pedidos com status 'Em Rota' nesta rota
  const rotasEmAndamento = useMemo(() => {
    return rotasLogisticas.filter((rota) => {
      const temRotaDespachoAtivo = Boolean(despachosAtivos[rota.id])
      const temDespachoEmRota = despachos.some(
        (d) =>
          (d.rota_id === rota.id || (d as any).rota_logistica_id === rota.id) &&
          d.status === 'Em Rota',
      )
      const temPedidoEmRota = orders.some(
        (o) => (o.rotaLogisticaId === rota.id || o.rotaId === rota.id) && o.status === 'Em Rota',
      )
      return temRotaDespachoAtivo || temDespachoEmRota || temPedidoEmRota
    })
  }, [rotasLogisticas, despachosAtivos, despachos, orders])

  // Timestamp mais recente para cálculo do tempo relativo de sincronização
  const tempoRelativoUltimaSync = useMemo(() => {
    // Pode usar `relTimerTick` para forçar reavaliação periódica
    void relTimerTick

    // Prioridade 1: último evento realtime recebido pelo contexto
    if (ultimoEventoEntrega) {
      return formatRelativeTimePtBR(ultimoEventoEntrega)
    }

    // Prioridade 2: registro de entrega mais recente em memória
    if (entregaRegistros && entregaRegistros.length > 0) {
      const maisRecente = entregaRegistros[0]
      const t = maisRecente.confirmado_em || maisRecente.chegada_em || maisRecente.created
      if (t) {
        return formatRelativeTimePtBR(t)
      }
    }

    // Se nenhum evento ou registro ainda, texto padrão da especificação
    return 'aguardando primeira sincronização'
  }, [ultimoEventoEntrega, entregaRegistros, relTimerTick])

  // Se não houver rotas em andamento e já terminou a checagem inicial
  if (!loadingDespachos && rotasEmAndamento.length === 0) {
    return (
      <Card className="border-dashed border-border bg-muted/10">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Nenhuma entrega em andamento</p>
              <p className="text-xs text-muted-foreground">
                Não há rotas despachadas no momento. Acompanhe os roteiros em Rotas.
              </p>
            </div>
          </div>
          <ButtonLink />
        </CardContent>
      </Card>
    )
  }

  // Renderiza cada rota em andamento (normalmente 1)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            Entregas em Andamento
          </h2>
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1">
            <Radio className="h-3 w-3 animate-pulse" /> Ao Vivo
          </Badge>
        </div>
        <Link
          to="/rotas"
          className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
        >
          Ver no Mapa <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-3">
        {rotasEmAndamento.map((rota) => {
          const despachoAtivo = despachosAtivos[rota.id]

          // 1. Identificação: Nome/código da rota, chamada, ciclo e motorista
          const chamadaObj =
            chamadas.find((ch) => ch.id === (despachoAtivo?.chamada_id || rota.chamada_id)) || null
          const cicloObj =
            ciclos.find((c) => c.id === (despachoAtivo?.ciclo_id || (rota as any).ciclo_id)) || null
          const motoristaNome =
            despachoAtivo?.expand?.motorista_id?.nome ||
            despachoAtivo?.motorista_id ||
            'Não atribuído'

          const chamadaLabel = chamadaObj ? `Chamada ${chamadaObj.chamada}` : null
          const cicloLabel = cicloObj ? cicloObj.nome : null

          // 2. Paradas da rota ordenadas por ordem
          const paradasCadastradas = paradasRota
            .filter((p) => (p.rota_id || (p as any).rota_logistica_id) === rota.id)
            .sort((a, b) => a.ordem - b.ordem)

          const totalParadas = paradasCadastradas.length

          // Registros de entrega da rota reativamente via contexto global
          const registrosDaRota = getEntregaRegistrosDaRota(rota.id)

          // Conjunto de escolas com entrega confirmada (confirmado_em preenchido, deduplicado por escola_id)
          // Tolera registros sem escola_id correspondente
          const escolasEntreguesIds = new Set<string>()
          for (const reg of registrosDaRota) {
            if (reg.escola_id && reg.confirmado_em) {
              escolasEntreguesIds.add(reg.escola_id)
            }
          }

          // X = nº de escolas da rota com registro de entrega confirmado
          // Interseção com as escolas da rota para garantir que pertencem à rota
          const escolasDaRotaSet = new Set(paradasCadastradas.map((p) => p.escola_id))
          let entregasConfirmadasCount = 0
          for (const escolaId of escolasEntreguesIds) {
            if (escolasDaRotaSet.has(escolaId)) {
              entregasConfirmadasCount++
            }
          }

          // Percentual de progresso
          const progressoPct =
            totalParadas > 0
              ? Math.min(100, Math.round((entregasConfirmadasCount / totalParadas) * 100))
              : 0

          // 4. Próxima parada: a primeira escola da ordem de paradas que ainda NÃO tem entrega confirmada
          const proximaParada = paradasCadastradas.find(
            (p) => !escolasEntreguesIds.has(p.escola_id),
          )
          const proximaEscolaObj = proximaParada
            ? schools.find((s) => s.id === proximaParada.escola_id)
            : null

          const todasConcluidas = totalParadas > 0 && entregasConfirmadasCount >= totalParadas

          return (
            <Link key={rota.id} to="/rotas" className="block group focus:outline-none">
              <Card className="border-l-4 border-l-emerald-500 bg-card hover:shadow-md hover:border-emerald-500/70 transition-all cursor-pointer">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                          <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          Rota {rota.nome}
                        </span>
                        {chamadaLabel && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {chamadaLabel}
                          </Badge>
                        )}
                        {cicloLabel && (
                          <Badge
                            variant="outline"
                            className="text-xs font-normal border-primary/30 text-primary"
                          >
                            {cicloLabel}
                          </Badge>
                        )}
                        <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-[11px] font-semibold border-amber-300 dark:border-amber-800">
                          Em Rota
                        </Badge>
                      </div>

                      {/* Motorista do despacho */}
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
                        <span>
                          Motorista: <strong className="text-foreground">{motoristaNome}</strong>
                        </span>
                      </p>
                    </div>

                    {/* Sincronização em tempo real */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md shrink-0 w-fit">
                      <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{tempoRelativoUltimaSync}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  {/* Barra de Progresso Viva */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Progresso: {entregasConfirmadasCount} de {totalParadas} entregas
                      </span>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {progressoPct}%
                      </span>
                    </div>
                    <Progress value={progressoPct} className="h-2.5 bg-muted" />
                  </div>

                  {/* Próxima Parada ou Rota Concluída */}
                  <div className="pt-2 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-foreground min-w-0">
                      {todasConcluidas ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          <span>Rota concluída — todas as entregas confirmadas</span>
                        </div>
                      ) : proximaParada ? (
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-muted-foreground">Próxima parada:</span>
                          <strong className="text-foreground truncate">
                            #{proximaParada.ordem} —{' '}
                            {proximaEscolaObj?.name || 'Escola não identificada'}
                          </strong>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Sem paradas definidas</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-primary font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                      <span>Acompanhar rota</span>
                      <ExternalLink className="h-3 w-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function ButtonLink() {
  return (
    <Link
      to="/rotas"
      className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 shrink-0"
    >
      Ver Rotas <ArrowRight className="h-3 w-3" />
    </Link>
  )
}
