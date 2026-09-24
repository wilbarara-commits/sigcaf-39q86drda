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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, AlertOctagon, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react'
import { useApp } from '@/context/app-context'
import { contratosService } from '@/services/contratos'
import { isCicloNaoTerminal, formatFaseAmigavel } from '@/lib/cicloUtils'
import type { Contract } from '@/lib/types'
import { toast } from 'sonner'

interface EncerrarContratoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: Contract | null
  onSuccess?: () => void
}

export function EncerrarContratoDialog({
  open,
  onOpenChange,
  contract,
  onSuccess,
}: EncerrarContratoDialogProps) {
  const { ciclos, cicloContratos, contractSchools, orders, atestos, refreshData } = useApp()

  const [confirmCicloChecked, setConfirmCicloChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Resetar checkbox quando o diálogo abre/fecha ou contrato muda
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmCicloChecked(false)
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
  const podeConfirmar = !isBloqueadoPorAtestos && (!precisaConfirmacaoCiclo || confirmCicloChecked)

  const handleConfirmEncerrar = async () => {
    if (!podeConfirmar || isSubmitting) return

    setIsSubmitting(true)
    try {
      await contratosService.encerrarContrato(contract.id)
      toast.success(`Contrato ${contract.numero} encerrado com sucesso!`)
      handleOpenChange(false)
      await refreshData()
      onSuccess?.()
    } catch (err: any) {
      console.error('Erro ao encerrar contrato:', err)
      toast.error('Falha ao encerrar o contrato. Verifique sua conexão e tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Encerrar Contrato {contract.numero}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground pt-1">
            Ele deixa de receber pedidos, importações e despachos, e todos os vínculos de escolas
            serão liberados. O histórico de pedidos, atestos e despachos permanece preservado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* PROTEÇÃO 2 — BLOQUEIO POR ATESTOS EMITIDOS */}
          {isBloqueadoPorAtestos && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="font-semibold text-xs">Encerramento Bloqueado</AlertTitle>
              <AlertDescription className="text-xs mt-1.5 leading-relaxed">
                Existem <strong>{analise.totalAtestosBloqueantes} atesto(s) emitido(s)</strong> para
                este contrato em ciclo(s) em andamento. Já houve entrega formalizada; o caminho é
                aguardar o fechamento do ciclo para poder encerrar o contrato.
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
                      O contrato participa do <strong>{c.nome}</strong> em fase{' '}
                      <strong>{c.fase}</strong> — encerrar cancela a participação dele no ciclo.
                    </div>
                  ))}
                </AlertDescription>
              </Alert>

              <div className="flex items-start space-x-2.5 p-3 rounded-lg border bg-muted/40">
                <Checkbox
                  id="confirm-ciclo-encerrar"
                  checked={confirmCicloChecked}
                  onCheckedChange={(checked) => setConfirmCicloChecked(Boolean(checked))}
                  className="mt-0.5"
                />
                <label
                  htmlFor="confirm-ciclo-encerrar"
                  className="text-xs text-foreground cursor-pointer select-none leading-snug"
                >
                  Estou ciente de que o contrato participa de ciclo(s) em fase não-terminal e
                  confirmo o cancelamento da participação dele no ciclo ao encerrá-lo.
                </label>
              </div>
            </div>
          )}

          {/* CASO SEM BLOQUEIOS NEM AVISOS ESPECIAIS */}
          {!isBloqueadoPorAtestos && analise.ciclosNaoTerminais.length === 0 && (
            <div className="p-3 rounded-lg border bg-muted/30 text-muted-foreground text-xs leading-relaxed flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Nenhum ciclo ativo ou atesto pendente vinculado. O encerramento pode ser realizado
                com segurança.
              </span>
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
              onClick={handleConfirmEncerrar}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Encerrando...
                </>
              ) : (
                'Encerrar Contrato'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
