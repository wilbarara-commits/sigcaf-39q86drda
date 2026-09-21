import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingCart,
  FileText,
  Truck,
  DollarSign,
  ArrowRight,
  CheckCircle2,
  Clock,
  School,
  Sprout,
  Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { MonthlyReportButton } from '@/components/MonthlyReportButton'

export default function Index() {
  const { orders, contracts, atestos, isLoading } = useApp()

  const pendingOrders = orders.filter((o) => o.status === 'Pendente').length
  const deliveriesToday = orders.filter((o) => o.status === 'Em Rota').length
  const activeContracts = contracts.filter((c) => c.status === 'Ativo').length
  const totalRevenue = contracts.reduce((acc, c) => acc + c.totalValue, 0)

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
      title: 'Receita Total (Mês)',
      value: `R$ ${(totalRevenue / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-600/10',
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
                <div className="text-2xl font-bold">{m.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

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
