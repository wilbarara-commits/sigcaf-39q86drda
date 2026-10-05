import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Truck,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatIntervaloCiclo,
  formatDespachoAmigavel,
  getDespachoEfetivoCiclo,
  isCicloNaoTerminal,
  calcularDiasAtrasoFechamento,
  formatFaseAmigavel,
  gerarResumoFasesCiclo,
  derivarStatusCiclo,
} from '@/lib/cicloUtils'
import { AbrirCicloDialog } from '@/components/AbrirCicloDialog'
import { CancelarCicloDialog } from '@/components/CancelarCicloDialog'
import { safeOpenWhatsApp } from '@/lib/whatsapp'
import pb from '@/lib/pocketbase/client'
import type { CicloRecord, EnvioWhatsappRecord } from '@/lib/types'

export default function Monitoring() {
  const navigate = useNavigate()
  const {
    ciclos,
    contracts,
    contractSchools,
    activeCiclo,
    updateCicloStatus,
    schools,
    orders,
    chamadas,
  } = useApp()

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
  const [cancelarCicloInteiroOpen, setCancelarCicloInteiroOpen] = useState(false)
  const [enviosWhatsapp, setEnviosWhatsapp] = useState<EnvioWhatsappRecord[]>([])

  // Atualizar seleção padrão quando o ativo mudar ou na carga inicial
  useEffect(() => {
    if (!selectedCicloId) {
      if (activeCiclo) {
        setSelectedCicloId(activeCiclo.id)
      } else if (sortedCiclos.length > 0) {
        setSelectedCicloId(sortedCiclos[0].id)
      }
    } else {
      const exists = ciclos.some((c) => c.id === selectedCicloId)
      if (!exists) {
        setSelectedCicloId(activeCiclo?.id || sortedCiclos[0]?.id || '')
      }
    }
  }, [activeCiclo, sortedCiclos, ciclos, selectedCicloId])

  const selectedCiclo: CicloRecord | null = useMemo(() => {
    return ciclos.find((c) => c.id === selectedCicloId) || activeCiclo || sortedCiclos[0] || null
  }, [ciclos, selectedCicloId, activeCiclo, sortedCiclos])

  // Chamada associada ao ciclo selecionado
  const selectedChamada = useMemo(() => {
    if (!selectedCiclo?.chamada_id) return null
    return (
      selectedCiclo.expand?.chamada_id ||
      chamadas.find((ch) => ch.id === selectedCiclo.chamada_id) ||
      null
    )
  }, [selectedCiclo, chamadas])

  // Contratos participantes DERIVADOS da chamada do ciclo (somente leitura/informativo)
  const contratosParticipantes = useMemo(() => {
    if (!selectedCiclo) return []
    const chId = selectedCiclo.chamada_id
    if (!chId) {
      return contracts.filter((c) => c.status === 'Ativo')
    }
    return contracts.filter((c) => c.status === 'Ativo' && c.chamada_id === chId)
  }, [selectedCiclo, contracts])

  // Escolas participantes da chamada do ciclo (derivadas dos contratos ativos da chamada)
  const escolasParticipantesIds = useMemo(() => {
    if (!selectedCiclo) return new Set<string>()
    const contratosIds = new Set(contratosParticipantes.map((c) => c.id))
    const links = contractSchools.filter(
      (cs) => contratosIds.has(cs.contrato_id) && !cs.encerrado_em,
    )
    return new Set(links.map((cs) => cs.escola_id))
  }, [selectedCiclo, contratosParticipantes, contractSchools])

  // Carregar envios de WhatsApp do ciclo selecionado para rastrear quem já recebeu o link
  useEffect(() => {
    if (!selectedCiclo) return
    pb.collection('envios_whatsapp')
      .getFullList<EnvioWhatsappRecord>({
        filter: `ciclo_id = "${selectedCiclo.id}" && status = "enviado"`,
      })
      .then((records) => setEnviosWhatsapp(records))
      .catch((err) => {
        console.warn('Erro ao carregar envios_whatsapp no monitoramento:', err)
        setEnviosWhatsapp([])
      })
  }, [selectedCiclo])

  // Fase em vigor na tela: a fase pertence unicamente ao ciclo
  const currentFase = useMemo(() => {
    return derivarStatusCiclo(selectedCiclo?.status)
  }, [selectedCiclo])

  const isSelectedAtivo = activeCiclo?.id === selectedCiclo?.id

  // Badge derivado de atraso
  const isFechamentoPendente = Boolean(
    selectedCiclo && isCicloNaoTerminal(currentFase) && !isSelectedAtivo,
  )
  const diasAtraso = selectedCiclo ? calcularDiasAtrasoFechamento(selectedCiclo.data_fim) : 0

  // Pedidos do ciclo selecionado (pertencem ao ciclo da chamada)
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

    // Base de escolas da chamada do ciclo (ou total geral caso sem chamada específica)
    const totalEscolasBase =
      escolasParticipantesIds.size > 0 ? escolasParticipantesIds.size : schools.length

    return {
      totalPedidos,
      pedidosValidados,
      pedidosInconsistentes,
      escolasAtendidas: schoolsWithOrders.size,
      escolasTotal: totalEscolasBase,
      volumeTotal,
      valorTotal,
    }
  }, [cicloOrders, schoolsWithOrders, escolasParticipantesIds, schools])

  // Escolas da chamada sem pedido lançado no ciclo selecionado
  const alertSchools = useMemo(() => {
    if (!selectedCiclo || currentFase === 'cancelado') return []

    const pool =
      escolasParticipantesIds.size > 0
        ? schools.filter((s) => escolasParticipantesIds.has(s.id))
        : schools

    const poolEnviosEscolaIds = new Set(enviosWhatsapp.map((e) => e.escola_id))

    const list = pool.map((sch) => {
      const hasOrder = schoolsWithOrders.has(sch.id)
      const sOrders = cicloOrders.filter((o) => o.schoolId === sch.id)
      const invalidOrder = sOrders.find((o) => o.validacao?.status === 'invalido')
      const orderFormulario = sOrders.find((o) => o.origem === 'formulario')
      const preencheuFormulario = !!orderFormulario
      const recebeuLink = poolEnviosEscolaIds.has(sch.id)

      let pendenciaTipo:
        | 'sem_pedido'
        | 'sem_pedido_link_enviado'
        | 'pedido_formulario_preenchido'
        | 'pedido_invalido'
        | 'ok' = 'ok'
      let pendenciaDesc = 'Pedido validado e regular'

      if (!hasOrder) {
        if (recebeuLink) {
          pendenciaTipo = 'sem_pedido_link_enviado'
          pendenciaDesc = 'Link do formulário enviado via WhatsApp — escola ainda não preencheu'
        } else {
          pendenciaTipo = 'sem_pedido'
          pendenciaDesc =
            'Nenhum pedido enviado para este ciclo (link ainda não enviado via WhatsApp)'
        }
      } else if (invalidOrder) {
        pendenciaTipo = 'pedido_invalido'
        pendenciaDesc = invalidOrder.validacao?.motivo || 'Pedido com pendência de validação'
      }

      return {
        school: sch,
        pendenciaTipo,
        pendenciaDesc,
        recebeuLink,
        preencheuFormulario,
        origemUltimoPedido: sOrders[0]?.origem,
        order: invalidOrder || sOrders[0],
      }
    })

    return list.filter((p) => p.pendenciaTipo !== 'ok')
  }, [
    schools,
    schoolsWithOrders,
    cicloOrders,
    selectedCiclo,
    currentFase,
    escolasParticipantesIds,
    enviosWhatsapp,
  ])

  // Mudança de fase: opera sobre o status do ciclo
  const handleChangeFase = async (
    newFase: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado',
  ) => {
    if (!selectedCiclo) {
      toast.error('Nenhum ciclo selecionado.')
      return
    }

    if (currentFase === 'cancelado') {
      toast.error('Não é possível alterar a fase de um ciclo cancelado.')
      return
    }

    // Normaliza para o token novo 'coleta_encerrada'
    const tokenFase = newFase === 'coletado' ? 'coleta_encerrada' : newFase

    setUpdating(true)
    try {
      await updateCicloStatus(selectedCiclo.id, tokenFase)
    } finally {
      setUpdating(false)
    }
  }

  const handleOpenWhatsApp = async (telefone: string, schoolName: string, motivo: string) => {
    const msg = `Olá, equipe do(a) *${schoolName}*! Tudo bem? Aqui é da CooperGestão.\n\nNotamos a seguinte pendência referente ao ciclo *${selectedCiclo?.nome || 'ativo'}*:\n👉 ${motivo}\n\nPor favor, envie ou atualize a lista para que possamos organizar as rotas de entrega. Obrigado!`

    const { preview } = await safeOpenWhatsApp({
      phone: telefone,
      text: msg,
      recipientName: schoolName,
    })

    if (!preview) {
      toast.success(`Abrindo WhatsApp para contato com ${schoolName}`)
    }
  }

  const resumoFasesTexto = useMemo(() => {
    if (!selectedCiclo) return ''
    return gerarResumoFasesCiclo(selectedCiclo)
  }, [selectedCiclo])

  return (
    <div className="space-y-6">
      {/* Cabeçalho com Seleção do Ciclo da Chamada e Ações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoramento do Ciclo</h1>
          <p className="text-muted-foreground">
            Acompanhe o ciclo por chamada pública, evolução das fases, funil de pedidos e travas
            operacionais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Ciclos por Chamada */}
          <div className="min-w-[280px]">
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
                  const chamadaNome =
                    c.expand?.chamada_id?.chamada ||
                    chamadas.find((ch) => ch.id === c.chamada_id)?.chamada
                  const rotuloChamada = chamadaNome ? ` [${chamadaNome}]` : ' [Geral]'
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                      {rotuloChamada} {isAct ? '★ (Ativo)' : ''}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Botão ABRIR CICLO */}
          <Button
            onClick={() => setAbrirCicloOpen(true)}
            className="h-auto py-1.5 px-3 gap-3 group"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/20 text-primary-foreground dark:text-primary flex items-center justify-center transition-all group-hover:scale-105 group-hover:border group-hover:border-primary/40 shrink-0">
              <CalendarPlus className="h-6 w-6 stroke-[1.8]" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-sm leading-tight">Abrir Ciclo</div>
              <div className="text-[11px] opacity-80 font-normal">Novo ciclo por chamada</div>
            </div>
          </Button>

          {/* Botão Cancelar Ciclo (cancela o ciclo selecionado da chamada) */}
          {selectedCiclo &&
            (() => {
              const statusCiclo = derivarStatusCiclo(selectedCiclo.status)
              const canCancelCiclo =
                statusCiclo !== 'fechado' &&
                statusCiclo !== 'cancelado' &&
                selectedCiclo.status !== 'fechado' &&
                selectedCiclo.status !== 'cancelado'
              if (!canCancelCiclo) return null
              return (
                <Button
                  variant="outline"
                  onClick={() => setCancelarCicloInteiroOpen(true)}
                  className="gap-2 h-9 text-destructive border-destructive/40 hover:bg-destructive/10 font-medium"
                  title="Cancelar Ciclo"
                >
                  <Ban className="h-4 w-4" />
                  Cancelar Ciclo
                </Button>
              )
            })()}
        </div>
      </div>

      {/* Painel Informativo da Chamada e Contratos Participantes Derivados */}
      {selectedCiclo && (
        <div className="bg-muted/40 border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">
              Ciclo {selectedCiclo.nome}
              {selectedChamada ? ` — Chamada ${selectedChamada.chamada}` : ''}:
            </span>
            <span className="text-muted-foreground">{resumoFasesTexto}</span>
            {selectedChamada && (
              <Badge variant="outline" className="text-[11px]">
                {selectedChamada.programa} •{' '}
                {selectedChamada.dependencia_administrativa || 'Municipal/Estadual'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Contratos da Chamada (
              {contratosParticipantes.length}):
            </span>
            {contratosParticipantes.length === 0 ? (
              <span className="text-muted-foreground italic">Nenhum contrato ativo</span>
            ) : (
              contratosParticipantes.map((c) => (
                <Badge
                  key={c.id}
                  variant="secondary"
                  className="text-[11px] font-mono"
                  title={`Contrato ativo da chamada: ${c.numero}`}
                >
                  {c.numero}
                </Badge>
              ))
            )}
          </div>
        </div>
      )}

      {/* Painel de Fases do Ciclo da Chamada (Fluxo: Coletando → Correção → Coleta Encerrada → Fechado) */}
      <Card className="border-t-4 border-t-primary">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Fases:{' '}
                  {selectedCiclo?.nome || 'Nenhum ciclo'}
                  {selectedChamada ? (
                    <span className="text-primary font-normal">[{selectedChamada.chamada}]</span>
                  ) : null}
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
                {currentFase === 'cancelado' && (
                  <Badge variant="destructive" className="text-xs">
                    Cancelado{' '}
                    {selectedCiclo?.motivo_cancelamento
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
                      {formatDespachoAmigavel(getDespachoEfetivoCiclo(selectedCiclo), true)}
                    </span>{' '}
                    • Fluxo Operacional: <em>Coletando → Correção → Coleta Encerrada → Fechado</em>
                  </>
                )}
              </CardDescription>
            </div>

            <Badge
              className={`text-sm px-3 py-1 font-semibold ${
                currentFase === 'coletando'
                  ? 'bg-blue-600'
                  : currentFase === 'correcao'
                    ? 'bg-amber-600'
                    : currentFase === 'coleta_encerrada' ||
                        currentFase === 'coletado' ||
                        currentFase === 'coleta encerrada'
                      ? 'bg-purple-600'
                      : currentFase === 'fechado'
                        ? 'bg-emerald-700'
                        : 'bg-destructive'
              }`}
            >
              Fase Atual: {formatFaseAmigavel(currentFase)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Fase 1: Coletando */}
            <div
              className={`p-4 rounded-lg border-2 transition-all ${
                currentFase === 'coletando'
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Fase 1
                </span>
                <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center">
                  <Clock className="h-4 w-4 stroke-[1.8]" />
                </div>
              </div>
              <h3 className="font-semibold text-base mb-1">Coletando</h3>
              <p className="text-xs text-muted-foreground mb-3">
                importa ✓ · pedido ✓ · despacho ✗
              </p>
              <Button
                size="sm"
                variant={currentFase === 'coletando' ? 'default' : 'outline'}
                className="w-full text-xs"
                disabled={updating || currentFase === 'coletando' || currentFase === 'cancelado'}
                onClick={() => handleChangeFase('coletando')}
              >
                {currentFase === 'coletando' ? 'Fase Ativa' : 'Mudar para Coletando'}
              </Button>
            </div>

            {/* Fase 2: Correção */}
            <div
              className={`p-4 rounded-lg border-2 transition-all ${
                currentFase === 'correcao'
                  ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Fase 2
                </span>
                <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 stroke-[1.8]" />
                </div>
              </div>
              <h3 className="font-semibold text-base mb-1">Correção</h3>
              <p className="text-xs text-muted-foreground mb-3">
                importa ✓ · pedido ✓ · despacho ✗
              </p>
              <Button
                size="sm"
                variant={currentFase === 'correcao' ? 'default' : 'outline'}
                className="w-full text-xs"
                disabled={updating || currentFase === 'correcao' || currentFase === 'cancelado'}
                onClick={() => handleChangeFase('correcao')}
              >
                {currentFase === 'correcao' ? 'Fase Ativa' : 'Mudar para Correção'}
              </Button>
            </div>

            {/* Fase 3: Coleta Encerrada */}
            {(() => {
              const isColetaEncerrada =
                currentFase === 'coleta_encerrada' ||
                currentFase === 'coletado' ||
                currentFase === 'coleta encerrada'
              return (
                <div
                  className={`p-4 rounded-lg border-2 transition-all ${
                    isColetaEncerrada
                      ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                      Fase 3
                    </span>
                    <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 flex items-center justify-center">
                      <Truck className="h-4 w-4 stroke-[1.8]" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-base mb-1">Coleta Encerrada</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    importa ✗ · entrada ✗ · despacho ✓ · cancela ✗ (exceto logístico)
                  </p>
                  <div className="space-y-1.5">
                    <Button
                      size="sm"
                      variant={isColetaEncerrada ? 'default' : 'outline'}
                      className="w-full text-xs"
                      disabled={updating || isColetaEncerrada || currentFase === 'cancelado'}
                      onClick={() => handleChangeFase('coleta_encerrada')}
                    >
                      {isColetaEncerrada ? 'Fase Ativa' : 'Encerrar Coleta'}
                    </Button>
                    {isColetaEncerrada && (
                      <Button
                        size="sm"
                        className="w-full text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1"
                        onClick={() => {
                          const chId = selectedCiclo?.chamada_id
                          const cId = selectedCiclo?.id
                          const params = new URLSearchParams()
                          if (chId) params.set('chamadaId', chId)
                          if (cId) params.set('cicloId', cId)
                          navigate(`/rotas${params.toString() ? `?${params.toString()}` : ''}`)
                        }}
                        title="Ir para tela de rotas da chamada e despacho"
                      >
                        <Truck className="h-3.5 w-3.5" /> Colocar em Rota
                      </Button>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Fase 4: Fechado */}
            <div
              className={`p-4 rounded-lg border-2 transition-all ${
                currentFase === 'fechado'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  Fase 4
                </span>
                <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 stroke-[1.8]" />
                </div>
              </div>
              <h3 className="font-semibold text-base mb-1">Fechado</h3>
              <p className="text-xs text-muted-foreground mb-3">
                importa ✗ · entrada ✗ · despacho ✗ · cancela ✗ (exceto logístico)
              </p>
              <Button
                size="sm"
                variant={currentFase === 'fechado' ? 'default' : 'outline'}
                className="w-full text-xs"
                disabled={updating || currentFase === 'fechado' || currentFase === 'cancelado'}
                onClick={() => handleChangeFase('fechado')}
              >
                {currentFase === 'fechado' ? 'Fase Ativa' : 'Fechar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo do Funil do Ciclo da Chamada */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Escolas Atendidas</p>
            <p className="text-xl font-bold text-primary">{funilMetrics.escolasAtendidas}</p>
            <p className="text-[10px] text-muted-foreground">
              de {funilMetrics.escolasTotal} vinculadas à chamada
            </p>
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
            <p className="text-[10px] text-muted-foreground">neste ciclo</p>
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
                Identificação precoce de escolas da chamada sem envio de pedidos ou com
                inconsistências no ciclo {selectedChamada ? `(${selectedChamada.chamada})` : ''}.
                Distingue escolas que já receberam o link daquelas que já preencheram o formulário.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-medium">
                {alertSchools.filter((a) => a.pendenciaTipo === 'sem_pedido_link_enviado').length}{' '}
                link enviado / pendente preenchimento
              </Badge>
              <Badge variant="outline" className="text-xs font-medium">
                {alertSchools.length} pendência(s) detectada(s)
              </Badge>
            </div>{' '}
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
                  <TableHead>Status Comunicação / Pedido</TableHead>
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
                        ciclo da chamada!
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  alertSchools.map((item) => {
                    const isSemPedido =
                      item.pendenciaTipo === 'sem_pedido' ||
                      item.pendenciaTipo === 'sem_pedido_link_enviado'

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
                          <div className="flex items-start gap-2 max-w-[380px]">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.pendenciaTipo === 'sem_pedido_link_enviado' ? (
                                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[10px]">
                                    Link Enviado (Pendente Preenchimento)
                                  </Badge>
                                ) : isSemPedido ? (
                                  <Badge variant="destructive" className="text-[10px]">
                                    Link Não Disparado (Sem Pedido)
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-600 text-[10px]">
                                    Pedido Inconsistente
                                  </Badge>
                                )}
                                {item.preencheuFormulario && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300"
                                  >
                                    Preencheu Formulário
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-foreground/80 leading-tight">
                                {item.pendenciaDesc}
                              </span>
                            </div>
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

      {/* Modal Cancelar Ciclo Inteiro (operando sobre o ciclo selecionado) */}
      <CancelarCicloDialog
        ciclo={selectedCiclo}
        open={cancelarCicloInteiroOpen}
        onOpenChange={setCancelarCicloInteiroOpen}
      />
    </div>
  )
}
