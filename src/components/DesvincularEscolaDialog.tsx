import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Truck,
  ArrowRightLeft,
  Trash2,
  HelpCircle,
} from 'lucide-react'
import { useApp } from '@/context/app-context'
import { isCicloNaoTerminal } from '@/lib/cicloUtils'
import pb from '@/lib/pocketbase/client'
import { contratosService } from '@/services/contratos'
import { rotasService } from '@/services/rotas'
import { toast } from 'sonner'

export interface DesvincularEscolaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId?: string | null
  contratoEscolaId?: string | null
  chamadaId?: string | null
  escolaId: string
  escolaNome: string
  onSuccess: () => void
  onRemoveDraft?: () => void
}

interface PedidoConflito {
  id: string
  codigo?: string
  numero?: string
  status: string
  cicloNome?: string
}

interface RotaAtivaInfo {
  rotaId: string
  rotaNome: string
  paradaId: string
  ordem: number
  chamadaId?: string
  contratoId?: string
}

export const DesvincularEscolaDialog: React.FC<DesvincularEscolaDialogProps> = ({
  open,
  onOpenChange,
  contractId,
  contratoEscolaId,
  chamadaId,
  escolaId,
  escolaNome,
  onSuccess,
  onRemoveDraft,
}) => {
  const {
    contracts,
    chamadas,
    rotasLogisticas,
    paradasRota,
    despachos,
    cicloContratos,
    ciclos,
    orders,
    refreshData,
  } = useApp()

  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pedidosEmAberto, setPedidosEmAberto] = useState<PedidoConflito[]>([])
  const [rotasAtivas, setRotasAtivas] = useState<RotaAtivaInfo[]>([])

  // Opção escolhida quando a escola está em rota: 'transfer' | 'remove_route'
  const [routeAction, setRouteAction] = useState<'transfer' | 'remove_route'>('transfer')
  // ID do contrato de destino na mesma chamada para transferência
  const [targetContractId, setTargetContractId] = useState<string>('')

  // Identificar contrato atual
  const currentContract = useMemo(() => {
    if (!contractId) return null
    return contracts.find((c) => c.id === contractId) || null
  }, [contracts, contractId])

  // Identificar chamadaId efetiva
  const effectiveChamadaId = useMemo(() => {
    return chamadaId || currentContract?.chamada_id || null
  }, [chamadaId, currentContract])

  // Contratos alternativos elegíveis da mesma chamada
  const eligibleContracts = useMemo(() => {
    if (!effectiveChamadaId) return []
    return contracts.filter(
      (c) => c.chamada_id === effectiveChamadaId && c.id !== contractId && c.status === 'Ativo',
    )
  }, [contracts, effectiveChamadaId, contractId])

  // Inicialização e verificação de pedidos e rotas ao abrir
  useEffect(() => {
    if (!open) {
      setPedidosEmAberto([])
      setRotasAtivas([])
      setChecking(false)
      setSubmitting(false)
      setTargetContractId('')
      setRouteAction('transfer')
      return
    }

    // Se for rascunho sem contractId
    if (!contractId) {
      setPedidosEmAberto([])
      setRotasAtivas([])
      return
    }

    const verificarPedidosERotas = async () => {
      setChecking(true)
      try {
        // ------------------------------------------------------------------
        // 1. Verificar pedidos em aberto em ciclos ativos/não-terminais
        // ------------------------------------------------------------------
        const ccsDoContrato = (cicloContratos || []).filter((cc) => cc.contrato_id === contractId)
        const cicloIdsNaoTerminais = new Set<string>()
        const cicloNomeMap = new Map<string, string>()

        for (const cc of ccsDoContrato) {
          const cicloId = cc.ciclo_id
          if (!cicloId) continue
          const ciclo = (ciclos || []).find((c) => c.id === cicloId)
          const fase = cc.fase || ciclo?.status || 'coletando'
          if (fase && isCicloNaoTerminal(fase)) {
            cicloIdsNaoTerminais.add(cicloId)
            if (ciclo?.nome) {
              cicloNomeMap.set(cicloId, ciclo.nome)
            }
          }
        }

        let conflitos: PedidoConflito[] = []
        if (cicloIdsNaoTerminais.size > 0) {
          const cicloIdsArray = Array.from(cicloIdsNaoTerminais)
          try {
            const filterParts = cicloIdsArray.map((cId) => `ciclo_id = "${cId}"`).join(' || ')
            const pbFilter = `(${filterParts}) && escola_id = "${escolaId}" && status != "Cancelado"`
            const records = await pb.collection('pedidos').getFullList({
              filter: pbFilter,
              sort: '-created',
            })
            conflitos = records.map((r: any) => ({
              id: r.id,
              codigo: r.codigo || r.numero || r.id.substring(0, 8),
              status: r.status,
              cicloNome: cicloNomeMap.get(r.ciclo_id) || 'Ciclo ativo',
            }))
          } catch (pbErr) {
            console.warn('Erro ao consultar pedidos via PB, usando orders do contexto:', pbErr)
            const ordersContext = (orders || []).filter((o) => {
              return (
                cicloIdsNaoTerminais.has(o.cicloId) &&
                o.schoolId === escolaId &&
                o.status !== 'Cancelado'
              )
            })
            conflitos = ordersContext.map((o) => ({
              id: o.id,
              codigo: o.id.substring(0, 8),
              status: o.status,
              cicloNome: cicloNomeMap.get(o.cicloId) || 'Ciclo ativo',
            }))
          }
        }
        setPedidosEmAberto(conflitos)

        // ------------------------------------------------------------------
        // 2. Verificar rotas em que a escola é parada ativa
        // ------------------------------------------------------------------
        let paradasList: any[] = []
        try {
          paradasList = await pb.collection('paradas_rota').getFullList({
            filter: `escola_id = "${escolaId}"`,
            expand: 'rota_id',
          })
        } catch (pbErr) {
          console.warn('Erro ao consultar paradas_rota via PB, usando paradasRota:', pbErr)
          paradasList = (paradasRota || []).filter((p) => p.escola_id === escolaId)
        }

        // Buscar despachos da escola ou rotas para conferir se há despacho finalizado/ativo
        const rotasIdentificadas: RotaAtivaInfo[] = []
        for (const p of paradasList) {
          const rotaId = p.rota_id || p.expand?.rota_id?.id
          if (!rotaId) continue

          const rotaObj = p.expand?.rota_id || rotasLogisticas.find((r) => r.id === rotaId)

          // Só consideramos ativa se a rota estiver ativa (não arquivada)
          if (rotaObj && rotaObj.ativa === false) {
            continue
          }

          // Se a rota pertence à mesma chamada ou ao mesmo contrato
          const rotaPertenceChamada =
            (effectiveChamadaId && rotaObj?.chamada_id === effectiveChamadaId) ||
            rotaObj?.contrato_id === contractId ||
            (currentContract?.chamada_id && rotaObj?.chamada_id === currentContract.chamada_id)

          // Verifica se todos os despachos dessa rota foram finalizados ('Entregue' ou 'Cancelado')
          // Se tiver despacho 'Em Rota', ela está ativa na rua.
          // Rotas planejadas sem despacho ou com paradas ativas são consideradas ativas na chamada.
          const despachosDaRota = (despachos || []).filter((d) => d.rota_id === rotaId)
          const temDespachoEmRota = despachosDaRota.some((d) => d.status === 'Em Rota')

          // Toda parada cadastrada em rota ativa da chamada é uma parada ativa
          if (rotaPertenceChamada || temDespachoEmRota) {
            rotasIdentificadas.push({
              rotaId,
              rotaNome: rotaObj?.nome || `Rota #${rotaId.substring(0, 6)}`,
              paradaId: p.id,
              ordem: p.ordem || 1,
              chamadaId: rotaObj?.chamada_id,
              contratoId: rotaObj?.contrato_id,
            })
          }
        }

        // Deduplicar rotas por rotaId
        const seenRotaIds = new Set<string>()
        const dedupedRotas = rotasIdentificadas.filter((r) => {
          if (seenRotaIds.has(r.rotaId)) return false
          seenRotaIds.add(r.rotaId)
          return true
        })

        setRotasAtivas(dedupedRotas)

        // Se houver contratos elegíveis, pré-seleciona o primeiro
        // e define ação padrão como 'transfer'; se não houver contratos, define 'remove_route'
        if (eligibleContracts.length > 0) {
          setTargetContractId(eligibleContracts[0].id)
          setRouteAction('transfer')
        } else {
          setTargetContractId('')
          setRouteAction('remove_route')
        }
      } catch (err) {
        console.error('Erro ao verificar pedidos e rotas para desvinculação:', err)
      } finally {
        setChecking(false)
      }
    }

    verificarPedidosERotas()
  }, [
    open,
    contractId,
    escolaId,
    cicloContratos,
    ciclos,
    orders,
    effectiveChamadaId,
    rotasLogisticas,
    paradasRota,
    despachos,
    eligibleContracts,
    currentContract,
  ])

  // Ao alterar eligibleContracts, se o contrato selecionado não for mais válido
  useEffect(() => {
    if (eligibleContracts.length > 0) {
      if (!targetContractId || !eligibleContracts.some((c) => c.id === targetContractId)) {
        setTargetContractId(eligibleContracts[0].id)
      }
    } else {
      setRouteAction('remove_route')
      setTargetContractId('')
    }
  }, [eligibleContracts, targetContractId])

  const hasImpedimentoPedidos = pedidosEmAberto.length > 0
  const isEscolaEmRota = rotasAtivas.length > 0
  const temContratosParaTransferir = eligibleContracts.length > 0

  // Execução da desvinculação
  const handleConfirm = async () => {
    // 1. Caso rascunho
    if (!contractId || !contratoEscolaId) {
      if (onRemoveDraft) {
        onRemoveDraft()
      }
      toast.success(`A escola ${escolaNome} foi removida da lista.`)
      onOpenChange(false)
      return
    }

    setSubmitting(true)
    try {
      // 2. Se a escola estiver em rota, processar a escolha do usuário
      if (isEscolaEmRota) {
        if (routeAction === 'transfer') {
          // Opção A: Transferir escola para outro contrato da mesma chamada
          if (!targetContractId) {
            toast.error('Selecione o contrato de destino para onde a escola será transferida.')
            setSubmitting(false)
            return
          }

          const targetContract = contracts.find((c) => c.id === targetContractId)
          const targetContratoNumero = targetContract?.numero || targetContractId

          // 1. Encerra o vínculo com o contrato atual
          await contratosService.unlinkEscola(contratoEscolaId)

          // 2. Cria/reativa o vínculo com o novo contrato na mesma chamada
          // Pega a rota da primeira rota ativa como referência
          const primeiraRota = rotasAtivas[0]
          await contratosService.linkEscola({
            contrato_id: targetContractId,
            escola_id: escolaId,
            rota_id: primeiraRota?.rotaId || undefined,
            rota: primeiraRota?.rotaNome || undefined,
          })

          // 3. Atualizar contrato de origem das paradas / escola
          // Como as paradas_rota preservam a parada na rota da chamada e o badge
          // vem do contrato_escolas ativo, o vínculo no novo contrato garante que
          // o contrato de origem agora é o contrato de destino.
          // Também se houver pedidos pendentes não-conflitantes, eles passam a herdar a rota.

          await refreshData()
          toast.success(
            `A escola ${escolaNome} foi transferida com sucesso para o Contrato ${targetContratoNumero}. A rota foi mantida!`,
          )
          onSuccess()
          onOpenChange(false)
          return
        } else if (routeAction === 'remove_route') {
          // Opção B: Remover a escola da rota em que está e depois desvincular do contrato
          for (const rotaInfo of rotasAtivas) {
            try {
              if (rotaInfo.rotaId && escolaId) {
                await rotasService.removerParadaDaRota(rotaInfo.rotaId, escolaId)
              } else if (rotaInfo.paradaId) {
                await rotasService.removerParada(rotaInfo.paradaId)
              }
            } catch (err) {
              console.warn(`Erro ao remover parada ${rotaInfo.paradaId}:`, err)
            }
          }

          // 2. Desvincular do contrato atual
          await contratosService.unlinkEscola(contratoEscolaId)

          await refreshData()
          toast.success(
            `A escola ${escolaNome} foi removida da(s) rota(s) e desvinculada do contrato com sucesso.`,
          )
          onSuccess()
          onOpenChange(false)
          return
        }
      }

      // 3. Se não estiver em rota, desvinculação padrão direta
      await contratosService.unlinkEscola(contratoEscolaId)
      await refreshData()
      toast.success(`A escola ${escolaNome} foi desvinculada com sucesso deste contrato.`)
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Erro ao processar desvinculação da escola:', error)
      toast.error(error?.message || 'Não foi possível desvincular a escola do contrato.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Desvincular Escola do Contrato</DialogTitle>
          </div>
          <DialogDescription className="pt-1.5 text-xs text-foreground">
            A escola <span className="font-semibold text-foreground">{escolaNome}</span> deixa de
            pertencer ao contrato{' '}
            <span className="font-semibold text-foreground">
              {currentContract?.numero || 'atual'}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {checking ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Verificando pedidos em aberto e alocações em rotas...</span>
            </div>
          ) : hasImpedimentoPedidos ? (
            /* BLOQUEIO MANDATÓRIO: Pedidos em aberto */
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="font-semibold text-sm">Desvinculação impedida</AlertTitle>
              <AlertDescription className="text-xs space-y-2 mt-1">
                <p>
                  Existem pedidos em aberto para esta escola em ciclos ativos deste contrato. Para
                  desvincular a escola, é obrigatório cancelar os pedidos em aberto primeiro.
                </p>
                <div className="mt-2 space-y-1 rounded bg-background/80 p-2 text-foreground font-mono text-xs">
                  {pedidosEmAberto.map((p) => (
                    <div key={p.id} className="flex justify-between items-center text-[11px]">
                      <span>
                        Pedido #{p.codigo} ({p.cicloNome})
                      </span>
                      <span className="font-semibold text-destructive">{p.status}</span>
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          ) : isEscolaEmRota ? (
            /* ESCOLA EM ROTA: Aviso e Opções de Resolução */
            <div className="space-y-3">
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <AlertTitle className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                  Atenção: Escola alocada em rota ativa
                </AlertTitle>
                <AlertDescription className="text-xs space-y-1.5 mt-1 text-amber-800/90 dark:text-amber-200/90">
                  <p>
                    Esta escola está vinculada como parada na(s) seguinte(s) rota(s) da chamada:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {rotasAtivas.map((r) => (
                      <Badge
                        key={r.rotaId}
                        variant="secondary"
                        className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-medium text-[11px] gap-1"
                      >
                        <Truck className="h-3 w-3 text-amber-600" />
                        {r.rotaNome} ({r.ordem}ª parada)
                      </Badge>
                    ))}
                  </div>
                  <p className="pt-1 text-[11px]">
                    Como as rotas pertencem à chamada, escolha como deseja tratar esta alocação:
                  </p>
                </AlertDescription>
              </Alert>

              {/* Opções de Ação */}
              <div className="rounded-lg border p-3.5 space-y-3 bg-muted/20">
                <Label className="text-xs font-semibold text-foreground block">
                  Escolha a ação para a escola em rota:
                </Label>

                <RadioGroup
                  value={routeAction}
                  onValueChange={(val: 'transfer' | 'remove_route') => setRouteAction(val)}
                  className="space-y-2.5"
                >
                  {/* Opção 1: Transferir para outro contrato */}
                  <div
                    className={`rounded-lg border p-3 transition-colors ${
                      routeAction === 'transfer'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background'
                    } ${!temContratosParaTransferir ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    onClick={() => {
                      if (temContratosParaTransferir) setRouteAction('transfer')
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <RadioGroupItem
                        value="transfer"
                        id="opt-transfer"
                        disabled={!temContratosParaTransferir}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="space-y-1 min-w-0 flex-1">
                        <label
                          htmlFor="opt-transfer"
                          className="font-semibold text-foreground flex items-center gap-1.5 cursor-pointer text-xs"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                          Transferir para outro contrato da mesma chamada
                        </label>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Move o vínculo da escola para o novo contrato e preserva a parada na rota,
                          atualizando o contrato de origem.
                        </p>

                        {/* Seletor de Contrato de Destino */}
                        {routeAction === 'transfer' && temContratosParaTransferir && (
                          <div className="pt-2 space-y-1.5">
                            <Label htmlFor="target-contract" className="text-[11px] font-medium">
                              Contrato de destino na mesma chamada:
                            </Label>
                            <Select
                              value={targetContractId}
                              onValueChange={setTargetContractId}
                              disabled={submitting}
                            >
                              <SelectTrigger
                                id="target-contract"
                                className="h-8 text-xs bg-background"
                              >
                                <SelectValue placeholder="Selecione o contrato de destino..." />
                              </SelectTrigger>
                              <SelectContent>
                                {eligibleContracts.map((cnt) => {
                                  const chamadaNome =
                                    chamadas.find((ch) => ch.id === cnt.chamada_id)?.chamada ||
                                    cnt.numero_chamada ||
                                    'Chamada'
                                  return (
                                    <SelectItem key={cnt.id} value={cnt.id} className="text-xs">
                                      {cnt.numero} — {chamadaNome} ({cnt.tipo || 'PNAE'})
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {!temContratosParaTransferir && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 pt-1">
                            <HelpCircle className="h-3 w-3 shrink-0" />
                            Não há outro contrato ativo nesta chamada disponível para transferência.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Opção 2: Remover da rota e desvincular */}
                  <div
                    className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                      routeAction === 'remove_route'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background'
                    }`}
                    onClick={() => setRouteAction('remove_route')}
                  >
                    <div className="flex items-start gap-2.5">
                      <RadioGroupItem
                        value="remove_route"
                        id="opt-remove-route"
                        className="mt-0.5 shrink-0"
                      />
                      <div className="space-y-1 min-w-0 flex-1">
                        <label
                          htmlFor="opt-remove-route"
                          className="font-semibold text-foreground flex items-center gap-1.5 cursor-pointer text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          Remover a escola da rota e concluir desvinculação
                        </label>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Retira a parada de todas as rotas ativas desta chamada e finaliza o
                          vínculo com o contrato atual.
                        </p>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>
          ) : (
            /* ESCOLA SEM ROTA E SEM IMPEDIMENTO */
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Nenhum pedido em aberto e escola não alocada em rota.</span>
              </div>
              <p>
                Após a confirmação, o vínculo atual será finalizado e a escola ficará disponível
                para outros contratos.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={isEscolaEmRota && routeAction === 'transfer' ? 'default' : 'destructive'}
            disabled={
              checking ||
              hasImpedimentoPedidos ||
              submitting ||
              (isEscolaEmRota && routeAction === 'transfer' && !targetContractId)
            }
            onClick={handleConfirm}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processando...
              </>
            ) : isEscolaEmRota ? (
              routeAction === 'transfer' ? (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                  Transferir e Concluir
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Remover da Rota e Desvincular
                </>
              )
            ) : (
              'Confirmar Desvinculação'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DesvincularEscolaDialog
