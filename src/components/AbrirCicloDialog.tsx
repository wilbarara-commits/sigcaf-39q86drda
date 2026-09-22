import { useState, useEffect } from 'react'
import { useApp } from '@/context/app-context'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, CalendarPlus, Loader2 } from 'lucide-react'
import { calcularProximoCicloParaAbertura, isCicloNaoTerminal } from '@/lib/cicloUtils'

interface AbrirCicloDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AbrirCicloDialog({ open, onOpenChange, onSuccess }: AbrirCicloDialogProps) {
  const { ciclos, createCiclo } = useApp()

  const [nome, setNome] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataDespacho, setDataDespacho] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Ciclo não-terminal existente mais recente (se houver)
  const cicloNaoTerminalExistente = ciclos.find((c) => isCicloNaoTerminal(c.status))

  const faseCapitalizada = (fase?: string) => {
    if (!fase) return 'Coletando'
    if (fase === 'coletando') return 'Coletando'
    if (fase === 'correcao') return 'Correção'
    if (fase === 'fechado') return 'Fechado'
    if (fase === 'cancelado') return 'Cancelado'
    return fase.charAt(0).toUpperCase() + fase.slice(1)
  }

  // Ao abrir o modal, pré-preencher com base na regra semanal
  useEffect(() => {
    if (open) {
      const info = calcularProximoCicloParaAbertura(new Date())
      setNome(info.nomeCicloPadrao)
      setDataInicio(info.quartaInicio.toISOString().split('T')[0])
      setDataFim(info.tercaFim.toISOString().split('T')[0])
      setDataDespacho(info.segundaDespacho.toISOString().split('T')[0])
      setStep('form')
    }
  }, [open])

  const handleNextOrSubmit = async () => {
    if (!nome.trim() || !dataInicio || !dataFim || !dataDespacho) {
      return
    }

    // TRAVA: se existir ciclo não-terminal, o modal abre em modo confirmação
    if (cicloNaoTerminalExistente && step === 'form') {
      setStep('confirm')
      return
    }

    await executeCreate()
  }

  const executeCreate = async () => {
    setIsSubmitting(true)
    try {
      const inicioIso = `${dataInicio}T00:00:00.000Z`
      const fimIso = `${dataFim}T23:59:59.999Z`
      const despachoIso = `${dataDespacho}T12:00:00.000Z`

      const created = await createCiclo({
        nome: nome.trim(),
        data_inicio: inicioIso,
        data_fim: fimIso,
        status: 'coletando',
        snapshot: {
          regra_semanal: 'quarta_a_terca',
          despacho_previsto_segunda: despachoIso,
        },
      })

      if (created) {
        onOpenChange(false)
        onSuccess?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" /> Abrir Ciclo
          </DialogTitle>
          <DialogDescription>
            {step === 'form'
              ? 'Defina o nome e o período semanal do novo ciclo operacional.'
              : 'Confirmação necessária devido a ciclo anterior ainda em andamento.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'form' ? (
          <div className="space-y-4 py-2">
            {cicloNaoTerminalExistente && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-xs font-semibold">
                  Atenção: ciclo anterior não-terminal
                </AlertTitle>
                <AlertDescription className="text-xs">
                  O {cicloNaoTerminalExistente.nome} ainda está na fase{' '}
                  <strong>{faseCapitalizada(cicloNaoTerminalExistente.status)}</strong>.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ciclo-nome" className="text-xs font-semibold">
                Nome do Ciclo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ciclo-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Ciclo 38/2026"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ciclo-inicio" className="text-xs font-semibold">
                  Início (Quarta-feira)
                </Label>
                <Input
                  id="ciclo-inicio"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ciclo-fim" className="text-xs font-semibold">
                  Fim (Terça-feira)
                </Label>
                <Input
                  id="ciclo-fim"
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ciclo-despacho" className="text-xs font-semibold">
                Despacho Previsto (Segunda-feira)
              </Label>
              <Input
                id="ciclo-despacho"
                type="date"
                value={dataDespacho}
                onChange={(e) => setDataDespacho(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Início do ciclo ocorre na quarta-feira, despacho em rota na segunda seguinte e
                fechamento na terça.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Alert className="border-amber-400 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <AlertTitle className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Aviso de Fechamento Pendente
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-900 dark:text-amber-200 mt-2 space-y-2 leading-relaxed">
                <p>
                  O {cicloNaoTerminalExistente?.nome} ainda está em{' '}
                  {faseCapitalizada(cicloNaoTerminalExistente?.status)}. Abrir o {nome} deixa o{' '}
                  {cicloNaoTerminalExistente?.nome} como Fechamento Pendente (continua visível no
                  Histórico até ser fechado).
                </p>
                <p className="font-semibold">Confirmar?</p>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'confirm' && (
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setStep('form')}
            >
              Voltar
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            disabled={isSubmitting || !nome.trim() || !dataInicio || !dataFim || !dataDespacho}
            onClick={handleNextOrSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...
              </>
            ) : step === 'confirm' ? (
              'Confirmar Abertura'
            ) : (
              'Abrir Ciclo'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
