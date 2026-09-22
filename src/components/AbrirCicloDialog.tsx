import { useState, useEffect, useMemo } from 'react'
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
import {
  sugerirProximoCiclo,
  isCicloNaoTerminal,
  derivarStatusCiclo,
  formatFaseAmigavel,
} from '@/lib/cicloUtils'
import { toast } from 'sonner'

interface AbrirCicloDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AbrirCicloDialog({ open, onOpenChange, onSuccess }: AbrirCicloDialogProps) {
  const { ciclos, cicloContratos, contracts, createCiclo } = useApp()

  const [nome, setNome] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataDespacho, setDataDespacho] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Ciclo não-terminal existente mais recente (se houver)
  const cicloNaoTerminalExistente = ciclos.find((c) => {
    const status = derivarStatusCiclo(c.id, cicloContratos, c.status)
    return isCicloNaoTerminal(status)
  })

  // Ao abrir o modal, pré-preencher com base no ciclo mais recente existente
  useEffect(() => {
    if (open) {
      const info = sugerirProximoCiclo(ciclos, new Date())
      setNome(info.nomeCicloPadrao)
      setDataInicio(info.quartaInicio.toISOString().split('T')[0])
      setDataFim(info.tercaFim.toISOString().split('T')[0])
      setDataDespacho(info.segundaDespacho.toISOString().split('T')[0])
      setStep('form')
    }
  }, [open, ciclos])

  // Verificação de nome duplicado
  const nomeDuplicado = useMemo(() => {
    const trimmed = nome.trim().toLowerCase()
    if (!trimmed) return false
    return ciclos.some((c) => c.nome.trim().toLowerCase() === trimmed)
  }, [nome, ciclos])

  const handleNextOrSubmit = async () => {
    const trimmedNome = nome.trim()
    if (!trimmedNome || !dataInicio || !dataFim || !dataDespacho) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }

    // TRAVA: se o nome já existir no banco, bloquear salvar com mensagem clara
    if (nomeDuplicado) {
      toast.error(
        `Já existe um ciclo cadastrado com o nome "${trimmedNome}". Escolha um nome exclusivo.`,
      )
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
    const trimmedNome = nome.trim()
    if (nomeDuplicado) {
      toast.error(
        `Já existe um ciclo cadastrado com o nome "${trimmedNome}". Escolha um nome exclusivo.`,
      )
      return
    }

    setIsSubmitting(true)
    try {
      const inicioIso = `${dataInicio}T00:00:00.000Z`
      const fimIso = `${dataFim}T23:59:59.999Z`
      const despachoIso = `${dataDespacho}T12:00:00.000Z`

      const created = await createCiclo({
        nome: trimmedNome,
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
                  <strong>{formatFaseAmigavel(cicloNaoTerminalExistente.status)}</strong>.
                </AlertDescription>
              </Alert>
            )}

            {nomeDuplicado && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Nome duplicado</AlertTitle>
                <AlertDescription className="text-xs">
                  Já existe um ciclo cadastrado com o nome "{nome.trim()}". Não é permitido criar
                  ciclos com nomes duplicados.
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
                placeholder="Ex: Ciclo 39/2026"
                className={nomeDuplicado ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {nomeDuplicado && (
                <p className="text-[11px] text-destructive font-medium">
                  Nome já em uso. Altere para avançar.
                </p>
              )}
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
                  {formatFaseAmigavel(cicloNaoTerminalExistente?.status)}. Abrir o {nome} deixa o{' '}
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
            disabled={
              isSubmitting ||
              !nome.trim() ||
              !dataInicio ||
              !dataFim ||
              !dataDespacho ||
              nomeDuplicado
            }
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
