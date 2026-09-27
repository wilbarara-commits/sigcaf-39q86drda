import React, { useState, useEffect } from 'react'
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
import { Loader2, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useApp } from '@/context/app-context'
import { isCicloNaoTerminal } from '@/lib/cicloUtils'
import pb from '@/lib/pocketbase/client'
import { contratosService } from '@/services/contratos'
import { toast } from 'sonner'

export interface DesvincularEscolaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId?: string | null
  contratoEscolaId?: string | null
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

export const DesvincularEscolaDialog: React.FC<DesvincularEscolaDialogProps> = ({
  open,
  onOpenChange,
  contractId,
  contratoEscolaId,
  escolaId,
  escolaNome,
  onSuccess,
  onRemoveDraft,
}) => {
  const { cicloContratos, ciclos, orders, refreshData } = useApp()
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pedidosEmAberto, setPedidosEmAberto] = useState<PedidoConflito[]>([])

  useEffect(() => {
    if (!open) {
      setPedidosEmAberto([])
      setChecking(false)
      setSubmitting(false)
      return
    }

    // Se for contrato novo (ainda não salvo no banco), não há pedidos atrelados a este contrato
    if (!contractId) {
      setPedidosEmAberto([])
      return
    }

    const verificarPedidos = async () => {
      setChecking(true)
      try {
        // 1. Filtrar cicloContratos do contrato onde o ciclo tem fase não-terminal
        const ccsDoContrato = (cicloContratos || []).filter((cc) => cc.contrato_id === contractId)

        const cicloIdsNaoTerminais = new Set<string>()
        const cicloNomeMap = new Map<string, string>()

        for (const cc of ccsDoContrato) {
          const cicloId = cc.ciclo_id
          if (!cicloId) continue

          // Localiza o ciclo para pegar a fase
          const ciclo = (ciclos || []).find((c) => c.id === cicloId)
          const fase = cc.fase || ciclo?.status || 'coletando'
          if (fase && isCicloNaoTerminal(fase)) {
            cicloIdsNaoTerminais.add(cicloId)
            if (ciclo?.nome) {
              cicloNomeMap.set(cicloId, ciclo.nome)
            }
          }
        }

        if (cicloIdsNaoTerminais.size === 0) {
          setPedidosEmAberto([])
          setChecking(false)
          return
        }

        // 2. Verificar pedidos da escola nesses ciclos com status diferente de 'Cancelado'
        const cicloIdsArray = Array.from(cicloIdsNaoTerminais)

        // Busca pedidos direto no PocketBase para garantir dados frescos
        let conflitos: PedidoConflito[] = []

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
          // Fallback para o contexto em memória caso o filtro retorne erro
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

        setPedidosEmAberto(conflitos)
      } catch (err) {
        console.error('Erro ao verificar pedidos para desvinculação:', err)
      } finally {
        setChecking(false)
      }
    }

    verificarPedidos()
  }, [open, contractId, escolaId, cicloContratos, ciclos, orders])

  const handleConfirm = async () => {
    // Se for contrato em rascunho (não persistido)
    if (!contractId || !contratoEscolaId) {
      if (onRemoveDraft) {
        onRemoveDraft()
      }
      toast.success(`A escola ${escolaNome} foi removida da lista.`)
      onOpenChange(false)
      return
    }

    // Contrato persistido
    try {
      setSubmitting(true)
      await contratosService.unlinkEscola(contratoEscolaId)
      await refreshData()
      toast.success(`A escola ${escolaNome} foi desvinculada com sucesso desta operação.`)
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Erro ao desvincular escola:', error)
      toast.error(error?.message || 'Não foi possível desvincular a escola da operação.')
    } finally {
      setSubmitting(false)
    }
  }

  const hasImpedimento = pedidosEmAberto.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Desvincular Escola da Operação</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm text-foreground">
            A escola <span className="font-semibold text-foreground">{escolaNome}</span> deixa de
            pertencer a esta operação. Pedidos já existentes permanecem no histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {checking ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Verificando pedidos em aberto...</span>
            </div>
          ) : hasImpedimento ? (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="font-semibold">Desvinculação impedida</AlertTitle>
              <AlertDescription className="text-xs space-y-2 mt-1">
                <p>
                  Existem pedidos em aberto para esta escola em ciclos ativos desta operação. Para
                  desvincular a escola, é necessário cancelar os pedidos em aberto primeiro.
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
          ) : (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Nenhum pedido em aberto pendente de cancelamento.</span>
              </div>
              <p>
                Após a confirmação, o vínculo atual será finalizado e a escola ficará disponível
                para outras operações.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
            variant="destructive"
            disabled={checking || hasImpedimento || submitting}
            onClick={handleConfirm}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Desvinculando...
              </>
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
