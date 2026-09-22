import { useState, useMemo, useEffect } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  MessageCircle,
  ShieldAlert,
  CalendarPlus,
  Ban,
  Package,
  Layers,
  School,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatIntervaloCiclo,
  formatDespachoAmigavel,
  getDespachoPrevistoCiclo,
  isCicloTerminal,
  isCicloNaoTerminal,
  calcularDiasAtrasoFechamento,
} from '@/lib/cicloUtils'
import { AbrirCicloDialog } from '@/components/AbrirCicloDialog'
import { CancelarCicloDialog } from '@/components/CancelarCicloDialog'
import type { CicloRecord } from '@/lib/types'

export default function Monitoring() {
  const { ciclos, activeCiclo, updateCicloStatus, schools, orders, products } = useApp()

  // Seletor de ciclos: mais recente primeiro, padrão = ciclo ativo (ou o mais recente de todos)
  const sortedCiclos = useMemo(() => {
    return [...ciclos].sort((a, b) => {
      const tA = new Date(a.created || a.data_inicio).getTime()
      const tB = new Date(b.created || b.data_inicio).getTime()
      return tB - tA
    })
  }, [ciclos])

  const [selectedCicloId, setSelectedCicloId] = useState<string>('')
  const [updating, setUpdating] = useState(false)
  const [abrirCicloOpen, setAbrirCicloOpen] = useState(false)
  const [cancelarCicloOpen, setCancelarCicloOpen] = useState(false)

  // Atualizar seleção padrão quando o ativo mudar ou na carga inicial
  useEffect(() => {
    if (!selectedCicloId) {
      if (activeCiclo) {
        setSelectedCicloId(activeCiclo.id)
      } else if (sortedCiclos.length > 0) {
        setSelectedCicloId(sortedCiclos[0].id)
      }
    } else {
      // Se o ciclo selecionado foi excluído
      const exists = ciclos.some((c) => c.id === selectedCicloId)
      if (!exists) {
        setSelectedCicloId(activeCiclo?.id || sortedCiclos[0]?.id || '')
      }
    }
  }, [activeCiclo, sortedCiclos, ciclos, selectedCicloId])

  const selectedCiclo: CicloRecord | null = useMemo(() => {
    return ciclos.find((c) => c.id === selectedCicloId) || activeCiclo || sortedCiclos[0] || null
  }, [ciclos, selectedCicloId, activeCiclo, sortedCiclos])

  const currentStatus = selectedCiclo?.status || 'coletando'
  const isSelectedAtivo = activeCiclo?.id === selectedCiclo?.id

  // Badge derivado de atraso:
  // Ciclo não-terminal que NÃO é o mais recente não-terminal recebe:
  // "Fechamento Pendente (atrasado X dias)" (X = dias desde a terça de fechamento prevista).
  const isFechamentoPendente = Boolean(
    selectedCiclo && isCicloNaoTerminal(selectedCiclo.status) && !isSelectedAtivo,
  )
  const diasAtraso = selectedCiclo ? calcularDiasAtrasoFechamento(selectedCiclo.data_fim) : 0

  // Dados do ciclo selecionado (pedidos, escolas, funil)
  const cicloOrders = useMemo(() => {
    if (!selectedCiclo) return []
    return orders.filter((o) => o.cicloId === selectedCiclo.id && o.status !== 'Cancelado')
  }, [orders, selectedCiclo])

  const schoolsWithOrders = useMemo(() => {
    return new Set(cicloOrders.map((o) => o.schoolId))
  }, [cicloOrders])

  // Funil / Métricas do ciclo selecionado
  const funilMetrics = useMemo(() => {
    const totalPedidos = cicloOrders.length
    const pedidosValidados = cicloOrders.filter(
      (o) => o.validacao?.status === 'validado' || !o.validacao,
    ).length
    const pedidosInconsistentes = cicloOrders.filter(
      (o) => o.validacao?.status === 'invalido',
    ).length
    const volumeTotal = cicloOrders.reduce(
      (acc, o) => acc + o.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
      0,
    )
    const valorTotal = cicloOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0)

    return {
      totalPedidos,
      pedidosValidados,
      pedidosInconsistentes,
      escolasAtendidas: schoolsWithOrders.size,
      volumeTotal,
      valorTotal,
    }
  }, [cicloOrders, schoolsWithOrders])

  // Escolas sem pedido lançado no ciclo selecionado
  const alertSchools = useMemo(() => {
    if (!selectedCiclo || selectedCiclo.status === 'cancelado') return []

    const list = schools.map((sch) => {
      const hasOrder = schoolsWithOrders.has(sch.id)
      const sOrders = cicloOrders.filter((o) => o.schoolId === sch.id)
      const invalidOrder = sOrders.find((o) => o.validacao?.status === 'invalido')

      let pendenciaTipo: 'sem_pedido' | 'pedido_invalido' | 'ok' = 'ok'
      let pendenciaDesc = 'Pedido validado e regular'

      if (!hasOrder) {
        pendenciaTipo = 'sem_pedido'
        pendenciaDesc = 'Nenhum pedido enviado para este ciclo'
      } else if (invalidOrder) {
        pendenciaTipo = 'pedido_invalido'
        pendenciaDesc = invalidOrder.validacao?.motivo || 'Pedido com pendência de validação'
      }

      return {
        school: sch,
        pendenciaTipo,
        pendenciaDesc,
        order: invalidOrder || sOrders[0],
      }
    })

    return list.filter((p) => p.pendenciaTipo !== 'ok')
  }, [schools, schoolsWithOrders, cicloOrders, selectedCiclo])

  // Fases operam sobre o ciclo SELECIONADO independentemente
  const handleSimulatePhase = async (newPhase: 'coletando' | 'correcao' | 'fechado') => {
    if (!selectedCiclo) {
      toast.error('Nenhum ciclo selecionado.')
      return
    }
    if (selectedCiclo.status === 'cancelado') {
      toast.error('Não é possível alterar a fase de um ciclo cancelado.')
      return
    }
    setUpdating(true)
    try {
      await updateCicloStatus(selectedCiclo.id, newPhase)
    } finally {
      setUpdating(false)
    }
  }

  const handleOpenWhatsApp = (telefone: string, schoolName: string, motivo: string) => {
    const cleanPhone = telefone.replace(/\D/g, '')
    const phoneToUse = cleanPhone.length >= 10 ? `55${cleanPhone}` : ''
    const msg = encodeURIComponent(
      `Olá, equipe do(a) *${schoolName}*! Tudo bem? Aqui é da CooperGestão.\n\nNotamos a seguinte pendência referente ao ciclo *${selectedCiclo?.nome || 'ativo'}*:\n👉 ${motivo}\n\nPor favor, envie ou atualize a lista para que possamos organizar as rotas de entrega. Obrigado!`,
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
      {/* Cabeçalho com Seletor e Botões de Ação */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoramento do Ciclo</h1>
          <p className="text-muted-foreground">
            Acompanhe o funil de pedidos, evolução de fases e contate escolas com pendências.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Ciclos */}
          <div className="w-[230px]">
            <Select
              value={selectedCiclo?.id || ''}
              onValueChange={(val) => setSelectedCicloId(val)}
            >
              <SelectTrigger className="h-9 font-medium">
                <SelectValue placeholder="Selecione um ciclo" />
              </SelectTrigger>
              <SelectContent>
                {sortedCiclos.map((c) => {
                  const isAct = c.id === activeCiclo?.id
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {isAct ? '(Ativo)' : `(${c.status})`}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Botão ABRIR CICLO */}
          <Button onClick={() => setAbrirCicloOpen(true)} className="gap-2 h-9">
            <CalendarPlus className="h-4 w-4" /> Abrir Ciclo
          </Button>

          {/* Botão Cancelar Ciclo */}
          {selectedCiclo &&
            selectedCiclo.status !== 'fechado' &&
            selectedCiclo.status !== 'cancelado' && (
              <Button
                variant="outline"
                onClick={() => setCancelarCicloOpen(true)}
                className="gap-2 h-9 text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Ban className="h-4 w-4" /> Cancelar Ciclo
              </Button>
            )}
        </div>
      </div>

      {/* Simulador de Fases do Ciclo Selecionado */}
      <Card className="border-t-4 border-t-primary">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Painel de Fases:{' '}
                  {selectedCiclo?.nome || 'Nenhum ciclo selecionado'}
                </CardTitle>
                {isSelectedAtivo && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-primary/10 text-primary border-primary/30"
                  >
                    Ciclo Ativo
                  </Badge>
                )}
                {isFechamentoPendente && (
                  <Badge className="bg-amber-600 hover:bg-amber-700 text-xs">
                    Fechamento Pendente (atrasado {diasAtraso} dias)
                  </Badge>
                )}
                {selectedCiclo?.status === 'cancelado' && (
                  <Badge variant="destructive" className="text-xs">
                    Cancelado{' '}
                    {selectedCiclo.motivo_cancelamento
                      ? `— ${selectedCiclo.motivo_cancelamento}`
                      : ''}
                  </Badge>
                )}
              </div>

              <CardDescription className="mt-1">
                {selectedCiclo && (
                  <>
                    Período (
                    {formatIntervaloCiclo(selectedCiclo.data_inicio, selectedCiclo.data_fim)}) •
                    Despacho previsto para{' '}
                    <span className="inline-flex items-center font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatDespachoAmigavel(
                        selectedCiclo.snapshot?.despacho_previsto_segunda ||
                          getDespachoPrevistoCiclo(selectedCiclo.data_inicio),
                        true,
                      )}
                    </span>{' '}
                    • Fluxo Operacional: <em>Coletando → Correção → Fechado</em>
                  </>
                )}
              </CardDescription>
            </div>

            <Badge
              className={`text-sm px-3 py-1 font-semibold capitalize ${
                currentStatus === 'coletando'
                  ? 'bg-blue-600'
                  : currentStatus === 'correcao'
                    ? 'bg-amber-600'
                    : currentStatus === 'fechado'
                      ? 'bg-emerald-700'
                      : 'bg-destructive'
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
                disabled={
                  updating || currentStatus === 'coletando' || currentStatus === 'cancelado'
                }
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
                disabled={updating || currentStatus === 'correcao' || currentStatus === 'cancelado'}
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
                disabled={updating || currentStatus === 'fechado' || currentStatus === 'cancelado'}
                onClick={() => handleSimulatePhase('fechado')}
              >
                {currentStatus === 'fechado' ? 'Fase Ativa' : 'Fechar Ciclo'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo do Funil do Ciclo Selecionado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Escolas Atendidas</p>
            <p className="text-xl font-bold text-primary">{funilMetrics.escolasAtendidas}</p>
            <p className="text-[10px] text-muted-foreground">de {schools.length} cadastradas</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pedidos do Ciclo</p>
            <p className="text-xl font-bold text-foreground">{funilMetrics.totalPedidos}</p>
            <p className="text-[10px] text-muted-foreground">
              {funilMetrics.pedidosValidados} validados • {funilMetrics.pedidosInconsistentes}{' '}
              pendentes
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Volume Consolidado</p>
            <p className="text-xl font-bold text-primary">
              {funilMetrics.volumeTotal.toLocaleString('pt-BR')}
            </p>
            <p className="text-[10px] text-muted-foreground">itens / Kg previstos</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Valor Total Previsto</p>
            <p className="text-xl font-bold text-foreground">
              R${' '}
              {funilMetrics.valorTotal.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-[10px] text-muted-foreground">no ciclo selecionado</p>
          </CardContent>
        </Card>
      </div>

      {/* Painel de Alertas de Escolas com Pendências do Ciclo Selecionado */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600" /> Painel de Alertas das Escolas
              </CardTitle>
              <CardDescription>
                Identificação precoce de escolas sem envio de pedidos ou com inconsistências no
                ciclo selecionado.
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
                        <CheckCircle2 className="h-5 w-5" /> Todas as escolas estão em dia neste
                        ciclo!
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
                          <Badge variant="outline">{item.school.route || 'Sem rota'}</Badge>
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

      {/* Modais de Abrir e Cancelar Ciclo */}
      <AbrirCicloDialog
        open={abrirCicloOpen}
        onOpenChange={setAbrirCicloOpen}
        onSuccess={() => {
          if (activeCiclo) {
            setSelectedCicloId(activeCiclo.id)
          }
        }}
      />

      <CancelarCicloDialog
        ciclo={selectedCiclo}
        open={cancelarCicloOpen}
        onOpenChange={setCancelarCicloOpen}
      />
    </div>
  )
}
