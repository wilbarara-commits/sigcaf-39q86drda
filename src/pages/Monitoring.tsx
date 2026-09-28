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
  getDespachoPrevistoCiclo,
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
    cicloContratos,
    contracts,
    contractSchools,
    activeCiclo,
    updateCicloContratoFase,
    schools,
    orders,
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
  const [selectedContratoId, setSelectedContratoId] = useState<string>('todos')
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

  // Contratos vinculados ao ciclo selecionado (deduplicados estritamente por contratoId)
  const contratosVinculados = useMemo(() => {
    if (!selectedCiclo) return []
    const ccList = cicloContratos.filter((cc) => cc.ciclo_id === selectedCiclo.id)

    // Deduplica ccList por contrato_id garantindo apenas 1 entrada por contrato
    const seenContratos = new Set<string>()
    const uniqueList: Array<{
      contratoId: string
      numero: string
      fase: string
      motivo_cancelamento?: string
      data_cancelamento?: string
    }> = []

    if (ccList.length === 0) {
      for (const c of contracts) {
        if (c.status === 'Ativo' && !seenContratos.has(c.id)) {
          seenContratos.add(c.id)
          uniqueList.push({
            contratoId: c.id,
            numero: c.numero,
            fase: selectedCiclo.status || 'coletando',
            motivo_cancelamento: undefined,
            data_cancelamento: undefined,
          })
        }
      }
      return uniqueList
    }

    for (const cc of ccList) {
      if (!cc.contrato_id || seenContratos.has(cc.contrato_id)) continue
      seenContratos.add(cc.contrato_id)
      const contrato = contracts.find((c) => c.id === cc.contrato_id)
      uniqueList.push({
        contratoId: cc.contrato_id,
        numero: contrato?.numero || cc.expand?.contrato_id?.numero || 'Contrato',
        fase: cc.fase,
        motivo_cancelamento: cc.motivo_cancelamento,
        data_cancelamento: cc.data_cancelamento,
      })
    }
    return uniqueList
  }, [selectedCiclo, cicloContratos, contracts])

  // Ajustar selectedContratoId se não existir mais na lista
  useEffect(() => {
    if (selectedContratoId !== 'todos') {
      const exists = contratosVinculados.some((c) => c.contratoId === selectedContratoId)
      if (!exists) {
        if (contratosVinculados.length > 0) {
          setSelectedContratoId(contratosVinculados[0].contratoId)
        } else {
          setSelectedContratoId('todos')
        }
      }
    } else if (contratosVinculados.length === 1) {
      setSelectedContratoId(contratosVinculados[0].contratoId)
    }
  }, [contratosVinculados, selectedContratoId])

  // Vínculo do contrato selecionado atualmente
  const currentCicloContrato = useMemo(() => {
    if (!selectedCiclo || selectedContratoId === 'todos') return null
    return (
      cicloContratos.find(
        (cc) => cc.ciclo_id === selectedCiclo.id && cc.contrato_id === selectedContratoId,
      ) || null
    )
  }, [selectedCiclo, selectedContratoId, cicloContratos])

  // Fase em vigor na tela: se tem contrato específico selecionado, usa a fase dele; senão usa resumo/predominante
  const currentFase = useMemo(() => {
    if (currentCicloContrato) {
      return currentCicloContrato.fase || 'coletando'
    }
    if (contratosVinculados.length > 0) {
      // Se todos estiverem na mesma fase
      const fases = contratosVinculados.map((c) => c.fase)
      if (fases.every((f) => f === fases[0])) return fases[0]
      if (fases.some((f) => f === 'coletando')) return 'coletando'
      if (fases.some((f) => f === 'correcao')) return 'correcao'
      if (
        fases.some((f) => f === 'coleta_encerrada' || f === 'coletado' || f === 'coleta encerrada')
      ) {
        return 'coleta_encerrada'
      }
      if (fases.every((f) => f === 'fechado')) return 'fechado'
      if (fases.every((f) => f === 'cancelado')) return 'cancelado'
    }
    return selectedCiclo?.status || 'coletando'
  }, [currentCicloContrato, contratosVinculados, selectedCiclo])

  const isSelectedAtivo = activeCiclo?.id === selectedCiclo?.id

  // Badge derivado de atraso
  const isFechamentoPendente = Boolean(
    selectedCiclo && isCicloNaoTerminal(currentFase) && !isSelectedAtivo,
  )
  const diasAtraso = selectedCiclo ? calcularDiasAtrasoFechamento(selectedCiclo.data_fim) : 0

  // Mapa de escolas associadas ao contrato selecionado (se filtrado)
  const escolasFiltradasIds = useMemo(() => {
    if (selectedContratoId === 'todos') return null
    const links = contractSchools.filter((cs) => cs.contrato_id === selectedContratoId)
    return new Set(links.map((cs) => cs.escola_id))
  }, [selectedContratoId, contractSchools])

  // Pedidos do ciclo selecionado + contrato selecionado
  const cicloOrders = useMemo(() => {
    if (!selectedCiclo) return []
    let base = orders.filter((o) => o.cicloId === selectedCiclo.id && o.status !== 'Cancelado')
    if (escolasFiltradasIds) {
      base = base.filter((o) => escolasFiltradasIds.has(o.schoolId))
    }
    return base
  }, [orders, selectedCiclo, escolasFiltradasIds])

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

    const escolasBaseTotal = escolasFiltradasIds ? escolasFiltradasIds.size : schools.length

    return {
      totalPedidos,
      pedidosValidados,
      pedidosInconsistentes,
      escolasAtendidas: schoolsWithOrders.size,
      escolasTotal: escolasBaseTotal,
      volumeTotal,
      valorTotal,
    }
  }, [cicloOrders, schoolsWithOrders, escolasFiltradasIds, schools])

  // Escolas sem pedido lançado no ciclo selecionado
  const alertSchools = useMemo(() => {
    if (!selectedCiclo || currentFase === 'cancelado') return []

    const pool = escolasFiltradasIds
      ? schools.filter((s) => escolasFiltradasIds.has(s.id))
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
    escolasFiltradasIds,
    enviosWhatsapp,
  ])

  // Mudança de fase: opera sobre o par ciclo + contrato selecionado
  const handleChangeFase = async (
    newFase: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado',
  ) => {
    if (!selectedCiclo) {
      toast.error('Nenhum ciclo selecionado.')
      return
    }

    if (currentFase === 'cancelado') {
      toast.error('Não é possível alterar a fase de um contrato/ciclo cancelado.')
      return
    }

    // Normaliza para o token novo 'coleta_encerrada'
    const tokenFase = newFase === 'coletado' ? 'coleta_encerrada' : newFase

    setUpdating(true)
    try {
      if (selectedContratoId && selectedContratoId !== 'todos') {
        await updateCicloContratoFase(selectedCiclo.id, selectedContratoId, tokenFase)
      } else {
        // Se 'todos', aplica a todos os contratos vinculados ao ciclo
        for (const c of contratosVinculados) {
          if (c.fase !== 'cancelado') {
            await updateCicloContratoFase(selectedCiclo.id, c.contratoId, tokenFase)
          }
        }
      }
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
    const contratosMap = new Map(contracts.map((c) => [c.id, { numero: c.numero }]))
    return gerarResumoFasesCiclo(selectedCiclo.id, cicloContratos, contratosMap)
  }, [selectedCiclo, cicloContratos, contracts])

  const selectedContratoNumero = useMemo(() => {
    if (selectedContratoId === 'todos') return 'Todos os contratos'
    const found = contracts.find((c) => c.id === selectedContratoId)
    return found?.numero || 'Contrato Selecionado'
  }, [selectedContratoId, contracts])

  return (
    <div className="space-y-6">
      {/* Cabeçalho com Seletores (Ciclo e Contrato) e Botões de Ação */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoramento do Ciclo</h1>
          <p className="text-muted-foreground">
            Acompanhe a evolução de fases por contrato, funil de pedidos e travas operacionais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Ciclos */}
          <div className="w-[200px]">
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
                      {c.nome} {isAct ? '(Ativo)' : ''}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Seletor de Contrato (NOVO) */}
          <div className="w-[220px]">
            <Select value={selectedContratoId} onValueChange={(val) => setSelectedContratoId(val)}>
              <SelectTrigger className="h-9 font-medium">
                <div className="flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Contrato" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {contratosVinculados.length > 1 && (
                  <SelectItem value="todos">
                    Todos os contratos ({contratosVinculados.length})
                  </SelectItem>
                )}
                {contratosVinculados.map((c) => (
                  <SelectItem key={c.contratoId} value={c.contratoId}>
                    {c.numero} — {formatFaseAmigavel(c.fase)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Botão ABRIR CICLO */}
          <Button onClick={() => setAbrirCicloOpen(true)} className="gap-2 h-9">
            <CalendarPlus className="h-4 w-4" /> Abrir Ciclo
          </Button>

          {/* Botão Cancelar Ciclo (cancela o CICLO INTEIRO selecionado no seletor) */}
          {selectedCiclo &&
            (() => {
              const statusCiclo = derivarStatusCiclo(
                selectedCiclo.id,
                cicloContratos,
                selectedCiclo.status,
              )
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
                  title="Cancelar Ciclo Inteiro"
                >
                  <Ban className="h-4 w-4" />
                  Cancelar Ciclo
                </Button>
              )
            })()}
        </div>
      </div>

      {/* Painel de Resumo das Fases dos Contratos */}
      {selectedCiclo && (
        <div className="bg-muted/40 border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">
              Resumo do Ciclo {selectedCiclo.nome}:
            </span>
            <span className="text-muted-foreground">{resumoFasesTexto}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {contratosVinculados.map((c) => (
              <Badge
                key={c.contratoId}
                variant={selectedContratoId === c.contratoId ? 'default' : 'outline'}
                className="cursor-pointer text-[11px]"
                onClick={() => setSelectedContratoId(c.contratoId)}
              >
                {c.numero}: {formatFaseAmigavel(c.fase)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Painel de Fases (Fluxo: Coletando → Correção → Coletado → Fechado) */}
      <Card className="border-t-4 border-t-primary">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Fases:{' '}
                  {selectedCiclo?.nome || 'Nenhum ciclo'} —{' '}
                  <span className="text-primary font-normal">{selectedContratoNumero}</span>
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
                    {currentCicloContrato?.motivo_cancelamento
                      ? `— ${currentCicloContrato.motivo_cancelamento}`
                      : selectedCiclo?.motivo_cancelamento
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
                <Clock className="h-4 w-4 text-blue-600" />
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
                <AlertTriangle className="h-4 w-4 text-amber-600" />
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
                    <Truck className="h-4 w-4 text-purple-600" />
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
                          const selectedContratoObj = contracts.find(
                            (c) => c.id === selectedContratoId,
                          )
                          const chId = selectedContratoObj?.chamada_id
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
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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

      {/* Resumo do Funil do Ciclo e Contrato Selecionado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Escolas Atendidas</p>
            <p className="text-xl font-bold text-primary">{funilMetrics.escolasAtendidas}</p>
            <p className="text-[10px] text-muted-foreground">
              de {funilMetrics.escolasTotal} cadastradas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pedidos Filtrados</p>
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
            <p className="text-[10px] text-muted-foreground">no filtro atual</p>
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
                ciclo ({selectedContratoNumero}). Distingue escolas que já receberam o link daquelas
                que já preencheram o formulário.
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
                        contrato/ciclo!
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
