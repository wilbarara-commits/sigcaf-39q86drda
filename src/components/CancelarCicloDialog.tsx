import { useState, useEffect } from 'react'
import { useApp } from '@/context/app-context'
import type { CicloRecord } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertOctagon, AlertTriangle, Ban, Loader2, ShieldAlert } from 'lucide-react'

interface CancelarCicloDialogProps {
  ciclo: CicloRecord | null
  contratoId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function CancelarCicloDialog({
  ciclo,
  contratoId,
  open,
  onOpenChange,
  onSuccess,
}: CancelarCicloDialogProps) {
  const {
    orders,
    atestos,
    contracts,
    contractSchools,
    cicloContratos,
    cancelarCiclo,
    cancelarCicloContrato,
  } = useApp()
  const [motivo, setMotivo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setMotivo('')
    }
  }, [open])

  if (!ciclo) return null

  const contratoAlvo = contratoId ? contracts.find((c) => c.id === contratoId) : null
  const currentCC = contratoId
    ? cicloContratos.find((cc) => cc.ciclo_id === ciclo.id && cc.contrato_id === contratoId)
    : null

  const isContratoScope = Boolean(contratoId && contratoAlvo)

  // Escolas do contrato alvo (se escopo de contrato)
  const contratoEscolaIds = isContratoScope
    ? new Set(
        contractSchools.filter((cs) => cs.contrato_id === contratoId).map((cs) => cs.escola_id),
      )
    : null

  // Identificar pedidos afetados
  const pedidosAfetados = orders.filter((o) => {
    if (o.cicloId !== ciclo.id) return false
    if (contratoEscolaIds) {
      return contratoEscolaIds.has(o.schoolId)
    }
    return true
  })
  const pedidosNaoCancelados = pedidosAfetados.filter((o) => o.status !== 'Cancelado')
  const pedidoIdsSet = new Set(pedidosAfetados.map((o) => o.id))

  // Proteção 1: COM atestos emitidos -> BLOQUEADO
  const atestosEmitidos = atestos.filter((a) => pedidoIdsSet.has(a.orderId))
  const isBloqueadoPorAtestos = atestosEmitidos.length > 0

  // Proteção 3: FECHADO não pode ser cancelado
  const isFechado = isContratoScope ? currentCC?.fase === 'fechado' : ciclo.status === 'fechado'

  // Proteção 2: COM pedidos -> pergunta se cancela pedidos junto
  const hasPedidos = pedidosNaoCancelados.length > 0

  const handleConfirmCancel = async (cancelarPedidosJunto: boolean) => {
    const trimmed = motivo.trim()
    if (!trimmed) return

    setIsSubmitting(true)
    try {
      let ok = false
      if (isContratoScope && contratoId) {
        ok = await cancelarCicloContrato(ciclo.id, contratoId, trimmed, cancelarPedidosJunto)
      } else {
        ok = await cancelarCiclo(ciclo.id, trimmed, cancelarPedidosJunto)
      }
      if (ok) {
        onOpenChange(false)
        onSuccess?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const tituloDialog = isContratoScope
    ? `Cancelar Contrato ${contratoAlvo?.numero} no Ciclo: ${ciclo.nome}`
    : `Cancelar Ciclo: ${ciclo.nome}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" /> {tituloDialog}
          </DialogTitle>
          <DialogDescription>
            {isContratoScope
              ? 'O cancelamento afetará apenas este contrato neste ciclo. Os outros contratos do ciclo seguem normalmente.'
              : 'O cancelamento congela o ciclo e impede novas coletas ou importações.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Bloqueio por Fechado */}
          {isFechado && (
            <Alert variant="destructive">
              <AlertOctagon className="h-4 w-4" />
              <AlertTitle className="font-semibold text-xs">Ação Não Permitida</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                {isContratoScope
                  ? 'Contrato já fechado neste ciclo não pode ser cancelado (o caminho é o ciclo seguinte).'
                  : 'Ciclo fechado não pode ser cancelado (o caminho é o ciclo seguinte).'}
              </AlertDescription>
            </Alert>
          )}

          {/* Bloqueio por Atestos Emitidos */}
          {!isFechado && isBloqueadoPorAtestos && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="font-semibold text-xs">Cancelamento Bloqueado</AlertTitle>
              <AlertDescription className="text-xs mt-1 leading-relaxed">
                {isContratoScope
                  ? 'Este contrato possui atestos emitidos neste ciclo — já houve entrega formalizada. O caminho é FECHAR, não cancelá-lo.'
                  : 'Este ciclo possui atestos emitidos — já houve entrega formalizada. O caminho é FECHAR o ciclo, não cancelá-lo.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Fluxo Permitido */}
          {!isFechado && !isBloqueadoPorAtestos && (
            <>
              {hasPedidos && (
                <Alert className="border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="font-semibold text-xs">Pedidos vinculados</AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    Existem {pedidosNaoCancelados.length} pedidos afetados em aberto. Cancelar
                    também os pedidos (com o mesmo motivo)?
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="motivo-cancelamento" className="text-xs font-semibold">
                  Motivo do Cancelamento <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="motivo-cancelamento"
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: semana parada — recesso escolar, importação errada..."
                  className="resize-none"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setMotivo('semana parada — recesso escolar')}
                    className="text-[10px] text-muted-foreground hover:text-foreground bg-muted px-2 py-0.5 rounded border transition-colors"
                  >
                    semana parada — recesso escolar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMotivo('importação errada')}
                    className="text-[10px] text-muted-foreground hover:text-foreground bg-muted px-2 py-0.5 rounded border transition-colors"
                  >
                    importação errada
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            {isFechado || isBloqueadoPorAtestos ? 'Fechar' : 'Abortar'}
          </Button>

          {!isFechado && !isBloqueadoPorAtestos && (
            <>
              {hasPedidos ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSubmitting || !motivo.trim()}
                  onClick={() => handleConfirmCancel(true)}
                  className="gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Cancelando...
                    </>
                  ) : isContratoScope ? (
                    'Cancelar Contrato e Pedidos'
                  ) : (
                    'Cancelar Ciclo e Pedidos'
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSubmitting || !motivo.trim()}
                  onClick={() => handleConfirmCancel(false)}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Cancelando...
                    </>
                  ) : (
                    'Confirmar Cancelamento'
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
