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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, CalendarPlus, Loader2, Layers, Info } from 'lucide-react'
import {
  sugerirProximoCiclo,
  isCicloNaoTerminal,
  derivarStatusCiclo,
  formatFaseAmigavel,
  isCicloNumeroAnoDuplicado,
  calcularDatasCicloPorSemana,
  validarAjusteManualDatasCiclo,
  normalizarDiaSemanaNum,
} from '@/lib/cicloUtils'
import { DIAS_SEMANA_LABELS, type DiaSemana } from '@/lib/types'
import { toast } from 'sonner'

interface AbrirCicloDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chamadaIdInicial?: string
  onSuccess?: () => void
}

export function AbrirCicloDialog({
  open,
  onOpenChange,
  chamadaIdInicial,
  onSuccess,
}: AbrirCicloDialogProps) {
  const { ciclos, chamadas, contracts, createCiclo } = useApp()

  const chamadasAtivas = useMemo(() => {
    return chamadas.filter((ch) => ch.status === 'Ativo')
  }, [chamadas])

  const [selectedChamadaId, setSelectedChamadaId] = useState<string>('')
  const [numeroCiclo, setNumeroCiclo] = useState<string>('')
  const [anoCiclo, setAnoCiclo] = useState<string>('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataDespacho, setDataDespacho] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Armazena as referências originais calculadas para a semana atual selecionada (para ancoragem do ajuste manual)
  const [semanaCalculadaRef, setSemanaCalculadaRef] = useState<{
    inicioRef: string
    fimRef: string
  } | null>(null)

  // Chamada atualmente selecionada
  const selectedChamada = useMemo(() => {
    return chamadas.find((ch) => ch.id === selectedChamadaId) || null
  }, [chamadas, selectedChamadaId])

  // Regra de dias da chamada selecionada
  const regraDiasChamada = useMemo(() => {
    return {
      diaInicio: (selectedChamada?.dia_inicio_ciclo as DiaSemana) || 'quarta',
      diaDespacho: (selectedChamada?.dia_despacho_ciclo as DiaSemana) || 'segunda',
      diaFim: (selectedChamada?.dia_fim_ciclo as DiaSemana) || 'terca',
    }
  }, [selectedChamada])

  // Contratos da chamada selecionada
  const contratosDaChamada = useMemo(() => {
    if (!selectedChamadaId) return []
    return contracts.filter((c) => c.chamada_id === selectedChamadaId && c.status === 'Ativo')
  }, [contracts, selectedChamadaId])

  // Ciclo não-terminal existente mais recente DA MESMA CHAMADA (regra de 1 ciclo ativo por chamada)
  const cicloNaoTerminalExistenteNaChamada = useMemo(() => {
    if (!selectedChamadaId) return null
    return ciclos.find((c) => {
      if (c.chamada_id !== selectedChamadaId) return false
      const status = derivarStatusCiclo(c.status)
      return isCicloNaoTerminal(status)
    })
  }, [ciclos, selectedChamadaId])

  // Inicialização ao abrir o modal
  useEffect(() => {
    if (open) {
      // 1. Determinar chamada inicial
      const targetChId =
        chamadaIdInicial ||
        (chamadasAtivas.length > 0 ? chamadasAtivas[0].id : chamadas[0]?.id || '')

      setSelectedChamadaId(targetChId)

      const targetCh = chamadas.find((c) => c.id === targetChId)
      const regra = {
        diaInicio: targetCh?.dia_inicio_ciclo || 'quarta',
        diaDespacho: targetCh?.dia_despacho_ciclo || 'segunda',
        diaFim: targetCh?.dia_fim_ciclo || 'terca',
      }

      // 2. Sugerir próximo ciclo com base nos ciclos existentes DESTA chamada
      const info = sugerirProximoCiclo(ciclos, new Date(), targetChId, regra)
      const semNum = info.numeroSemana
      const anoNum = info.ano

      setNumeroCiclo(String(semNum))
      setAnoCiclo(String(anoNum))

      const calc = calcularDatasCicloPorSemana(semNum, anoNum, regra)
      const dIni = calc.dataInicioIso.split('T')[0]
      const dFim = calc.dataFimIso.split('T')[0]
      const dDesp = calc.dataDespachoIso.split('T')[0]

      setDataInicio(dIni)
      setDataFim(dFim)
      setDataDespacho(dDesp)
      setSemanaCalculadaRef({ inicioRef: dIni, fimRef: dFim })
      setStep('form')
    }
  }, [open, chamadaIdInicial, chamadas, chamadasAtivas, ciclos])

  // Recalcular datas IMEDIATAMENTE quando o número da semana ou a chamada mudar
  const handleRecalcularDatas = (novoNumSemanaStr: string, chId: string, anoForcado?: number) => {
    const numInt = parseInt(novoNumSemanaStr.trim(), 10)
    const anoInt = anoForcado ?? parseInt(anoCiclo.trim() || String(new Date().getFullYear()), 10)
    const ch = chamadas.find((c) => c.id === chId)
    const regra = {
      diaInicio: ch?.dia_inicio_ciclo || 'quarta',
      diaDespacho: ch?.dia_despacho_ciclo || 'segunda',
      diaFim: ch?.dia_fim_ciclo || 'terca',
    }

    if (!isNaN(numInt) && numInt > 0 && numInt <= 53) {
      const calc = calcularDatasCicloPorSemana(numInt, anoInt, regra)
      const dIni = calc.dataInicioIso.split('T')[0]
      const dFim = calc.dataFimIso.split('T')[0]
      const dDesp = calc.dataDespachoIso.split('T')[0]
      setDataInicio(dIni)
      setDataFim(dFim)
      setDataDespacho(dDesp)
      setSemanaCalculadaRef({ inicioRef: dIni, fimRef: dFim })
    }
  }

  // Mudança de chamada: atualiza sugestão de semana/ano de acordo com a chamada selecionada
  const handleChamadaChange = (newChId: string) => {
    setSelectedChamadaId(newChId)
    const targetCh = chamadas.find((c) => c.id === newChId)
    const regra = {
      diaInicio: targetCh?.dia_inicio_ciclo || 'quarta',
      diaDespacho: targetCh?.dia_despacho_ciclo || 'segunda',
      diaFim: targetCh?.dia_fim_ciclo || 'terca',
    }
    const info = sugerirProximoCiclo(ciclos, new Date(), newChId, regra)
    setNumeroCiclo(String(info.numeroSemana))
    setAnoCiclo(String(info.ano))

    const calc = calcularDatasCicloPorSemana(info.numeroSemana, info.ano, regra)
    const dIni = calc.dataInicioIso.split('T')[0]
    const dFim = calc.dataFimIso.split('T')[0]
    const dDesp = calc.dataDespachoIso.split('T')[0]
    setDataInicio(dIni)
    setDataFim(dFim)
    setDataDespacho(dDesp)
    setSemanaCalculadaRef({ inicioRef: dIni, fimRef: dFim })
  }

  // Sanitizador do número do ciclo: apenas dígitos
  const handleNumeroCicloChange = (valor: string) => {
    const limpo = valor.replace(/\D/g, '')
    setNumeroCiclo(limpo)
    if (limpo && selectedChamadaId) {
      handleRecalcularDatas(limpo, selectedChamadaId)
    }
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
      return 'O número do ciclo (semana do ano) é obrigatório.'
    }
    const n = parseInt(trimmed, 10)
    if (isNaN(n) || n <= 0 || n > 53) {
      return 'Informe uma semana válida do ano (entre 1 e 53).'
    }
    return null
  }, [numeroCiclo])

  // Validação: duplicidade de número + ano DENTRO DA MESMA CHAMADA
  const isDuplicado = useMemo(() => {
    const numTrim = numeroCiclo.trim()
    const anoTrim = anoCiclo.trim()
    if (!numTrim || !anoTrim || !selectedChamadaId) return false
    return isCicloNumeroAnoDuplicado(numTrim, anoTrim, ciclos, undefined, selectedChamadaId)
  }, [numeroCiclo, anoCiclo, ciclos, selectedChamadaId])

  // Validação das datas (ordem e âncora da semana)
  const validacaoDatas = useMemo(() => {
    if (!dataInicio || !dataDespacho || !dataFim) {
      return { valido: false, erro: 'Preencha todas as datas do período.' }
    }
    return validarAjusteManualDatasCiclo(
      dataInicio,
      dataDespacho,
      dataFim,
      semanaCalculadaRef || undefined,
    )
  }, [dataInicio, dataDespacho, dataFim, semanaCalculadaRef])

  const isFormValido =
    !erroNumero &&
    !isDuplicado &&
    validacaoDatas.valido &&
    !!selectedChamadaId &&
    !!dataInicio &&
    !!dataFim &&
    !!dataDespacho

  const handleNextOrSubmit = async () => {
    if (!selectedChamadaId) {
      toast.error('Selecione a chamada a que o ciclo pertence.')
      return
    }

    if (erroNumero) {
      toast.error(erroNumero)
      return
    }

    if (!validacaoDatas.valido) {
      toast.error(validacaoDatas.erro || 'Datas inválidas.')
      return
    }

    // TRAVA: número+ano duplicado NA MESMA CHAMADA
    if (isDuplicado) {
      toast.error(
        `Já existe um ciclo com a semana ${numeroCiclo}/${anoCiclo} nesta chamada (${selectedChamada?.chamada}). Escolha outra semana.`,
      )
      return
    }

    // TRAVA: se existir ciclo anterior não-terminal NA MESMA CHAMADA, abrir modo confirmação
    if (cicloNaoTerminalExistenteNaChamada && step === 'form') {
      setStep('confirm')
      return
    }

    await executeCreate()
  }

  const executeCreate = async () => {
    if (erroNumero || isDuplicado || !validacaoDatas.valido || !selectedChamadaId) {
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
        chamada_id: selectedChamadaId,
        data_inicio: inicioIso,
        data_fim: fimIso,
        data_despacho: despachoIso,
        status: 'coletando',
        snapshot: {
          regra_semanal: `${regraDiasChamada.diaInicio}_a_${regraDiasChamada.diaFim}`,
          numero_ciclo: parseInt(numeroCiclo.trim(), 10),
          ano_ciclo: parseInt(anoCiclo.trim(), 10),
          despacho_previsto_segunda: despachoIso,
          chamada_id: selectedChamadaId,
          chamada_numero: selectedChamada?.chamada,
          regra_dias: regraDiasChamada,
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
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" /> Abrir Ciclo Operacional
          </DialogTitle>
          <DialogDescription>
            {step === 'form'
              ? 'Selecione a chamada e a semana do ano. As datas são calculadas automaticamente conforme a regra da chamada.'
              : 'Confirmação necessária devido a ciclo anterior da mesma chamada ainda em andamento.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'form' ? (
          <div className="space-y-4 py-2">
            {/* 1. SELEÇÃO DA CHAMADA */}
            <div className="space-y-1.5">
              <Label
                htmlFor="ciclo-chamada"
                className="text-xs font-semibold flex items-center gap-1.5"
              >
                <Layers className="h-3.5 w-3.5 text-primary" /> Chamada Pública{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedChamadaId} onValueChange={handleChamadaChange}>
                <SelectTrigger id="ciclo-chamada" className="h-9 font-medium">
                  <SelectValue placeholder="Selecione a chamada" />
                </SelectTrigger>
                <SelectContent>
                  {chamadas.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.chamada} — {ch.programa || 'PNAE'}{' '}
                      {ch.dependencia_administrativa ? `(${ch.dependencia_administrativa})` : ''}
                      {ch.status !== 'Ativo' ? ` [${ch.status}]` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedChamada && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-muted/40 px-2.5 py-1 rounded border">
                  <span>
                    Regra da chamada: Início{' '}
                    <strong>
                      {DIAS_SEMANA_LABELS[regraDiasChamada.diaInicio as DiaSemana] ||
                        regraDiasChamada.diaInicio}
                    </strong>{' '}
                    → Despacho/Entrega{' '}
                    <strong>
                      {DIAS_SEMANA_LABELS[regraDiasChamada.diaDespacho as DiaSemana] ||
                        regraDiasChamada.diaDespacho}
                    </strong>{' '}
                    → Fim{' '}
                    <strong>
                      {DIAS_SEMANA_LABELS[regraDiasChamada.diaFim as DiaSemana] ||
                        regraDiasChamada.diaFim}
                    </strong>
                  </span>
                  <span>{contratosDaChamada.length} contrato(s) ativo(s)</span>
                </div>
              )}
            </div>

            {/* Alerta de ciclo não-terminal DA MESMA CHAMADA */}
            {cicloNaoTerminalExistenteNaChamada && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-xs font-semibold">
                  Atenção: ciclo anterior não-terminal na mesma chamada
                </AlertTitle>
                <AlertDescription className="text-xs">
                  O <strong>{cicloNaoTerminalExistenteNaChamada.nome}</strong> da chamada{' '}
                  {selectedChamada?.chamada} ainda está na fase{' '}
                  <strong>{formatFaseAmigavel(cicloNaoTerminalExistenteNaChamada.status)}</strong>.
                </AlertDescription>
              </Alert>
            )}

            {isDuplicado && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">
                  Ciclo duplicado na chamada
                </AlertTitle>
                <AlertDescription className="text-xs">
                  Já existe um ciclo cadastrado na chamada {selectedChamada?.chamada} com o número{' '}
                  {numeroCiclo}/{anoCiclo} ({nomeCicloFinal}). Não é permitido repetir a semana na
                  mesma chamada.
                </AlertDescription>
              </Alert>
            )}

            {/* Linha de Número do Ciclo (= Semana do Ano) e Ano */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="ciclo-numero" className="text-xs font-semibold">
                  Número do Ciclo = Semana do Ano (ISO) <span className="text-destructive">*</span>
                </Label>
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
                      ? 'border-destructive focus-visible:ring-destructive font-mono text-base font-bold'
                      : 'font-mono text-base font-bold'
                  }
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  Semana do ano (1 a 53). Ao alterar, as datas são recalculadas imediatamente.
                </p>
                {erroNumero && (
                  <p className="text-[11px] text-destructive font-medium">{erroNumero}</p>
                )}
                {isDuplicado && (
                  <p className="text-[11px] text-destructive font-medium">
                    Semana {numeroCiclo}/{anoCiclo} já em uso nesta chamada.
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
                  className="bg-muted text-muted-foreground font-mono text-base font-medium cursor-not-allowed"
                  title="O ano é derivado da semana operacional do ciclo"
                />
                <p className="text-[10px] text-muted-foreground leading-tight">Ano civil</p>
              </div>
            </div>

            {/* Preview do Nome Gerado */}
            <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Nome gerado do ciclo:</span>
              <span className="font-bold text-sm text-primary">{nomeCicloFinal || '—'}</span>
            </div>

            {/* DATAS CALCULADAS (COM AJUSTE MANUAL PERMITIDO E LIMITADO) */}
            <div className="border rounded-lg p-3 bg-card space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary" /> Datas do Período Operacional
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Ajuste manual restrito à semana
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <Label
                    htmlFor="ciclo-inicio"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    1º dia (Início)
                  </Label>
                  <Input
                    id="ciclo-inicio"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Padrão:{' '}
                    {DIAS_SEMANA_LABELS[regraDiasChamada.diaInicio as DiaSemana] ||
                      regraDiasChamada.diaInicio}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="ciclo-despacho"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Despacho / Entrega
                  </Label>
                  <Input
                    id="ciclo-despacho"
                    type="date"
                    value={dataDespacho}
                    onChange={(e) => setDataDespacho(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Padrão:{' '}
                    {DIAS_SEMANA_LABELS[regraDiasChamada.diaDespacho as DiaSemana] ||
                      regraDiasChamada.diaDespacho}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="ciclo-fim"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Último dia (Fim)
                  </Label>
                  <Input
                    id="ciclo-fim"
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Padrão:{' '}
                    {DIAS_SEMANA_LABELS[regraDiasChamada.diaFim as DiaSemana] ||
                      regraDiasChamada.diaFim}
                  </p>
                </div>
              </div>

              {!validacaoDatas.valido && (
                <p className="text-[11px] text-destructive font-medium">{validacaoDatas.erro}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Alert className="border-amber-400 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <AlertTitle className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Aviso de Fechamento Pendente da Chamada
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-900 dark:text-amber-200 mt-2 space-y-2 leading-relaxed">
                <p>
                  O <strong>{cicloNaoTerminalExistenteNaChamada?.nome}</strong> da chamada{' '}
                  <strong>{selectedChamada?.chamada}</strong> ainda está na fase{' '}
                  <strong>{formatFaseAmigavel(cicloNaoTerminalExistenteNaChamada?.status)}</strong>.
                </p>
                <p>
                  Abrir o <strong>{nomeCicloFinal}</strong> deixa o ciclo anterior como Fechamento
                  Pendente desta chamada (continua visível no Histórico até ser fechado). Cada
                  chamada tem no máximo 1 ciclo ativo por vez.
                </p>
                <p className="font-semibold">Deseja confirmar a abertura?</p>
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
