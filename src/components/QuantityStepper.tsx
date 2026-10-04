import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronUp, ChevronDown, ChevronsUp, ChevronsDown } from 'lucide-react'
import {
  formatQuantityOneDecimal,
  normalizeDecimalTyping,
  validateQuantityStepHalf,
  formatQuantityOnBlur,
} from '@/lib/decimalUtils'

export interface QuantityStepperProps {
  id?: string
  value: string
  onChange: (nextVal: string) => void
  min?: number
  disabled?: boolean
  className?: string
  unit?: string
}

export function QuantityStepper({
  id = 'quantity-stepper',
  value,
  onChange,
  min = 0.5,
  disabled = false,
  className = '',
  unit,
}: QuantityStepperProps) {
  // Converte valor atual para número com base na validação
  const parseCurrent = (v: string): number => {
    const res = validateQuantityStepHalf(v)
    if (res.isValid && res.numericValue >= min) {
      return res.numericValue
    }
    const rawNum = parseFloat(v.replace(',', '.'))
    if (!isNaN(rawNum) && rawNum >= min) {
      return rawNum
    }
    return min
  }

  const currentNum = parseCurrent(value)

  const handleStep = (delta: number) => {
    if (disabled) return
    const next = Math.round((currentNum + delta) * 10) / 10
    const clamped = Math.max(min, next)
    onChange(formatQuantityOneDecimal(clamped))
  }

  // Verifica se a diminuição ficaria abaixo do mínimo permitido (0,5)
  const canDec10 = currentNum - 10 >= min
  const canDec1 = currentNum - 1 >= min
  const canDecHalf = currentNum - 0.5 >= min

  const validation = validateQuantityStepHalf(value)
  const hasError = value.trim() !== '' && (!validation.isValid || validation.numericValue < min)

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`space-y-2 ${className}`}>
        {/* Linha principal com display/input e atalhos rápidos */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              id={id}
              type="text"
              inputMode="decimal"
              className={`h-11 text-base font-mono font-bold text-center tracking-tight pr-10 ${
                hasError ? 'border-destructive ring-destructive/30' : ''
              }`}
              placeholder="1,0"
              value={value}
              onChange={(e) => {
                const normalized = normalizeDecimalTyping(e.target.value)
                onChange(normalized)
              }}
              onBlur={() => {
                const formatted = formatQuantityOnBlur(value)
                const val = validateQuantityStepHalf(formatted)
                if (val.isValid && val.numericValue >= min) {
                  onChange(formatted)
                } else if (val.isValid && val.numericValue < min) {
                  onChange(formatQuantityOneDecimal(min))
                } else if (formatted === '') {
                  onChange(formatQuantityOneDecimal(min))
                } else {
                  onChange(formatted)
                }
              }}
              disabled={disabled}
              required
            />
            {unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none select-none">
                {unit}
              </span>
            )}
          </div>
        </div>

        {/* Grade de botões de incremento e decremento claramente rotulados */}
        <div className="grid grid-cols-3 gap-2">
          {/* Coluna ±10 (Seta dupla) */}
          <div className="flex flex-col gap-1 p-1.5 rounded-md border bg-muted/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-center text-muted-foreground">
              Passo 10
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 px-1 text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 disabled:opacity-40"
                    onClick={() => handleStep(-10)}
                    disabled={disabled || !canDec10}
                    aria-label="Diminuir 10"
                  >
                    <ChevronsDown className="h-3.5 w-3.5 mr-0.5" />
                    <span>-10</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Diminuir 10 {unit ? `(${unit})` : ''} — trava em {formatQuantityOneDecimal(min)}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 px-1 text-xs font-semibold hover:bg-primary/10 hover:text-primary hover:border-primary/40 disabled:opacity-40"
                    onClick={() => handleStep(10)}
                    disabled={disabled}
                    aria-label="Adicionar 10"
                  >
                    <ChevronsUp className="h-3.5 w-3.5 mr-0.5" />
                    <span>+10</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Adicionar 10 {unit ? `(${unit})` : ''}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Coluna ±1 (Seta simples) */}
          <div className="flex flex-col gap-1 p-1.5 rounded-md border bg-muted/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-center text-muted-foreground">
              Passo 1
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 px-1 text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 disabled:opacity-40"
                    onClick={() => handleStep(-1)}
                    disabled={disabled || !canDec1}
                    aria-label="Diminuir 1"
                  >
                    <ChevronDown className="h-3.5 w-3.5 mr-0.5" />
                    <span>-1</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Diminuir 1 {unit ? `(${unit})` : ''} — trava em {formatQuantityOneDecimal(min)}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 px-1 text-xs font-semibold hover:bg-primary/10 hover:text-primary hover:border-primary/40 disabled:opacity-40"
                    onClick={() => handleStep(1)}
                    disabled={disabled}
                    aria-label="Adicionar 1"
                  >
                    <ChevronUp className="h-3.5 w-3.5 mr-0.5" />
                    <span>+1</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Adicionar 1 {unit ? `(${unit})` : ''}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Coluna ±0,5 (Meio) */}
          <div className="flex flex-col gap-1 p-1.5 rounded-md border bg-muted/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-center text-muted-foreground">
              Passo 1/2
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 px-1 text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 disabled:opacity-40"
                    onClick={() => handleStep(-0.5)}
                    disabled={disabled || !canDecHalf}
                    aria-label="Diminuir 0,5"
                  >
                    <ChevronDown className="h-3 w-3 mr-0.5 text-muted-foreground" />
                    <span>-0,5</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Diminuir 0,5 (meio) — trava em {formatQuantityOneDecimal(min)}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 px-1 text-xs font-semibold hover:bg-primary/10 hover:text-primary hover:border-primary/40 disabled:opacity-40"
                    onClick={() => handleStep(0.5)}
                    disabled={disabled}
                    aria-label="Adicionar 0,5"
                  >
                    <ChevronUp className="h-3 w-3 mr-0.5 text-muted-foreground" />
                    <span>+0,5</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Adicionar 0,5 (meio)
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Dica / Validação contextual */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
          <span>
            Mínimo: <strong className="text-foreground">{formatQuantityOneDecimal(min)}</strong>
          </span>
          {hasError ? (
            <span className="text-destructive font-medium">
              {validation.error || `Mínimo de ${formatQuantityOneDecimal(min)}`}
            </span>
          ) : (
            <span>Múltiplos de 0,5 aceitos</span>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
