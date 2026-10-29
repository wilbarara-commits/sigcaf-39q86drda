import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sparkles,
  Route,
  MapPin,
  Clock,
  Weight,
  AlertTriangle,
  MoveRight,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ParametrosRoteamentoAssistido,
  EscolaRoteamentoInput,
  ResultadoRoteamentoAssistido,
  RotaSugerida,
  gerarSugestaoRotasAssistida,
  recalcularMetricasRota,
} from '@/lib/assistedRouting'
import { CoordenadaGeo } from '@/lib/routeOptimization'

export interface AssistedRoutingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cicloNome: string
  cicloDataDespacho?: string
  origemGeo: CoordenadaGeo
  origemNome: string
  escolasComDemanda: EscolaRoteamentoInput[]
  isCicloBloqueado: boolean
  onConfirmarCriacaoRotas: (rotasSugeridas: RotaSugerida[]) => Promise<boolean>
}

export function AssistedRoutingDialog({
  open,
  onOpenChange,
  cicloNome,
  cicloDataDespacho,
  origemGeo,
  origemNome,
  escolasComDemanda,
  isCicloBloqueado,
  onConfirmarCriacaoRotas,
}: AssistedRoutingDialogProps) {
  // Etapa do fluxo: 'parametros' | 'previa'
  const [step, setStep] = useState<'parametros' | 'previa'>('parametros')

  // Parâmetros editáveis
  const [numRotas, setNumRotas] = useState<number>(2)
  const [tempoParadaMin, setTempoParadaMin] = useState<number>(10)
  const [pesoAlvoKg, setPesoAlvoKg] = useState<string>('')

  // Estado da prévia calculada
  const [rotasState, setRotasState] = useState<RotaSugerida[]>([])
  const [semCoordenadasList, setSemCoordenadasList] = useState<
    ResultadoRoteamentoAssistido['escolasSemCoordenadas']
  >([])
  const [isConfirming, setIsConfirming] = useState<boolean>(false)

  // Controle de movimentação manual de escola entre rotas sugeridas
  const [selectedEscolaIdToMove, setSelectedEscolaIdToMove] = useState<string>('')
  const [sourceRotaIdToMove, setSourceRotaIdToMove] = useState<string>('')
  const [targetRotaIdToMove, setTargetRotaIdToMove] = useState<string>('')

  // Resetar ao abrir
  useEffect(() => {
    if (open) {
      setStep('parametros')
      setNumRotas(2)
      setTempoParadaMin(10)
      setPesoAlvoKg('')
      setRotasState([])
      setSemCoordenadasList([])
      setSelectedEscolaIdToMove('')
      setSourceRotaIdToMove('')
      setTargetRotaIdToMove('')
    }
  }, [open])

  // Métricas gerais calculadas
  const totalEscolas = escolasComDemanda.length
  const escolasComCoordsCount = escolasComDemanda.filter((e) => e.temCoordenadas && e.coords).length
  const escolasSemCoordsCount = totalEscolas - escolasComCoordsCount
  const pesoTotalGeral = useMemo(() => {
    const sum = escolasComDemanda.reduce((acc, e) => acc + e.pesoKg, 0)
    return Math.round(sum * 10) / 10
  }, [escolasComDemanda])

  // Ação: Calcular sugestão e abrir prévia
  const handleCalcularSugestao = () => {
    if (escolasComDemanda.length === 0) {
      toast.error('Nenhuma escola com pedido na data de despacho do ciclo corrente.')
      return
    }

    const nRotas = Math.max(1, Math.min(numRotas || 2, 10))
    const tParada = Math.max(1, tempoParadaMin || 10)
    const pAlvo = pesoAlvoKg.trim() ? Number(pesoAlvoKg.replace(',', '.')) : undefined

    const params: ParametrosRoteamentoAssistido = {
      numRotas: nRotas,
      tempoParadaMin: tParada,
      pesoAlvoKg: pAlvo && pAlvo > 0 ? pAlvo : undefined,
    }

    const resultado = gerarSugestaoRotasAssistida({
      escolasInput: escolasComDemanda,
      origem: origemGeo,
      parametros: params,
    })

    setRotasState(resultado.rotas)
    setSemCoordenadasList(resultado.escolasSemCoordenadas)
    setStep('previa')
  }

  // Ação: Mover escola entre rotas e recalcular totais de ambas
  const handleMoverEscola = () => {
    if (!selectedEscolaIdToMove || !sourceRotaIdToMove || !targetRotaIdToMove) {
      toast.error('Selecione a escola e a rota de destino.')
      return
    }
    if (sourceRotaIdToMove === targetRotaIdToMove) {
      toast.error('A rota de destino deve ser diferente da rota atual.')
      return
    }

    const sourceRota = rotasState.find((r) => r.id === sourceRotaIdToMove)
    const targetRota = rotasState.find((r) => r.id === targetRotaIdToMove)
    if (!sourceRota || !targetRota) return

    const escolaIndex = sourceRota.escolas.findIndex((e) => e.escolaId === selectedEscolaIdToMove)
    if (escolaIndex === -1) return

    const [escolaMovida] = [...sourceRota.escolas].splice(escolaIndex, 1)
    const novasEscolasOrigem = sourceRota.escolas.filter(
      (e) => e.escolaId !== selectedEscolaIdToMove,
    )
    const novasEscolasDestino = [...targetRota.escolas, escolaMovida]

    // Recalcular métricas de ambas as rotas
    const metricasOrigem = recalcularMetricasRota(origemGeo, novasEscolasOrigem, tempoParadaMin)
    const metricasDestino = recalcularMetricasRota(origemGeo, novasEscolasDestino, tempoParadaMin)

    setRotasState((prev) =>
      prev.map((r) => {
        if (r.id === sourceRotaIdToMove) {
          return {
            ...r,
            escolas: metricasOrigem.escolasOrdenadas,
            pesoTotalKg: metricasOrigem.pesoTotalKg,
            distanciaKm: metricasOrigem.distanciaKm,
            duracaoMin: metricasOrigem.duracaoMin,
            paradasCount: metricasOrigem.paradasCount,
          }
        }
        if (r.id === targetRotaIdToMove) {
          return {
            ...r,
            escolas: metricasDestino.escolasOrdenadas,
            pesoTotalKg: metricasDestino.pesoTotalKg,
            distanciaKm: metricasDestino.distanciaKm,
            duracaoMin: metricasDestino.duracaoMin,
            paradasCount: metricasDestino.paradasCount,
          }
        }
        return r
      }),
    )

    toast.success(
      `"${escolaMovida.escolaNome}" movida para ${targetRota.nome} com recálculo automático!`,
    )
    setSelectedEscolaIdToMove('')
    setSourceRotaIdToMove('')
    setTargetRotaIdToMove('')
  }

  // Ação: Confirmar criação das rotas
  const handleConfirmar = async () => {
    if (isCicloBloqueado) {
      toast.error('Ciclo fechado ou cancelado. Alteração de rotas bloqueada.')
      return
    }

    setIsConfirming(true)
    try {
      const ok = await onConfirmarCriacaoRotas(rotasState)
      if (ok) {
        onOpenChange(false)
      }
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="p-5 border-b bg-muted/20 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Sugerir Rotas (Roteamento Assistido)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Divisão automática das entregas do despacho do ciclo em rotas balanceadas por
                distância, peso e duração.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono gap-1">
                <Calendar className="h-3 w-3 text-primary" />
                {cicloNome}
                {cicloDataDespacho && (
                  <span className="text-muted-foreground font-normal">
                    · Despacho: {new Date(cicloDataDespacho).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === 'parametros' ? (
            /* ETAPA 1: Parâmetros do Roteamento */
            <div className="space-y-6">
              {/* Resumo da Demanda Coletada */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg border bg-muted/30 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Escolas com Pedido:
                  </span>
                  <p className="font-bold text-base text-foreground">{totalEscolas} escola(s)</p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Com Coordenadas GPS:
                  </span>
                  <p className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                    {escolasComCoordsCount} escola(s)
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Sem Coordenadas GPS:
                  </span>
                  <p className="font-bold text-base text-amber-600 dark:text-amber-400">
                    {escolasSemCoordsCount} escola(s)
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Peso Total Estimado:
                  </span>
                  <p className="font-bold text-base text-primary">{pesoTotalGeral} kg</p>
                </div>
              </div>

              {escolasSemCoordsCount > 0 && (
                <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-950 dark:text-amber-200">
                      {escolasSemCoordsCount} escola(s) sem coordenadas geográficas
                    </p>
                    <p className="text-amber-800 dark:text-amber-300 text-[11px] mt-0.5">
                      Ficarão fora do cálculo de clusters e aparecerão na prévia na seção &quot;Sem
                      coordenadas — incluir manualmente&quot;.
                    </p>
                  </div>
                </div>
              )}

              {/* Formulário de Parâmetros */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Route className="h-4 w-4 text-primary" /> Parâmetros de Divisão
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="numRotas" className="text-xs font-semibold">
                        Nº de Rotas Sugeridas
                      </Label>
                      <Input
                        id="numRotas"
                        type="number"
                        min={1}
                        max={10}
                        value={numRotas}
                        onChange={(e) => setNumRotas(Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 text-xs font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Padrão: 2 rotas. Define a quantidade de divisões.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="tempoParada" className="text-xs font-semibold">
                        Tempo Médio por Parada (min)
                      </Label>
                      <Input
                        id="tempoParada"
                        type="number"
                        min={1}
                        max={60}
                        value={tempoParadaMin}
                        onChange={(e) =>
                          setTempoParadaMin(Math.max(1, Number(e.target.value) || 10))
                        }
                        className="h-8 text-xs font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Padrão: 10 min por entrega na escola.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="pesoAlvo" className="text-xs font-semibold">
                        Peso Alvo por Rota (kg){' '}
                        <span className="text-muted-foreground font-normal">(opcional)</span>
                      </Label>
                      <Input
                        id="pesoAlvo"
                        type="text"
                        placeholder="Ex: 500"
                        value={pesoAlvoKg}
                        onChange={(e) => setPesoAlvoKg(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Capacidade máxima aproximada do veículo.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-md bg-muted/40 border text-[11px] space-y-1 text-muted-foreground">
                    <p className="font-semibold text-foreground">Regras do cálculo:</p>
                    <p>
                      • Origem: {origemNome} ({origemGeo.latitude.toFixed(5)},{' '}
                      {origemGeo.longitude.toFixed(5)}).
                    </p>
                    <p>• Distância viária estimada: Haversine × 1,3 (fator de malha viária).</p>
                    <p>• Duração estimada: paradas × tempo médio + distância ÷ 40 km/h.</p>
                    <p>
                      • Sequenciamento interno: Heurística do Vizinho Mais Próximo com refinamento
                      2-opt.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* ETAPA 2: Prévia Interativa das Rotas Sugeridas */
            <div className="space-y-5">
              {/* Barra de Ações Rápidas da Prévia */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> Prévia editável gerada
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Revise a sequência e métricas. Nenhuma rota foi criada ainda — confirme no
                    rodapé para salvar.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('parametros')}
                  className="h-7 text-xs gap-1.5 shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reajustar Parâmetros
                </Button>
              </div>

              {/* Caixa de Ferramentas: Mover Escola entre Rotas */}
              {rotasState.length > 1 && (
                <div className="p-3.5 rounded-lg border bg-card space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <MoveRight className="h-4 w-4 text-primary" /> Mover escola entre rotas (com
                      recálculo)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Rota de Origem</Label>
                      <Select
                        value={sourceRotaIdToMove}
                        onValueChange={(val) => {
                          setSourceRotaIdToMove(val)
                          setSelectedEscolaIdToMove('')
                          // Sugere rota de destino diferente
                          const outra = rotasState.find((r) => r.id !== val)
                          if (outra) setTargetRotaIdToMove(outra.id)
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione a rota" />
                        </SelectTrigger>
                        <SelectContent>
                          {rotasState.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nome} ({r.escolas.length} paradas)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Escola a Mover</Label>
                      <Select
                        value={selectedEscolaIdToMove}
                        onValueChange={setSelectedEscolaIdToMove}
                        disabled={!sourceRotaIdToMove}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue
                            placeholder={
                              sourceRotaIdToMove ? 'Selecione a escola' : 'Escolha a rota primeiro'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(rotasState.find((r) => r.id === sourceRotaIdToMove)?.escolas || []).map(
                            (e) => (
                              <SelectItem key={e.escolaId} value={e.escolaId}>
                                #{e.ordem} {e.escolaNome} ({e.pesoKg} kg)
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Rota de Destino</Label>
                      <Select
                        value={targetRotaIdToMove}
                        onValueChange={setTargetRotaIdToMove}
                        disabled={!sourceRotaIdToMove}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {rotasState
                            .filter((r) => r.id !== sourceRotaIdToMove)
                            .map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      size="sm"
                      onClick={handleMoverEscola}
                      disabled={!selectedEscolaIdToMove || !targetRotaIdToMove}
                      className="h-8 text-xs gap-1 font-semibold"
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> Mover
                    </Button>
                  </div>
                </div>
              )}

              {/* Cards das Rotas Sugeridas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rotasState.map((rota, idx) => (
                  <Card
                    key={rota.id}
                    className="border-t-4 border-t-primary flex flex-col shadow-xs"
                  >
                    <CardHeader className="pb-2.5">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-1.5 font-bold">
                          <Route className="h-4 w-4 text-primary" /> {rota.nome}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs font-mono font-bold">
                          {rota.paradasCount} parada(s)
                        </Badge>
                      </div>
                      {/* Métricas da Rota */}
                      <div className="grid grid-cols-3 gap-2 p-2 rounded-md bg-muted/40 border text-[11px] mt-1.5">
                        <div className="flex items-center gap-1">
                          <Weight className="h-3.5 w-3.5 text-primary shrink-0" />
                          <div>
                            <span className="text-muted-foreground block text-[9px]">Peso:</span>
                            <span className="font-bold">{rota.pesoTotalKg} kg</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                          <div>
                            <span className="text-muted-foreground block text-[9px]">
                              Distância:
                            </span>
                            <span className="font-bold">{rota.distanciaKm} km</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                          <div>
                            <span className="text-muted-foreground block text-[9px]">Duração:</span>
                            <span className="font-bold">
                              {Math.floor(rota.duracaoMin / 60)}h {rota.duracaoMin % 60}m
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="flex-1 space-y-2 text-xs">
                      {rota.escolas.length === 0 ? (
                        <div className="py-6 text-center text-muted-foreground border border-dashed rounded-md text-xs">
                          Nenhuma escola atribuída a esta rota.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                          {rota.escolas.map((esc) => (
                            <div
                              key={esc.escolaId}
                              className="p-2 rounded border bg-card flex items-center justify-between gap-2 hover:border-primary/40 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
                                  {esc.ordem}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold text-foreground truncate text-xs">
                                    {esc.escolaNome}
                                  </p>
                                  {esc.endereco && (
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {esc.endereco}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-mono font-bold text-xs text-primary">
                                  {esc.pesoKg} kg
                                </span>
                                <span className="text-[10px] text-muted-foreground block">
                                  {esc.pedidosCount} pedido(s)
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Seção: Sem coordenadas — incluir manualmente */}
              {semCoordenadasList.length > 0 && (
                <Card className="border-amber-500/40 bg-amber-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Sem coordenadas — incluir manualmente ({semCoordenadasList.length} escola(s))
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      Estas escolas têm pedido ativo no despacho deste ciclo, mas não possuem
                      latitude/longitude. Após confirmar a criação das rotas, você poderá
                      atribuí-las manualmente pelo botão &quot;Roteamento&quot; ou arrastando.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto">
                      {semCoordenadasList.map((e) => (
                        <div
                          key={e.escolaId}
                          className="p-2 rounded border bg-background/80 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate text-xs">
                              {e.escolaNome}
                            </p>
                            {e.endereco && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {e.endereco}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                            {e.pesoKg} kg
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 shrink-0 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            Cancelar
          </Button>

          {step === 'parametros' ? (
            <Button size="sm" onClick={handleCalcularSugestao} className="gap-1.5 font-bold">
              <Sparkles className="h-4 w-4" /> Calcular Sugestão
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep('parametros')}
                disabled={isConfirming}
              >
                Voltar aos Parâmetros
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmar}
                disabled={isConfirming || isCicloBloqueado}
                className="gap-1.5 font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Criando rotas...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Confirmar e Criar Rotas
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
