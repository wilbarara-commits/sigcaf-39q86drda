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
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { MonthlyReportButton } from '@/components/MonthlyReportButton'

export default function Index() {
  const { orders, contracts, contractItems, contractSchools, atestos, activeCiclo, isLoading } =
    useApp()

  const pendingOrders = orders.filter((o) => o.status === 'Pendente').length
  const deliveriesToday = orders.filter((o) => o.status === 'Em Rota').length
  const activeContracts = contracts.filter((c) => c.status === 'Ativo').length

  // Preço unitário do contrato: mapeia escola -> contrato_id -> itens de contrato
  const { receitaEntregueMes, receitaTotalMes, percentEntregue, currentMonthName } = useMemo(() => {
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

    // Mapeamento rápido de escolaId -> contratoId
    const escolaToContractId = new Map<string, string>()
    if (contractSchools && contractSchools.length > 0) {
      for (const cs of contractSchools) {
        if (cs.escola_id && cs.contrato_id) {
          escolaToContractId.set(cs.escola_id, cs.contrato_id)
        }
      }
    } else if (contracts && contracts.length > 0) {
      for (const c of contracts) {
        if (c.escolas) {
          for (const esc of c.escolas) {
            if (esc.escolaId) {
              escolaToContractId.set(esc.escolaId, c.id)
            }
          }
        }
      }
    }

    // Mapa de preço por (contrato_id, produto_id) e fallback por produto_id
    const contractProductPriceMap = new Map<string, number>()
    const fallbackProductPriceMap = new Map<string, number>()
    if (contractItems && contractItems.length > 0) {
      for (const ci of contractItems) {
        const preco = Number(ci.preco) || 0
        if (preco > 0) {
          if (ci.contrato_id && ci.produto_id) {
            contractProductPriceMap.set(`${ci.contrato_id}:${ci.produto_id}`, preco)
          }
          if (ci.produto_id && !fallbackProductPriceMap.has(ci.produto_id)) {
            fallbackProductPriceMap.set(ci.produto_id, preco)
          }
        }
      }
    }

    // Função para calcular a receita de um pedido com base nos itens de contrato
    const calcularReceitaPedido = (order: (typeof orders)[0]): number => {
      if (!order.items || order.items.length === 0) {
        return Number(order.total) || 0
      }

      const contratoId = escolaToContractId.get(order.schoolId)
      let pedidoTotalCalculado = 0
      let calculouPorContrato = false

      for (const item of order.items) {
        const qtd = Number(item.quantity) || 0
        if (qtd <= 0) continue

        let preco = 0
        if (contratoId) {
          preco = contractProductPriceMap.get(`${contratoId}:${item.productId}`) || 0
        }
        if (!preco) {
          preco = fallbackProductPriceMap.get(item.productId) || 0
        }
        if (!preco) {
          preco = Number(item.price) || 0
        }

        if (preco > 0) {
          calculouPorContrato = true
        }
        pedidoTotalCalculado += qtd * preco
      }

      // Se nenhum item encontrou preço no contrato nem no item, usa o total gravado no pedido (se houver)
      if (!calculouPorContrato && pedidoTotalCalculado === 0 && Number(order.total) > 0) {
        return Number(order.total)
      }

      return pedidoTotalCalculado
    }

    // Filtrar pedidos cujo mês e ano correspondam ao mês corrente
    // Não consideramos pedidos com status "Cancelado" na receita
    let entregueTotal = 0
    let geralMesTotal = 0

    for (const order of orders) {
      if (order.status === 'Cancelado') continue

      // Extrair data do pedido (ou entregue_em se entregue)
      const rawDateStr =
        (order.status === 'Entregue' && order.entregue_em ? order.entregue_em : null) ||
        order.date ||
        ''
      if (!rawDateStr) continue

      const orderDate = new Date(rawDateStr)
      if (isNaN(orderDate.getTime())) continue

      const isInCurrentMonth =
        orderDate.getFullYear() === currentYear && orderDate.getMonth() === currentMonth

      if (!isInCurrentMonth) continue

      const valorPedido = calcularReceitaPedido(order)
      geralMesTotal += valorPedido

      if (order.status === 'Entregue') {
        entregueTotal += valorPedido
      }
    }

    const pct = geralMesTotal > 0 ? (entregueTotal / geralMesTotal) * 100 : 0

    return {
      receitaEntregueMes: entregueTotal,
      receitaTotalMes: geralMesTotal,
      percentEntregue: pct,
      currentMonthName: curMonthName,
    }
  }, [orders, contracts, contractItems, contractSchools])

  const formattedReceitaEntregue = receitaEntregueMes.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const formattedReceitaTotal = receitaTotalMes.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const formattedPercent = `${percentEntregue.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`

  const metrics = [
    {
      title: 'Pedidos Pendentes',
      value: pendingOrders,
      icon: ShoppingCart,
      color: 'text-secondary',
      bg: 'bg-secondary/10',
    },
    {
      title: 'Contratos Ativos',
      value: activeContracts,
      icon: FileText,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Entregas Hoje',
      value: deliveriesToday,
      icon: Truck,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'Receita Entregue do Mês',
      value: formattedReceitaEntregue,
      subtext: `${formattedPercent} do total do mês (${formattedReceitaTotal})`,
      badge: formattedPercent,
      icon: PackageCheck,
      color: 'text-emerald-600',
      bg: 'bg-emerald-600/10',
    },
  ]

  // Recent activity feed dynamically assembled from real database records
  const dynamicActivities = []
  if (atestos.length > 0) {
    const latestAtesto = atestos[0]
    dynamicActivities.push({
      title: `Atesto Gerado (${latestAtesto.numero || 'AT'})`,
      desc: latestAtesto.schoolName,
      time: new Date(latestAtesto.date).toLocaleDateString('pt-BR'),
      icon: CheckCircle2,
      color: 'text-primary',
    })
  }
  if (orders.length > 0) {
    const latestOrder = orders[0]
    dynamicActivities.push({
      title: `Novo Pedido (${latestOrder.numero || 'ORD'})`,
      desc: `${latestOrder.schoolName} — R$ ${latestOrder.total.toFixed(2)}`,
      time: new Date(latestOrder.date).toLocaleDateString('pt-BR'),
      icon: Clock,
      color: 'text-secondary',
    })
  }
  dynamicActivities.push({
    title: 'Catálogo Conectado',
    desc: 'PocketBase Skip Cloud ativo',
    time: 'Hoje',
    icon: Sprout,
    color: 'text-blue-500',
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Resumo das atividades da cooperativa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthlyReportButton variant="outline" size="default" />
          <Button asChild variant="outline">
            <Link to="/atestos">Emitir Atesto</Link>
          </Button>
          <Button asChild>
            <Link to="/pedidos">Novo Pedido</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{m.title}</CardTitle>
              <div className={`p-2 rounded-full ${m.bg}`}>
                <m.icon className={`h-4 w-4 ${m.color}`} />
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
                        className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-xs px-2 py-0.5"
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
        ))}
      </div>

      {/* Faixa Informativa do Ciclo Operacional Ativo (Regra Semanal Quarta->Terça com Despacho na Segunda) */}
      {activeCiclo && (
        <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">{activeCiclo.nome}</span>
                <Badge
                  variant="outline"
                  className="text-[11px] capitalize border-primary/30 text-primary bg-background"
                >
                  Fase: {activeCiclo.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Semana do ciclo:{' '}
                <strong>
                  quarta-feira ({new Date(activeCiclo.data_inicio).toLocaleDateString('pt-BR')})
                </strong>{' '}
                a{' '}
                <strong>
                  terça-feira ({new Date(activeCiclo.data_fim).toLocaleDateString('pt-BR')})
                </strong>
              </p>
            </div>
            <div className="flex items-center gap-2 bg-background dark:bg-card px-3 py-1.5 rounded-md border text-xs shadow-sm">
              <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <span className="text-muted-foreground block text-[10px]">
                  Previsão de Despacho em Rota
                </span>
                <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  Segunda-feira,{' '}
                  {new Date(
                    activeCiclo.snapshot?.despacho_previsto_segunda ||
                      new Date(new Date(activeCiclo.data_inicio).getTime() + 5 * 86400000),
                  ).toLocaleDateString('pt-BR')}
                </strong>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Entregas Recentes</CardTitle>
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
                      <div className="bg-primary/10 p-2 rounded-full">
                        <School className="h-4 w-4 text-primary" />
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
                <div key={i} className="flex gap-4">
                  <div className={`mt-0.5 rounded-full p-1 border ${act.color} bg-background`}>
                    <act.icon className="h-4 w-4" />
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
