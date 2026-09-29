import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Navigation,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Building2,
  Sparkles,
  MapPinOff,
} from 'lucide-react'
import type { ResultadoOtimizacaoRota, ParadaOtimizavel } from '@/lib/routeOptimization'

interface RouteOptimizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rotaNome: string
  paradasOriginais: ParadaOtimizavel[]
  resultado: ResultadoOtimizacaoRota | null
  onApply: (paradasReordenadas: Array<{ escola_id: string; ordem: number }>) => Promise<void>
  isApplying?: boolean
}

export function RouteOptimizationDialog({
  open,
  onOpenChange,
  rotaNome,
  paradasOriginais,
  resultado,
  onApply,
  isApplying = false,
}: RouteOptimizationDialogProps) {
  if (!resultado) return null

  const handleConfirmApply = async () => {
    const payload = resultado.paradasSugeridas.map((p) => ({
      escola_id: p.escolaId,
      ordem: p.ordemSugerida,
    }))
    await onApply(payload)
  }

  const distanciaAtualFormatada = resultado.distanciaAtualKm.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
  const distanciaSugeridaFormatada = resultado.distanciaSugeridaKm.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
  const economiaKmFormatada = resultado.economiaKm.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
  const mudancasCount = resultado.paradasSugeridas.filter((p) => p.posicaoMudou).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Navigation className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                Sugestão de Rota Otimizada
                <Badge variant="secondary" className="font-normal text-xs">
                  {rotaNome}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Cálculo geográfico por proximidade (vizinho mais próximo + 2-opt). A rota permanece
                iniciando na primeira parada atual como âncora.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Corpo rolável */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Card Resumo de Distâncias e Ganhos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-muted/30">
              <span className="text-[11px] text-muted-foreground block font-medium">
                Distância Atual Estimada
              </span>
              <p className="text-lg font-bold text-foreground mt-0.5">
                {distanciaAtualFormatada} <span className="text-xs font-normal">km</span>
              </p>
              <span className="text-[10px] text-muted-foreground">Somatório do percurso atual</span>
            </div>

            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
              <span className="text-[11px] text-primary block font-medium">
                Distância Sugerida Otimizada
              </span>
              <p className="text-lg font-bold text-primary mt-0.5">
                {distanciaSugeridaFormatada} <span className="text-xs font-normal">km</span>
              </p>
              <span className="text-[10px] text-muted-foreground">Com o novo sequenciamento</span>
            </div>

            <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <span className="text-[11px] text-emerald-800 dark:text-emerald-300 block font-medium flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5" /> Redução Estimada
              </span>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {resultado.economiaKm > 0 ? (
                  <>
                    -{economiaKmFormatada} <span className="text-xs font-normal">km</span>{' '}
                    <span className="text-xs font-semibold">
                      ({resultado.economiaPercentual.toFixed(1)}%)
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">
                    Sequência já otimizada
                  </span>
                )}
              </p>
              <span className="text-[10px] text-muted-foreground">
                {mudancasCount > 0
                  ? `${mudancasCount} escola(s) reposicionada(s)`
                  : 'Nenhuma mudança necessária'}
              </span>
            </div>
          </div>

          {/* Alertas contextuais */}
          {resultado.escolasSemCoordenadasCount > 0 && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-amber-950 dark:text-amber-200">
                  {resultado.escolasSemCoordenadasCount} escola(s) sem coordenadas não foram
                  reposicionadas
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Escolas sem latitude e longitude cadastradas foram mantidas em sua ordem relativa
                  atual ao final do percurso. Cadastre as coordenadas na tela de Escolas para
                  incluí-las no cálculo geográfico.
                </p>
              </div>
            </div>
          )}

          {!resultado.houveMudanca && (
            <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 flex items-center gap-2 text-xs text-blue-950 dark:text-blue-200">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>
                A sequência atual desta rota já é a mais eficiente encontrada pelo algoritmo.
              </span>
            </div>
          )}

          {/* Comparativo Lado a Lado: Atual vs Sugerida */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Sequência Atual vs. Sugerida
              </h4>
              <span className="text-[11px] text-muted-foreground">
                {resultado.paradasSugeridas.length} paradas na rota
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Coluna 1: Sequência Atual */}
              <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Sequência Atual
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {paradasOriginais.length} paradas
                  </Badge>
                </div>
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                  {paradasOriginais.map((p, idx) => {
                    const ordemAtual = idx + 1
                    return (
                      <div
                        key={p.escolaId}
                        className="flex items-center gap-2 p-2 rounded-md bg-card border text-xs"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-bold shrink-0">
                          {ordemAtual}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-foreground truncate">{p.nome}</span>
                            {p.contratoNumero && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 font-mono text-muted-foreground"
                                title={`Contrato ${p.contratoNumero}`}
                              >
                                {p.contratoNumero}
                              </Badge>
                            )}
                          </div>
                          {p.endereco && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {p.endereco}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Coluna 2: Sequência Sugerida */}
              <div className="border rounded-lg p-3 bg-primary/[0.02] border-primary/30 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-primary/20">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1">
                    <Navigation className="h-3 w-3" /> Sequência Sugerida
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                    Otimizada
                  </Badge>
                </div>
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                  {resultado.paradasSugeridas.map((p) => {
                    return (
                      <div
                        key={p.escolaId}
                        className={`flex items-center gap-2 p-2 rounded-md text-xs transition-colors border ${
                          p.posicaoMudou
                            ? 'bg-amber-500/10 border-amber-500/40 dark:bg-amber-950/30'
                            : 'bg-card border-border'
                        }`}
                      >
                        {/* Indicador de nova ordem */}
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                            p.posicaoMudou
                              ? 'bg-amber-600 text-white'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          {p.ordemSugerida}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-foreground truncate">{p.nome}</span>

                            {/* Badge do contrato de origem preservado */}
                            {p.contratoNumero && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 font-mono border-primary/30 text-primary"
                                title={`Contrato de origem: ${p.contratoNumero}`}
                              >
                                {p.contratoNumero}
                              </Badge>
                            )}

                            {/* Badge de mudança de posição */}
                            {p.posicaoMudou && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 flex items-center gap-0.5"
                              >
                                <span>#{p.ordemOriginal}</span>
                                <ArrowRight className="h-2.5 w-2.5" />
                                <span>#{p.ordemSugerida}</span>
                              </Badge>
                            )}

                            {/* Badge de escola sem coordenada */}
                            {p.semCoordenada && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 text-muted-foreground border-dashed flex items-center gap-0.5"
                                title="Sem coordenadas cadastradas — mantida ao final"
                              >
                                <MapPinOff className="h-2.5 w-2.5" /> Sem coord.
                              </Badge>
                            )}
                          </div>

                          {p.endereco && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {p.endereco}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer com botões explícitos */}
        <DialogFooter className="p-4 sm:p-6 pt-3 border-t bg-muted/10 gap-2 sm:gap-2 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground text-left">
            Nenhuma alteração é gravada até você clicar em <strong>"Aplicar sugestão"</strong>.
          </p>
          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isApplying}
              onClick={() => onOpenChange(false)}
            >
              Manter como está
            </Button>
            <Button
              type="button"
              disabled={isApplying || !resultado.houveMudanca}
              onClick={handleConfirmApply}
              className="gap-1.5"
            >
              {isApplying ? (
                <>Salvando nova ordem...</>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Aplicar sugestão
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
