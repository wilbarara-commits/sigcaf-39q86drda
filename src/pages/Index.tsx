import { useMemo } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingCart,
  FileText,
  Truck,
  CheckCircle2,
  ArrowRight,
  Clock,
  School,
  Sprout,
  Loader2,
  PackageCheck,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
  BadgeCheck,
  ShoppingBasket,
  FileSignature,
  Megaphone,
  CalendarRange,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { MonthlyReportButton } from '@/components/MonthlyReportButton'
import { EntregasEmAndamentoWidget } from '@/components/EntregasEmAndamentoWidget'
import {
  formatIntervaloCiclo,
  formatDespachoAmigavel,
  getDespachoEfetivoCiclo,
  isCicloNaoTerminal,
  formatFaseAmigavel,
  getCiclosAtivosPorChamada,
} from '@/lib/cicloUtils'

export default function Index() {
  const {
    orders,
    contracts,
    contractItems,
    contractSchools,
    atestos,
    ciclos,
    chamadas,
    activeCiclo,
    isLoading,
    cicloCorrente,
    setCicloCorrente,
  } = useApp()

  const activeContracts = contracts.filter((c) => c.status === 'Ativo').length
  const chamadasAtivas = useMemo(() => {
    return chamadas.filter((ch) => ch.status === 'Ativo')
  }, [chamadas])

  // Mapa de ciclos indexado por ID para resolução rápida de datas de entrega/despacho
  const ciclosMap = useMemo(() => {
    const map = new Map<string, (typeof ciclos)[0]>()
    for (const c of ciclos) {
      if (c.id) map.set(c.id, c)
    }
    return map
  }, [ciclos])

  // Receita Entregue e Previsto do Mês (v0.0.246):
  // Elimina oscilação semanal do percentual (100% -> 50% -> 100%):
  // - Numerador: pedidos "Entregue" cuja data de entrega (entregue_em) cai no mês corrente.
  // - Denominador ("Total previsto do mês"): numerador + pedidos NÃO entregues ("Pendente" ou "Em Rota")
  //   cujo CICLO tem data de entrega prevista dentro do mês corrente (não pela data de criação do pedido).
  // Deduplicação por pedido (0.0.214), cancelados fora, cap em 100%.
  const { receitaEntregueMes, receitaPrevistaMes, percentEntregue, currentMonthName } =
    useMemo(() => {
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth() // 0-indexed

      const monthNames = [
        'Janeiro',
        'Fevereiro',
        'Março',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro',
      ]
      const curMonthName = `${monthNames[currentMonth]} de ${currentYear}`

      // Resolução canônica de valor do pedido (mesmo modelo de Reports.tsx e MonthlyReportButton.tsx)
      const obterValorPedidoCanonico = (order: (typeof orders)[0]): number => {
        const recordedTotal = Number(order.total)
        if (!isNaN(recordedTotal) && recordedTotal > 0) {
          return recordedTotal
        }

        // Fallback = soma dos itens do próprio pedido sem re-consultar contratos
        if (order.items && order.items.length > 0) {
          const somaItens = order.items.reduce((acc, it) => {
            const qtd = Number(it.quantity) || 0
            const preco = Number(it.price) || 0
            return acc + qtd * preco
          }, 0)
          return Math.round(somaItens * 100) / 100
        }

        return 0
      }

      let entregueTotal = 0
      let pendentePrevistoTotal = 0
      const seenOrderIds = new Set<string>()

      for (const order of orders) {
        if (!order.id || seenOrderIds.has(order.id)) continue
        seenOrderIds.add(order.id)

        if (order.status === 'Cancelado') continue

        if (order.status === 'Entregue') {
          // Pedido Entregue: verifica se a data de entrega (entregue_em) cai no mês corrente
          const rawDateStr = order.entregue_em || order.date || ''
          if (!rawDateStr) continue
          const orderDate = new Date(rawDateStr)
          if (isNaN(orderDate.getTime())) continue

          const isInCurrentMonth =
            orderDate.getFullYear() === currentYear && orderDate.getMonth() === currentMonth

          if (isInCurrentMonth) {
            entregueTotal += obterValorPedidoCanonico(order)
          }
        } else if (order.status === 'Pendente' || order.status === 'Em Rota') {
          // Pedidos ainda NÃO entregues: elegíveis para o previsto se o CICLO entrega no mês corrente
          if (!order.cicloId) continue
          const ciclo = ciclosMap.get(order.cicloId)
          if (!ciclo) continue

          const dataDespacho = getDespachoEfetivoCiclo(ciclo)
          if (isNaN(dataDespacho.getTime())) continue

          const isCicloInCurrentMonth =
            dataDespacho.getFullYear() === currentYear && dataDespacho.getMonth() === currentMonth

          if (isCicloInCurrentMonth) {
            pendentePrevistoTotal += obterValorPedidoCanonico(order)
          }
        }
      }

      const previstoTotal = entregueTotal + pendentePrevistoTotal
      const rawPct = previstoTotal > 0 ? (entregueTotal / previstoTotal) * 100 : 0
      // O percentual exibido nunca passa de 100%; se por dado legado passar, capar em 100%
      const pct = Math.min(100, Math.max(0, rawPct))

      return {
        receitaEntregueMes: entregueTotal,
        receitaPrevistaMes: previstoTotal,
        percentEntregue: pct,
        currentMonthName: curMonthName,
      }
    }, [orders, ciclosMap])

  const formattedReceitaEntregue = receitaEntregueMes.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const formattedReceitaPrevista = receitaPrevistaMes.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const formattedPercent = `${percentEntregue.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`

  // Ciclos ativos por chamada (todos os ciclos não-terminais ativos em suas respectivas chamadas)
  const activeCiclosList = useMemo(() => {
    const mapPorChamada = getCiclosAtivosPorChamada(ciclos)
    const ativosChamadas = Object.values(mapPorChamada)

    // Se houver ciclos sem chamada_id mas não-terminais, garantir que apareçam
    const idsJaIncluidos = new Set(ativosChamadas.map((c: any) => c.id))
    const naoTerminaisGerais = ciclos.filter(
      (c) => isCicloNaoTerminal(c.status) && !idsJaIncluidos.has(c.id),
    )

    // Se nenhum ciclo com chamada foi encontrado, mas houver activeCiclo, incluir activeCiclo
    if (ativosChamadas.length === 0 && activeCiclo && !idsJaIncluidos.has(activeCiclo.id)) {
      naoTerminaisGerais.unshift(activeCiclo)
      idsJaIncluidos.add(activeCiclo.id)
    }

    const todos = [...ativosChamadas, ...naoTerminaisGerais]

    // Ordenar por data mais recente
    return todos.sort((a, b) => {
      const tA = new Date(a.created || a.data_inicio || 0).getTime()
      const tB = new Date(b.created || b.data_inicio || 0).getTime()
      return tB - tA
    })
  }, [ciclos, activeCiclo])

  // Indicador de Chamadas ativas e status de ciclo em andamento
  const chamadasAtivasStats = useMemo(() => {
    const chamadasComCiclo = new Set<string>()
    for (const c of activeCiclosList) {
      if (c.chamada_id) {
        chamadasComCiclo.add(c.chamada_id)
      }
    }

    const total = chamadasAtivas.length
    const comCiclo = chamadasAtivas.filter((ch) => chamadasComCiclo.has(ch.id)).length
    const semCiclo = total - comCiclo

    return {
      total,
      comCiclo,
      semCiclo,
      chamadasComCiclo,
    }
  }, [chamadasAtivas, activeCiclosList])

  // Métricas enriquecidas por ciclo (pedidos, escolas com pedidos, entregas concluídas, volume e valor)
  const cicloMetricsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        pedidosCount: number
        escolasCount: number
        entregasConcluidasCount: number
        volumeTotal: number
        valorTotal: number
      }
    >()

    for (const c of activeCiclosList) {
      const cOrders = orders.filter((o) => o.cicloId === c.id && o.status !== 'Cancelado')
      const escolasIds = new Set(cOrders.map((o) => o.schoolId))
      // Escolas efetivamente com status "Entregue" NO ciclo (deduplicadas por escola_id)
      const escolasEntreguesIds = new Set(
        cOrders.filter((o) => o.status === 'Entregue').map((o) => o.schoolId),
      )
      const volume = cOrders.reduce(
        (acc, o) => acc + (o.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
        0,
      )
      const valor = cOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0)

      map.set(c.id, {
        pedidosCount: cOrders.length,
        escolasCount: escolasIds.size,
        entregasConcluidasCount: escolasEntreguesIds.size,
        volumeTotal: volume,
        valorTotal: valor,
      })
    }

    return map
  }, [activeCiclosList, orders])

  // Pedidos Pendentes e Pedidos em Rota com isolamento por ciclos ativos (anti-vazamento)
  const { pendingOrders, ordersEmRota } = useMemo(() => {
    const activeCicloIds = new Set(activeCiclosList.map((c) => c.id))
    const pendentes = orders.filter(
      (o) => o.status === 'Pendente' && (!o.cicloId || activeCicloIds.has(o.cicloId)),
    ).length
    const emRota = orders.filter(
      (o) => o.status === 'Em Rota' && (!o.cicloId || activeCicloIds.has(o.cicloId)),
    ).length

    return {
      pendingOrders: pendentes,
      ordersEmRota: emRota,
    }
  }, [orders, activeCiclosList])

  const metrics = [
    {
      title: 'Pedidos Pendentes',
      value: pendingOrders,
      icon: ShoppingBasket,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Pedidos em Rota',
      value: ordersEmRota,
      subtext: ordersEmRota > 0 ? 'Despachados / em trânsito' : 'Nenhum pedido em trânsito',
      badge: ordersEmRota > 0 ? `${ordersEmRota} em rota` : undefined,
      icon: Truck,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      linkTo: '/rotas',
    },
    {
      title: 'Contratos Ativos',
      value: activeContracts,
      icon: FileSignature,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Chamadas Ativas',
      value: chamadasAtivasStats.total,
      subtext: `${chamadasAtivasStats.comCiclo} com ciclo em andamento • ${chamadasAtivasStats.semCiclo} sem ciclo`,
      badge:
        chamadasAtivasStats.comCiclo > 0 ? `${chamadasAtivasStats.comCiclo} em ciclo` : undefined,
      icon: Megaphone,
      color: 'text-primary',
      bg: 'bg-primary/10',
      linkTo: '/chamadas',
    },
    {
      title: 'Receita Entregue do Mês',
      value: formattedReceitaEntregue,
      subtext: `${formattedPercent} do previsto do mês (${formattedReceitaPrevista})`,
      badge: formattedPercent,
      icon: PackageCheck,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
  ]

  // Recent activity feed dynamically assembled from real database records
  const dynamicActivities: Array<{
    title: string
    desc: string
    time: string
    emoji: string
    color: string
  }> = []
  if (atestos.length > 0) {
    const latestAtesto = atestos[0]
    dynamicActivities.push({
      title: `Atesto Gerado (${latestAtesto.numero || 'AT'})`,
      desc: latestAtesto.schoolName,
      time: new Date(latestAtesto.date).toLocaleDateString('pt-BR'),
      emoji: '📜',
      color: 'text-primary',
    })
  }
  if (orders.length > 0) {
    const latestOrder = orders[0]
    dynamicActivities.push({
      title: `Novo Pedido (${latestOrder.numero || 'ORD'})`,
      desc: `${latestOrder.schoolName} — R$ ${latestOrder.total.toFixed(2)}`,
      time: new Date(latestOrder.date).toLocaleDateString('pt-BR'),
      emoji: '📋',
      color: 'text-secondary',
    })
  }
  dynamicActivities.push({
    title: 'Catálogo Conectado',
    desc: 'PocketBase Skip Cloud ativo',
    time: 'Hoje',
    emoji: '🌱',
    color: 'text-blue-500',
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Resumo das atividades da cooperativa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MonthlyReportButton variant="outline" size="default" />
          <Button
            asChild
            variant="outline"
            className="h-auto py-1.5 px-3 hover:border-primary/40 group"
          >
            <Link to="/atestos" className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-all group-hover:scale-105 group-hover:border group-hover:border-primary/40 shrink-0">
                <span className="text-2xl leading-none" role="img" aria-label="Emitir Atesto">
                  📜
                </span>
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm leading-tight text-foreground">
                  Emitir Atesto
                </div>
                <div className="text-[11px] text-muted-foreground font-normal">
                  Comprovante de entrega
                </div>
              </div>
            </Link>
          </Button>
          <Button asChild className="h-auto py-1.5 px-3 group">
            <Link to="/pedidos" className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/20 text-primary-foreground dark:text-primary flex items-center justify-center transition-all group-hover:scale-105 group-hover:border group-hover:border-primary/40 shrink-0">
                <span className="text-2xl leading-none" role="img" aria-label="Novo Pedido">
                  📋
                </span>
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm leading-tight">Novo Pedido</div>
                <div className="text-[11px] opacity-80 font-normal">Lançar no ciclo ativo</div>
              </div>
            </Link>
          </Button>
        </div>
      </div>

      {/* Widget de Entregas em Andamento em Tempo Real (Bloco 3) */}
      <EntregasEmAndamentoWidget />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m) => {
          const content = (
            <Card
              key={m.title}
              className={`hover:shadow-md transition-all ${
                m.linkTo ? 'cursor-pointer hover:border-primary/50 group' : ''
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  {m.title}
                  {m.linkTo && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </CardTitle>
                <div
                  className={`h-12 w-12 rounded-xl ${m.bg || 'bg-primary/10'} ${m.color || 'text-primary'} flex items-center justify-center transition-all hover:scale-105 hover:border hover:border-primary/40 shrink-0`}
                >
                  <m.icon className="h-6 w-6 stroke-[1.8]" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xl font-bold">{m.value}</span>
                      {m.badge && (
                        <Badge
                          variant="secondary"
                          className={
                            m.title === 'Chamadas Ativas'
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-semibold text-xs px-2 py-0.5'
                              : m.title === 'Pedidos em Rota'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold text-xs px-2 py-0.5'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-xs px-2 py-0.5'
                          }
                        >
                          {m.badge}
                        </Badge>
                      )}
                    </div>
                    {m.subtext && (
                      <p className="text-xs text-muted-foreground line-clamp-1" title={m.subtext}>
                        {m.subtext}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )

          return m.linkTo ? (
            <Link key={m.title} to={m.linkTo} className="block focus:outline-none">
              {content}
            </Link>
          ) : (
            <div key={m.title}>{content}</div>
          )
        })}
      </div>

      {/* Seção de Ciclos Operacionais Ativos (um por chamada) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-all hover:scale-105 hover:border hover:border-primary/40 shrink-0">
              <CalendarRange className="h-6 w-6 stroke-[1.8]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Ciclos Operacionais Ativos</h2>
                <Badge variant="secondary" className="font-semibold text-xs">
                  {activeCiclosList.length}{' '}
                  {activeCiclosList.length === 1 ? 'ciclo em andamento' : 'ciclos em andamento'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Ciclos em andamento por chamada pública
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="text-xs text-primary gap-1">
              <Link
                to={
                  cicloCorrente?.cicloId
                    ? `/monitoramento?cicloId=${cicloCorrente.cicloId}${
                        cicloCorrente.chamadaId ? `&chamadaId=${cicloCorrente.chamadaId}` : ''
                      }`
                    : '/monitoramento'
                }
              >
                Painel de Monitoramento <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {activeCiclosList.length === 0 ? (
          <Card className="border-l-4 border-l-muted-foreground/30 bg-muted/20">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="font-semibold text-sm text-foreground">
                  Nenhum ciclo ativo no momento
                </span>
                <p className="text-xs text-muted-foreground">
                  Abra um novo ciclo pelo Monitoramento ou Histórico para iniciar a coleta semanal
                  das chamadas públicas.
                </p>
              </div>
              <Button asChild size="sm">
                <Link to="/monitoramento">Abrir Ciclo</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div
            className={`grid gap-4 ${
              activeCiclosList.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {activeCiclosList.map((ciclo) => {
              const ch =
                ciclo.expand?.chamada_id || chamadas.find((c) => c.id === ciclo.chamada_id) || null
              const metricsCiclo = cicloMetricsMap.get(ciclo.id) || {
                pedidosCount: 0,
                escolasCount: 0,
                entregasConcluidasCount: 0,
                volumeTotal: 0,
                valorTotal: 0,
              }
              const faseAmigavel = formatFaseAmigavel(ciclo.status)
              const despachoDate = getDespachoEfetivoCiclo(ciclo)
              const rotuloChamada = ch?.chamada ? `[${ch.chamada}]` : '[Geral]'
              const tipoChamada = ch?.dependencia_administrativa || ch?.programa || ''

              return (
                <Card
                  key={ciclo.id}
                  className="border-l-4 border-l-primary bg-card hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base text-foreground">
                            {ciclo.nome} {rotuloChamada}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[11px] border-primary/30 text-primary bg-primary/5 font-semibold"
                          >
                            Fase: {faseAmigavel}
                          </Badge>
                          {tipoChamada && (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {ch?.chamada} • {tipoChamada}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Período: {formatIntervaloCiclo(ciclo.data_inicio, ciclo.data_fim)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-md text-xs font-medium shrink-0">
                        <Truck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Despacho: {formatDespachoAmigavel(despachoDate, true)}</span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    {/* Indicadores do Ciclo: Pedidos, Escolas com Pedidos, Entregas Concluídas, Volume, Valor */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t">
                      <div className="bg-muted/40 rounded p-2 text-center">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Pedidos
                        </span>
                        <span className="text-lg font-bold text-foreground">
                          {metricsCiclo.pedidosCount}
                        </span>
                      </div>
                      <div className="bg-muted/40 rounded p-2 text-center">
                        <span
                          className="text-[10px] uppercase font-semibold text-muted-foreground block truncate"
                          title="Escolas com Pedidos"
                        >
                          Escolas com Pedidos
                        </span>
                        <span className="text-lg font-bold text-foreground">
                          {metricsCiclo.escolasCount}
                        </span>
                      </div>
                      <div className="bg-muted/40 rounded p-2 text-center">
                        <span
                          className="text-[10px] uppercase font-semibold text-muted-foreground block truncate"
                          title="Entregas Concluídas"
                        >
                          Entregas Concluídas
                        </span>
                        <span
                          className={`text-lg font-bold ${metricsCiclo.entregasConcluidasCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
                        >
                          {metricsCiclo.entregasConcluidasCount}{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            de {metricsCiclo.escolasCount}
                          </span>
                        </span>
                      </div>
                      <div className="bg-muted/40 rounded p-2 text-center">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Volume Total
                        </span>
                        <span className="text-lg font-bold text-foreground font-mono">
                          {metricsCiclo.volumeTotal > 0
                            ? metricsCiclo.volumeTotal.toLocaleString('pt-BR')
                            : '0'}
                        </span>
                      </div>
                      <div className="bg-muted/40 rounded p-2 text-center col-span-2 sm:col-span-1">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Valor Previsto
                        </span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1 block truncate">
                          {metricsCiclo.valorTotal.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground text-[11px]">
                        {ch ? (
                          <>
                            Chamada: <strong>{ch.chamada}</strong> (
                            {ch.dependencia_administrativa || 'PNAE'}) • Modalidade:{' '}
                            {ch.modalidade || 'centralizado'}
                          </>
                        ) : (
                          'Chamada não vinculada'
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-7 text-xs text-primary px-2"
                      >
                        <Link
                          to={`/monitoramento?cicloId=${ciclo.id}&chamadaId=${ciclo.chamada_id || ''}`}
                          onClick={() => setCicloCorrente(ciclo.id, ciclo.chamada_id || undefined)}
                        >
                          Monitorar <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Visão Rápida de Chamadas Ativas e Status de Ciclo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-all hover:scale-105 hover:border hover:border-primary/40 shrink-0">
                <Megaphone className="h-6 w-6 stroke-[1.8]" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Chamadas Públicas Ativas
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Relação das chamadas com e sem ciclos operacionais em andamento.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-medium">
                {chamadasAtivasStats.total}{' '}
                {chamadasAtivasStats.total === 1 ? 'chamada ativa' : 'chamadas ativas'}
              </Badge>
              <Button variant="ghost" size="sm" asChild className="text-xs text-primary h-8 px-2">
                <Link to="/chamadas">
                  Gerenciar Chamadas <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chamadasAtivas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma chamada pública ativa cadastrada.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {chamadasAtivas.map((ch) => {
                const cicloAtivoDaChamada = activeCiclosList.find((c) => c.chamada_id === ch.id)
                const temCiclo = Boolean(cicloAtivoDaChamada)

                return (
                  <div
                    key={ch.id}
                    className={`p-3 rounded-lg border transition-colors flex flex-col justify-between gap-2 ${
                      temCiclo
                        ? 'bg-card border-indigo-200 dark:border-indigo-900/50 shadow-xs'
                        : 'bg-muted/20 border-dashed border-border'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          Chamada {ch.chamada}
                        </span>
                        {temCiclo ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] px-1.5 py-0">
                            Ciclo em andamento
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground px-1.5 py-0"
                          >
                            Sem ciclo ativo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {ch.dependencia_administrativa && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 font-normal"
                          >
                            {ch.dependencia_administrativa}
                          </Badge>
                        )}
                        <span>{ch.programa || 'PNAE'}</span>
                        <span>•</span>
                        <span className="capitalize">{ch.modalidade || 'centralizado'}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t flex items-center justify-between text-xs">
                      {temCiclo ? (
                        <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-medium text-[11px] truncate">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span className="truncate">{cicloAtivoDaChamada?.nome}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({formatFaseAmigavel(cicloAtivoDaChamada?.status)})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">
                          Aguardando abertura de ciclo
                        </span>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-6 text-[11px] text-primary px-1.5 shrink-0 ml-2"
                      >
                        <Link
                          to={
                            temCiclo && cicloAtivoDaChamada
                              ? `/monitoramento?cicloId=${cicloAtivoDaChamada.id}&chamadaId=${ch.id}`
                              : '/chamadas'
                          }
                        >
                          {temCiclo ? 'Ver Ciclo' : 'Abrir'}
                        </Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-all hover:scale-105 hover:border hover:border-primary/40 shrink-0">
                <Truck className="h-6 w-6 stroke-[1.8]" />
              </div>
              <div>
                <CardTitle>Entregas Recentes</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Últimos pedidos registrados e status de entrega
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando entregas do banco...
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum pedido cadastrado no momento.
              </div>
            ) : (
              <div className="space-y-4">
                {orders.slice(0, 4).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-all hover:scale-105 hover:border hover:border-primary/40 shrink-0">
                        <School className="h-6 w-6 stroke-[1.8]" />
                      </div>
                      <div>
                        <p className="font-medium">{order.schoolName}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(order.date).toLocaleDateString('pt-BR')} •{' '}
                          {order.numero || order.id}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        order.status === 'Entregue'
                          ? 'default'
                          : order.status === 'Pendente'
                            ? 'secondary'
                            : 'outline'
                      }
                      className={order.status === 'Entregue' ? 'bg-primary' : ''}
                    >
                      {order.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4 text-primary" asChild>
              <Link to="/pedidos">
                Ver todos os pedidos <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feed de Atividade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {dynamicActivities.map((act, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="mt-0.5 rounded-full p-1.5 border border-border bg-muted/30 flex items-center justify-center shrink-0">
                    <span className="text-base leading-none" role="img" aria-label={act.title}>
                      {act.emoji}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <p className="text-sm font-medium leading-none">{act.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{act.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">{act.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
