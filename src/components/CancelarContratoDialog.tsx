import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Ban, AlertOctagon, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react'
import { useApp } from '@/context/app-context'
import { contratosService } from '@/services/contratos'
import { isCicloNaoTerminal, formatFaseAmigavel } from '@/lib/cicloUtils'
import type { Contract } from '@/lib/types'
import { toast } from 'sonner'

interface CancelarContratoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: Contract | null
  onSuccess?: () => void
}

export function CancelarContratoDialog({
  open,
  onOpenChange,
  contract,
  onSuccess,
}: CancelarContratoDialogProps) {
  const { ciclos, cicloContratos, contractSchools, orders, atestos, refreshData } = useApp()

  const [motivo, setMotivo] = useState('')
  const [confirmCicloChecked, setConfirmCicloChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Resetar campos quando o diálogo abre/fecha ou contrato muda
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmCicloChecked(false)
      setMotivo('')
    }
    onOpenChange(nextOpen)
  }

  // Análise de ciclos não-terminais e atestos emitidos
  const analise = useMemo(() => {
    if (!contract) {
      return {
        ciclosNaoTerminais: [],
        hasAtestosCicloNaoTerminal: false,
        totalAtestosBloqueantes: 0,
        escolasDoContratoIds: new Set<string>(),
      }
    }

    const escolasIds = new Set(
      contractSchools.filter((cs) => cs.contrato_id === contract.id).map((cs) => cs.escola_id),
    )

    // Ciclos nos quais o contrato participa
    const vinculosCiclo = cicloContratos.filter((cc) => cc.contrato_id === contract.id)

    // Detalhar cada ciclo vinculado que esteja em fase não-terminal
    const ciclosNaoTerminais: Array<{
      cicloId: string
      nome: string
      fase: string
      atestosCount: number
    }> = []

    let totalAtestosBloqueantes = 0

    for (const cc of vinculosCiclo) {
      const cicloObj = ciclos.find((c) => c.id === cc.ciclo_id)
      const fase = cc.fase || cicloObj?.status || 'coletando'

      if (isCicloNaoTerminal(fase)) {
        // Checar atestos emitidos para escolas deste contrato neste ciclo não-terminal
        const pedidosDoContratoNoCiclo = orders.filter(
          (o) => o.cicloId === cc.ciclo_id && escolasIds.has(o.schoolId),
        )
        const pedidoIds = new Set(pedidosDoContratoNoCiclo.map((o) => o.id))
        const atestosEmitidos = atestos.filter((a) => pedidoIds.has(a.orderId))

        const atestosCount = atestosEmitidos.length
        totalAtestosBloqueantes += atestosCount

        ciclosNaoTerminais.push({
          cicloId: cc.ciclo_id,
          nome: cicloObj?.nome || 'Ciclo',
          fase: formatFaseAmigavel(fase),
          atestosCount,
        })
      }
    }

    return {
      ciclosNaoTerminais,
      hasAtestosCicloNaoTerminal: totalAtestosBloqueantes > 0,
      totalAtestosBloqueantes,
      escolasDoContratoIds: escolasIds,
    }
  }, [contract, cicloContratos, ciclos, contractSchools, orders, atestos])

  if (!contract) return null

  const isBloqueadoPorAtestos = analise.hasAtestosCicloNaoTerminal
  const precisaConfirmacaoCiclo = analise.ciclosNaoTerminais.length > 0 && !isBloqueadoPorAtestos
  const isMotivoValido = motivo.trim().length > 0
  const podeConfirmar =
    !isBloqueadoPorAtestos && (!precisaConfirmacaoCiclo || confirmCicloChecked) && isMotivoValido

  const handleConfirmCancelar = async () => {
    if (!podeConfirmar || isSubmitting) return

    setIsSubmitting(true)
    try {
      await contratosService.cancelarContrato(contract.id, motivo)
      toast.success(`Operação ${contract.numero} cancelada com sucesso!`)
      handleOpenChange(false)
      await refreshData()
      onSuccess?.()
    } catch (err: any) {
      console.error('Erro ao cancelar contrato:', err)
      toast.error(
        err?.message || 'Falha ao cancelar a operação. Verifique sua conexão e tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Ban className="h-5 w-5 text-amber-600" />
            Cancelar Operação {contract.numero}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground pt-1">
            A operação fica com status &quot;Cancelada&quot;, deixa de receber pedidos, importações
            e despachos, e todos os vínculos de escolas serão liberados. O histórico de pedidos,
            atestos e despachos permanece preservado e continua acessível em Relatórios e Histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* PROTEÇÃO 2 — BLOQUEIO POR ATESTOS EMITIDOS */}
          {isBloqueadoPorAtestos && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="font-semibold text-xs">Cancelamento Bloqueado</AlertTitle>
              <AlertDescription className="text-xs mt-1.5 leading-relaxed">
                Existem <strong>{analise.totalAtestosBloqueantes} atesto(s) emitido(s)</strong> para
                esta operação em ciclo(s) em andamento. Já houve entrega formalizada; o caminho é
                aguardar o fechamento do ciclo para poder cancelar a operação.
              </AlertDescription>
            </Alert>
          )}

          {/* PROTEÇÃO 1 — AVISO DE PARTICIPAÇÃO EM CICLO NÃO-TERMINAL */}
          {!isBloqueadoPorAtestos && analise.ciclosNaoTerminais.length > 0 && (
            <div className="space-y-3">
              <Alert className="border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertOctagon className="h-4 w-4 text-amber-600" />
                <AlertTitle className="font-semibold text-xs">
                  Participação em Ciclo em Andamento
                </AlertTitle>
                <AlertDescription className="text-xs mt-1 leading-relaxed">
                  {analise.ciclosNaoTerminais.map((c, i) => (
                    <div key={i}>
                      A operação participa do <strong>{c.nome}</strong> em fase{' '}
                      <strong>{c.fase}</strong> — cancelar cancela a participação dela no ciclo.
                    </div>
                  ))}
                </AlertDescription>
              </Alert>

              <div className="flex items-start space-x-2.5 p-3 rounded-lg border bg-muted/40">
                <Checkbox
                  id="confirm-ciclo-cancelar"
                  checked={confirmCicloChecked}
                  onCheckedChange={(checked) => setConfirmCicloChecked(Boolean(checked))}
                  className="mt-0.5"
                />
                <label
                  htmlFor="confirm-ciclo-cancelar"
                  className="text-xs text-foreground cursor-pointer select-none leading-snug"
                >
                  Estou ciente de que a operação participa de ciclo(s) em fase não-terminal e
                  confirmo o cancelamento da participação dela no ciclo ao cancelá-la.
                </label>
              </div>
            </div>
          )}

          {/* CASO SEM BLOQUEIOS NEM AVISOS ESPECIAIS */}
          {!isBloqueadoPorAtestos && analise.ciclosNaoTerminais.length === 0 && (
            <div className="p-3 rounded-lg border bg-muted/30 text-muted-foreground text-xs leading-relaxed flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Nenhum ciclo ativo ou atesto pendente vinculado. O cancelamento pode ser realizado
                com segurança.
              </span>
            </div>
          )}

          {/* CAMPO OBRIGATÓRIO: MOTIVO DO CANCELAMENTO */}
          {!isBloqueadoPorAtestos && (
            <div className="space-y-1.5 pt-1">
              <Label
                htmlFor="motivo-cancelamento-contrato"
                className="text-xs font-semibold text-foreground"
              >
                Motivo do Cancelamento <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="motivo-cancelamento-contrato"
                placeholder="Descreva detalhadamente o motivo do cancelamento desta operação (obrigatório)..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                className="text-xs resize-none"
                disabled={isSubmitting}
              />
              {!isMotivoValido && (
                <p className="text-[11px] text-muted-foreground">
                  O motivo é obrigatório e será registrado de forma permanente no histórico da
                  operação.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
          >
            Cancelar
          </Button>
          {!isBloqueadoPorAtestos && (
            <Button
              type="button"
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium gap-1.5"
              disabled={!podeConfirmar || isSubmitting}
              onClick={handleConfirmCancelar}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Cancelando...
                </>
              ) : (
                'Cancelar Operação'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
