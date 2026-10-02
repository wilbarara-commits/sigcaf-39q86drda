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
  isCicloNumeroAnoDuplicado,
} from '@/lib/cicloUtils'
import { toast } from 'sonner'

interface AbrirCicloDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AbrirCicloDialog({ open, onOpenChange, onSuccess }: AbrirCicloDialogProps) {
  const { ciclos, cicloContratos, createCiclo } = useApp()

  const [numeroCiclo, setNumeroCiclo] = useState<string>('')
  const [anoCiclo, setAnoCiclo] = useState<string>('')
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

  // Ao abrir o modal, pré-preencher com base na sugestão do próximo ciclo
  useEffect(() => {
    if (open) {
      const info = sugerirProximoCiclo(ciclos, new Date())
      setNumeroCiclo(String(info.numeroSemana))
      setAnoCiclo(String(info.ano))
      setDataInicio(info.dataInicioIso.split('T')[0])
      setDataFim(info.dataFimIso.split('T')[0])
      setDataDespacho(info.dataDespachoIso.split('T')[0])
      setStep('form')
    }
  }, [open, ciclos])

  // Recalcular Fim (+6 dias = terça), Despacho (+5 dias = segunda) e ano coerente quando Início mudar
  const handleDataInicioChange = (novoInicioStr: string) => {
    setDataInicio(novoInicioStr)
    if (!novoInicioStr) return

    // Normalizar a data informada (YYYY-MM-DD)
    const match = novoInicioStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const ano = parseInt(match[1], 10)
      const mes = parseInt(match[2], 10) - 1
      const dia = parseInt(match[3], 10)

      // Atualizar ano coerente com a data de início da quarta-feira
      setAnoCiclo(String(ano))

      // Fim = início + 6 dias (sempre terça-feira)
      const tFim = new Date(Date.UTC(ano, mes, dia + 6, 0, 0, 0, 0))
      // Despacho = início + 5 dias (sempre segunda-feira)
      const tDesp = new Date(Date.UTC(ano, mes, dia + 5, 0, 0, 0, 0))

      setDataFim(tFim.toISOString().split('T')[0])
      setDataDespacho(tDesp.toISOString().split('T')[0])
    }
  }

  // Sanitizador do número do ciclo: apenas dígitos (remove não-dígitos)
  const handleNumeroCicloChange = (valor: string) => {
    const limpo = valor.replace(/\D/g, '')
    setNumeroCiclo(limpo)
  }

  // Nome computado a partir do número e do ano
  const nomeCicloFinal = useMemo(() => {
    const numTrim = numeroCiclo.trim()
    const anoTrim = anoCiclo.trim()
    if (!numTrim || !anoTrim) return ''
    const numFormatado = numTrim.length === 1 ? `0${numTrim}` : numTrim
    return `Ciclo ${numFormatado}/${anoTrim}`
  }, [numeroCiclo, anoCiclo])

  // Validação: número obrigatório e válido
  const erroNumero = useMemo(() => {
    const trimmed = numeroCiclo.trim()
    if (!trimmed) {
      return 'O número do ciclo é obrigatório.'
    }
    const n = parseInt(trimmed, 10)
    if (isNaN(n) || n <= 0) {
      return 'Informe um número de ciclo válido maior que zero.'
    }
    return null
  }, [numeroCiclo])

  // Validação: duplicidade de número + ano
  const isDuplicado = useMemo(() => {
    const numTrim = numeroCiclo.trim()
    const anoTrim = anoCiclo.trim()
    if (!numTrim || !anoTrim) return false
    return (
      isCicloNumeroAnoDuplicado(numTrim, anoTrim, ciclos) ||
      ciclos.some(
        (c) =>
          c.nome.trim().toLowerCase() === nomeCicloFinal.toLowerCase() ||
          c.nome.trim().toLowerCase() === `ciclo ${numTrim}/${anoTrim}`.toLowerCase(),
      )
    )
  }, [numeroCiclo, anoCiclo, ciclos, nomeCicloFinal])

  const isFormValido = !erroNumero && !isDuplicado && !!dataInicio && !!dataFim && !!dataDespacho

  const handleNextOrSubmit = async () => {
    if (erroNumero) {
      toast.error(erroNumero)
      return
    }

    if (!dataInicio || !dataFim || !dataDespacho) {
      toast.error('Preencha as datas do período operacional.')
      return
    }

    // TRAVA: se o número+ano já existir, bloquear salvar com mensagem clara
    if (isDuplicado) {
      toast.error(
        `Já existe um ciclo cadastrado com o número ${numeroCiclo}/${anoCiclo} (${nomeCicloFinal}). Escolha outra numeração.`,
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
    if (erroNumero || isDuplicado) {
      toast.error('Corrija os erros do formulário antes de prosseguir.')
      return
    }

    setIsSubmitting(true)
    try {
      const inicioIso = `${dataInicio}T00:00:00.000Z`
      const fimIso = `${dataFim}T23:59:59.999Z`
      const despachoIso = `${dataDespacho}T12:00:00.000Z`

      const created = await createCiclo({
        nome: nomeCicloFinal,
        data_inicio: inicioIso,
        data_fim: fimIso,
        status: 'coletando',
        snapshot: {
          regra_semanal: 'quarta_a_terca',
          numero_ciclo: parseInt(numeroCiclo.trim(), 10),
          ano_ciclo: parseInt(anoCiclo.trim(), 10),
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
              ? 'Defina o número e o período semanal do novo ciclo operacional.'
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

            {isDuplicado && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Ciclo duplicado</AlertTitle>
                <AlertDescription className="text-xs">
                  Já existe um ciclo cadastrado com a numeração {numeroCiclo}/{anoCiclo} (
                  {nomeCicloFinal}). Não é permitido criar ciclos com numeração repetida no mesmo
                  ano.
                </AlertDescription>
              </Alert>
            )}

            {/* Linha de Número do Ciclo e Ano (Número EDITÁVEL pelo usuário) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="ciclo-numero" className="text-xs font-semibold">
                  Número do Ciclo <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="ciclo-numero"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={numeroCiclo}
                    onChange={(e) => handleNumeroCicloChange(e.target.value)}
                    placeholder="Ex: 41"
                    className={
                      isDuplicado || (!numeroCiclo.trim() && numeroCiclo !== '')
                        ? 'border-destructive focus-visible:ring-destructive'
                        : ''
                    }
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Você pode escolher livremente o número do ciclo (apenas dígitos).
                </p>
                {erroNumero && (
                  <p className="text-[11px] text-destructive font-medium">{erroNumero}</p>
                )}
                {isDuplicado && (
                  <p className="text-[11px] text-destructive font-medium">
                    Número {numeroCiclo}/{anoCiclo} já em uso. Altere para avançar.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ciclo-ano" className="text-xs font-semibold">
                  Ano
                </Label>
                <Input
                  id="ciclo-ano"
                  type="text"
                  value={anoCiclo}
                  readOnly
                  disabled
                  className="bg-muted text-muted-foreground font-medium cursor-not-allowed"
                  title="O ano é derivado automaticamente da data de início da quarta-feira"
                />
                <p className="text-[10px] text-muted-foreground leading-tight">Regra semanal</p>
              </div>
            </div>

            {/* Preview do Nome Gerado */}
            <div className="bg-muted/40 border rounded-md px-3 py-2 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Nome gerado do ciclo:</span>
              <span className="font-semibold text-primary">{nomeCicloFinal || '—'}</span>
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
                  onChange={(e) => handleDataInicioChange(e.target.value)}
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
                  {formatFaseAmigavel(cicloNaoTerminalExistente?.status)}. Abrir o {nomeCicloFinal}{' '}
                  deixa o {cicloNaoTerminalExistente?.nome} como Fechamento Pendente (continua
                  visível no Histórico até ser fechado).
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
            disabled={isSubmitting || !isFormValido}
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
