import { useState } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  MessageCircle,
  ShieldAlert,
  Loader2,
  Phone,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

export default function Monitoring() {
  const { activeCiclo, updateCicloStatus, schools, orders, products } = useApp()
  const [updating, setUpdating] = useState(false)

  const currentStatus = activeCiclo?.status || 'coletando'

  // Pendências das escolas no ciclo ativo
  const activeOrders = orders.filter(
    (o) => o.cicloId === activeCiclo?.id && o.status !== 'Cancelado',
  )
  const schoolsWithOrders = new Set(activeOrders.map((o) => o.schoolId))

  // Escolas sem pedido lançado no ciclo ativo
  const pendingSchools = schools.map((sch) => {
    const hasOrder = schoolsWithOrders.has(sch.id)
    const schoolOrders = activeOrders.filter((o) => o.schoolId === sch.id)
    const invalidOrder = schoolOrders.find((o) => o.validacao?.status === 'invalido')

    let pendenciaTipo: 'sem_pedido' | 'pedido_invalido' | 'ok' = 'ok'
    let pendenciaDesc = 'Pedido validado e regular'

    if (!hasOrder) {
      pendenciaTipo = 'sem_pedido'
      pendenciaDesc = 'Nenhum pedido enviado para o ciclo semanal ativo'
    } else if (invalidOrder) {
      pendenciaTipo = 'pedido_invalido'
      pendenciaDesc = invalidOrder.validacao?.motivo || 'Pedido com pendência de validação'
    }

    return {
      school: sch,
      pendenciaTipo,
      pendenciaDesc,
      order: invalidOrder || schoolOrders[0],
    }
  })

  const alertSchools = pendingSchools.filter((p) => p.pendenciaTipo !== 'ok')

  const handleSimulatePhase = async (newPhase: 'coletando' | 'correcao' | 'fechado') => {
    if (!activeCiclo) {
      toast.error('Nenhum ciclo ativo cadastrado.')
      return
    }
    setUpdating(true)
    await updateCicloStatus(activeCiclo.id, newPhase)
    setUpdating(false)
  }

  const handleOpenWhatsApp = (telefone: string, schoolName: string, motivo: string) => {
    const cleanPhone = telefone.replace(/\D/g, '')
    const phoneToUse = cleanPhone.length >= 10 ? `55${cleanPhone}` : ''
    const msg = encodeURIComponent(
      `Olá, equipe do(a) *${schoolName}*! Tudo bem? Aqui é da CooperGestão.\n\nNotamos a seguinte pendência referente ao ciclo *${activeCiclo?.nome || 'ativo'}*:\n👉 ${motivo}\n\nPor favor, envie ou atualize a lista para que possamos organizar as rotas de entrega. Obrigado!`,
    )

    if (phoneToUse) {
      window.open(`https://wa.me/${phoneToUse}?text=${msg}`, '_blank')
    } else {
      window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank')
    }
    toast.success(`Abrindo WhatsApp para contato com ${schoolName}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoramento do Ciclo</h1>
          <p className="text-muted-foreground">
            Acompanhe o funil do ciclo semanal, simule transição de fases e contate escolas com
            pendências.
          </p>
        </div>
      </div>

      {/* Simulador de Fases do Ciclo */}
      <Card className="border-t-4 border-t-primary">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" /> Simulador de Fluxo do Ciclo Ativo
              </CardTitle>
              <CardDescription>
                Ciclo Atual:{' '}
                <strong className="text-foreground">{activeCiclo?.nome || 'Nenhum'}</strong> • Fluxo
                Operacional: <em>Coletando → Correção → Fechado</em>
              </CardDescription>
            </div>
            <Badge
              className={`text-sm px-3 py-1 font-semibold capitalize ${
                currentStatus === 'coletando'
                  ? 'bg-blue-600'
                  : currentStatus === 'correcao'
                    ? 'bg-amber-600'
                    : 'bg-emerald-700'
              }`}
            >
              Fase Atual: {currentStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fase 1: Coletando */}
            <div
              className={`p-4 rounded-lg border-2 transition-all ${
                currentStatus === 'coletando'
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Fase 1
                </span>
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
              <h3 className="font-semibold text-base mb-1">Coletando</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Recebimento inicial dos pedidos via WhatsApp, Planilha Centralizada ou Lançamento
                Manual.
              </p>
              <Button
                size="sm"
                variant={currentStatus === 'coletando' ? 'default' : 'outline'}
                className="w-full text-xs"
                disabled={updating || currentStatus === 'coletando'}
                onClick={() => handleSimulatePhase('coletando')}
              >
                {currentStatus === 'coletando' ? 'Fase Ativa' : 'Mudar para Coletando'}
              </Button>
            </div>

            {/* Fase 2: Correção */}
            <div
              className={`p-4 rounded-lg border-2 transition-all ${
                currentStatus === 'correcao'
                  ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Fase 2
                </span>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <h3 className="font-semibold text-base mb-1">Correção</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Compensação de itens em escassez por abundância e resolução de inconformidades com
                secretarias.
              </p>
              <Button
                size="sm"
                variant={currentStatus === 'correcao' ? 'default' : 'outline'}
                className="w-full text-xs"
                disabled={updating || currentStatus === 'correcao'}
                onClick={() => handleSimulatePhase('correcao')}
              >
                {currentStatus === 'correcao' ? 'Fase Ativa' : 'Mudar para Correção'}
              </Button>
            </div>

            {/* Fase 3: Fechado */}
            <div
              className={`p-4 rounded-lg border-2 transition-all ${
                currentStatus === 'fechado'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  Fase 3
                </span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-base mb-1">Fechado</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Ciclo congelado e consolidado para colheita dos produtores cooperados e
                roteirização.
              </p>
              <Button
                size="sm"
                variant={currentStatus === 'fechado' ? 'default' : 'outline'}
                className="w-full text-xs"
                disabled={updating || currentStatus === 'fechado'}
                onClick={() => handleSimulatePhase('fechado')}
              >
                {currentStatus === 'fechado' ? 'Fase Ativa' : 'Fechar Ciclo'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Painel de Alertas de Escolas com Pendências */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600" /> Painel de Alertas das Escolas
              </CardTitle>
              <CardDescription>
                Identificação precoce de escolas sem envio de pedidos ou com inconsistências para
                contato imediato via WhatsApp.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-medium">
              {alertSchools.length} pendência(s) detectada(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escola</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Telefone / Contato</TableHead>
                  <TableHead>Situação / Pendência</TableHead>
                  <TableHead className="text-right">Ação Direta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertSchools.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-emerald-600 font-medium"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-5 w-5" /> Todas as escolas estão em dia no ciclo
                        atual!
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  alertSchools.map((item) => {
                    const isSemPedido = item.pendenciaTipo === 'sem_pedido'
                    return (
                      <TableRow key={item.school.id}>
                        <TableCell className="font-semibold text-primary">
                          {item.school.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.school.route}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {item.school.contact || 'Sem telefone'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2 max-w-[340px]">
                            {isSemPedido ? (
                              <Badge variant="destructive" className="text-[10px] shrink-0 mt-0.5">
                                Sem Pedido
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-600 text-[10px] shrink-0 mt-0.5">
                                Inconsistente
                              </Badge>
                            )}
                            <span className="text-xs text-foreground/80 leading-tight">
                              {item.pendenciaDesc}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                            onClick={() =>
                              handleOpenWhatsApp(
                                item.school.contact,
                                item.school.name,
                                item.pendenciaDesc,
                              )
                            }
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
