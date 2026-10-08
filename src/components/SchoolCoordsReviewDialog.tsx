import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Navigation,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  Truck,
  Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CoordenadaSugestaoRecord, CoordenadaSugestaoStatus } from '@/lib/types'
import { coordenadaSugestoesService } from '@/services/coordenada-sugestoes'
import { useAuth } from '@/context/auth-context'
import { useApp } from '@/context/app-context'

export interface SchoolCoordsReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApproved?: () => Promise<void> | void
}

export function SchoolCoordsReviewDialog({
  open,
  onOpenChange,
  onApproved,
}: SchoolCoordsReviewDialogProps) {
  const { user } = useAuth()
  const { schools } = useApp()

  const [sugestoes, setSugestoes] = useState<CoordenadaSugestaoRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<CoordenadaSugestaoStatus | 'todas'>('pendente')
  const [busca, setBusca] = useState('')

  // Ação de aprovar
  const [aprovandoId, setAprovandoId] = useState<string | null>(null)

  // Ação de recusar (com motivo opcional)
  const [recusandoItem, setRecusandoItem] = useState<CoordenadaSugestaoRecord | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [isSubmittingRecusa, setIsSubmittingRecusa] = useState(false)

  const carregarSugestoes = useCallback(async () => {
    setLoading(true)
    try {
      const lista = await coordenadaSugestoesService.getAll({
        status: filtroStatus,
      })
      setSugestoes(lista)
    } catch (err) {
      console.error('Erro ao carregar sugestões de coordenadas:', err)
      toast.error('Erro ao carregar sugestões de coordenadas.')
    } finally {
      setLoading(false)
    }
  }, [filtroStatus])

  useEffect(() => {
    if (open) {
      carregarSugestoes()
    }
  }, [open, carregarSugestoes])

  // Mapa rápido de escola mestre por ID para obter dados atuais
  const escolasMap = useMemo(() => {
    const map = new Map<string, (typeof schools)[0]>()
    schools.forEach((s) => map.set(s.id, s))
    return map
  }, [schools])

  const getEscolaNome = useCallback(
    (esc?: any): string => {
      if (!esc) return ''
      return esc.nome || esc.name || ''
    },
    [],
  )

  const getEscolaEndereco = useCallback(
    (esc?: any): string => {
      if (!esc) return ''
      return esc.endereco || esc.address || ''
    },
    [],
  )

  // Filtragem por busca textual (nome da escola ou motorista)
  const sugestoesFiltradas = useMemo(() => {
    let result = sugestoes
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      result = result.filter((s) => {
        const esc = s.expand?.escola_id || escolasMap.get(s.escola_id)
        const escNome = getEscolaNome(esc)
        const motNome = s.expand?.motorista_id?.nome || ''
        return escNome.toLowerCase().includes(q) || motNome.toLowerCase().includes(q)
      })
    }
    return result
  }, [sugestoes, busca, escolasMap, getEscolaNome])

  // Contagem de pendentes para badge
  const pendentesCount = useMemo(() => {
    return sugestoes.filter((s) => s.status === 'pendente').length
  }, [sugestoes])

  const handleAprovar = async (sugestao: CoordenadaSugestaoRecord) => {
    setAprovandoId(sugestao.id)
    try {
      await coordenadaSugestoesService.aprovarSugestao(sugestao.id, user?.id)
      const esc = sugestao.expand?.escola_id || escolasMap.get(sugestao.escola_id)
      const escNome = getEscolaNome(esc) || 'Escola'
      toast.success(`Coordenadas da escola "${escNome}" atualizadas com sucesso!`)

      await carregarSugestoes()
      if (onApproved) {
        await onApproved()
      }
    } catch (err: any) {
      console.error('Erro ao aprovar sugestão:', err)
      toast.error(err?.message || 'Falha ao atualizar coordenadas da escola.')
    } finally {
      setAprovandoId(null)
    }
  }

  const handleAbrirRecusa = (sugestao: CoordenadaSugestaoRecord) => {
    setRecusandoItem(sugestao)
    setMotivoRecusa('')
  }

  const handleConfirmarRecusa = async () => {
    if (!recusandoItem) return
    setIsSubmittingRecusa(true)
    try {
      await coordenadaSugestoesService.recusarSugestao(recusandoItem.id, motivoRecusa, user?.id)
      toast.info('Sugestão marcada como recusada.')
      setRecusandoItem(null)
      setMotivoRecusa('')
      await carregarSugestoes()
    } catch (err: any) {
      console.error('Erro ao recusar sugestão:', err)
      toast.error('Falha ao recusar sugestão.')
    } finally {
      setIsSubmittingRecusa(false)
    }
  }

  // Gera link do Google Maps para a coordenada sugerida ou comparativa
  const getGoogleMapsPinUrl = (lat: number, lng: number) => {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[96vw] sm:max-w-4xl lg:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {/* Cabeçalho */}
          <div className="p-5 border-b border-border bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                    <Navigation className="h-5 w-5" />
                  </div>
                  <DialogTitle className="text-xl font-bold">
                    Revisão de Coordenadas Sugeridas pelo Motorista
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Coordenadas GPS capturadas automaticamente durante as entregas no Portal do
                  Motorista. Avalie o pino GPS antes de atualizar o cadastro mestre da escola.
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={carregarSugestoes}
                  disabled={loading}
                  className="gap-1.5 text-xs h-8"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
            </div>

            {/* Barra de filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-4 pt-3 border-t border-border/60">
              <div className="sm:col-span-7 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por escola ou motorista..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="sm:col-span-5 flex items-center gap-2">
                <Label className="text-xs text-muted-foreground shrink-0">Status:</Label>
                <Select value={filtroStatus} onValueChange={(val: any) => setFiltroStatus(val)}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">
                      Pendentes ({filtroStatus === 'pendente' ? sugestoes.length : '...'})
                    </SelectItem>
                    <SelectItem value="aprovada">Aprovadas</SelectItem>
                    <SelectItem value="recusada">Recusadas</SelectItem>
                    <SelectItem value="todas">Todas as sugestões</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tabela de sugestões */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Carregando sugestões do banco...</span>
              </div>
            ) : sugestoesFiltradas.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Navigation className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">
                  Nenhuma sugestão encontrada
                </h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {busca
                    ? 'Nenhum resultado corresponde à sua busca.'
                    : filtroStatus === 'pendente'
                      ? 'Não há sugestões pendentes de revisão no momento. Quando os motoristas confirmarem entregas pelo celular, as coordenadas aparecerão aqui.'
                      : 'Nenhuma sugestão cadastrada para o filtro selecionado.'}
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="w-[260px] text-xs font-semibold">
                        Escola / Instituição
                      </TableHead>
                      <TableHead className="min-w-[190px] text-xs font-semibold">
                        Comparativo de Posição
                      </TableHead>
                      <TableHead className="w-[180px] text-xs font-semibold">
                        Origem / Motorista
                      </TableHead>
                      <TableHead className="w-[110px] text-xs font-semibold">Status</TableHead>
                      <TableHead className="w-[150px] text-right text-xs font-semibold">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sugestoesFiltradas.map((sug) => {
  const esc = sug.expand?.escola_id || escolasMap.get(sug.escola_id)
  const escNome = getEscolaNome(esc) || 'Escola não identificada'
  const escEndereco = getEscolaEndereco(esc)
  const escLat = esc?.latitude
  const escLng = esc?.longitude

  const comp = coordenadaSugestoesService.compararDistancia(
    escLat,
    escLng,
    sug.lat,
    sug.lng,
  )

  const motoristaNome =
    sug.expand?.motorista_id?.nome || 'Motorista'
  const cicloNome =
    (sug.expand?.ciclo_id as any)?.nome ||
    (sug.expand?.ciclo_id as any)?.numero ||
    ''
  const dataEntregaFormatada = sug.entregue_em
    ? new Date(sug.entregue_em).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : sug.created
    ? new Date(sug.created).toLocaleDateString('pt-BR')
    : '—'

  return (
    <TableRow key={sug.id} className="hover:bg-muted/40 text-xs">
      {/* 1. Escola */}
      <TableCell className="align-top py-3">
        <div className="space-y-1">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="line-clamp-2" title={escNome}>
              {escNome}
            </span>
          </div>
          {escEndereco && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              {escEndereco}
            </p>
          )}
                              <div className="text-[10px] font-mono text-muted-foreground/80">
                                ID: {sug.escola_id}
                              </div>
                            </div>
                          </TableCell>

                          {/* 2. Comparativo de Posição */}
                          <TableCell className="align-top py-3">
                            <div className="space-y-1.5">
                              {/* Coordenada sugerida pelo motorista */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/30 gap-1"
                                >
                                  <MapPin className="h-3 w-3 text-emerald-600" />
                                  Sugerida: {sug.lat.toFixed(5)}, {sug.lng.toFixed(5)}
                                </Badge>
                                <a
                                  href={getGoogleMapsPinUrl(sug.lat, sug.lng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline inline-flex items-center gap-0.5 text-[10px]"
                                  title="Ver coordenada sugerida no Google Maps"
                                >
                                  Ver no Maps <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              </div>

                              {/* Coordenada atual da escola */}
                              <div className="text-[11px] text-muted-foreground">
                                {comp.temCoordAtual ? (
                                  <span>
                                    Atual:{' '}
                                    <strong className="font-mono text-foreground/80">
                                      {escLat}, {escLng}
                                    </strong>
                                  </span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                                    Sem coordenadas cadastradas no mestre
                                  </span>
                                )}
                              </div>

                              {/* Distância entre elas */}
                              <div className="text-[11px]">
                                {comp.temCoordAtual ? (
                                  <span
                                    className={`font-medium ${
                                      (comp.distanciaMetros || 0) > 500
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                  >
                                    Distância: {comp.rotuloFormatado}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-medium text-[10px]">
                                    ✓ Preencherá latitude e longitude da escola
                                  </span>
                                )}
                                {sug.precisao !== undefined && (
                                  <span className="text-muted-foreground text-[10px] ml-1.5">
                                    (precisão GPS: ±{Math.round(sug.precisao)}m)
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* 3. Origem / Motorista */}
                          <TableCell className="align-top py-3">
                            <div className="space-y-1 text-[11px]">
                              <div className="flex items-center gap-1 font-medium text-foreground">
                                <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span>{motoristaNome}</span>
                              </div>
                              <div className="text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span>{dataEntregaFormatada}</span>
                              </div>
                              {cicloNome && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                  Ciclo: {cicloNome}
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* 4. Status */}
                          <TableCell className="align-top py-3">
                            {sug.status === 'pendente' && (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-300 text-[10px]"
                              >
                                Pendente
                              </Badge>
                            )}
                            {sug.status === 'aprovada' && (
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300 text-[10px]"
                              >
                                Aprovada
                              </Badge>
                            )}
                            {sug.status === 'recusada' && (
                              <div className="space-y-0.5">
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 dark:bg-slate-800 border-slate-300 text-slate-600 dark:text-slate-400 text-[10px]"
                                >
                                  Recusada
                                </Badge>
                                {sug.motivo_recusa && (
                                  <p
                                    className="text-[10px] text-muted-foreground italic line-clamp-2"
                                    title={sug.motivo_recusa}
                                  >
                                    Motivo: {sug.motivo_recusa}
                                  </p>
                                )}
                              </div>
                            )}
                          </TableCell>

                          {/* 5. Ações */}
                          <TableCell className="align-top py-3 text-right">
                            {sug.status === 'pendente' ? (
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                  disabled={aprovandoId === sug.id}
                                  onClick={() => handleAprovar(sug)}
                                  title="Aprovar e aplicar coordenadas na escola"
                                >
                                  {aprovandoId === sug.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                  )}
                                  Aprovar
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 gap-1"
                                  onClick={() => handleAbrirRecusa(sug)}
                                  title="Recusar sugestão"
                                >
                                  <XCircle className="h-3 w-3" />
                                  Recusar
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground italic">
                                {sug.revisado_em
                                  ? `Revisada em ${new Date(sug.revisado_em).toLocaleDateString(
                                      'pt-BR',
                                    )}`
                                  : 'Revisada'}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Rodapé informativo */}
          <div className="p-3 border-t border-border bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              <span>
                Aprovar substitui as coordenadas oficiais da escola no cadastro mestre e recalcula
                rotas futuras.
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Recusa com Motivo Opcional */}
      <Dialog
        open={Boolean(recusandoItem)}
        onOpenChange={(op) => {
          if (!op) setRecusandoItem(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Recusar Sugestão de Coordenada
            </DialogTitle>
            <DialogDescription className="text-xs">
              A coordenada sugerida não será aplicada na escola. O registro será mantido como
              histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="motivo-recusa" className="text-xs">
                Motivo da Recusa (opcional):
              </Label>
              <Textarea
                id="motivo-recusa"
                placeholder="Ex: Motorista estava distante da entrada principal / Coordenada imprecisa..."
                value={motivoRecusa}
                onChange={(e) => setMotivoRecusa(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecusandoItem(null)}
              disabled={isSubmittingRecusa}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmarRecusa}
              disabled={isSubmittingRecusa}
            >
              {isSubmittingRecusa ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Recusando...
                </>
              ) : (
                'Confirmar Recusa'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
