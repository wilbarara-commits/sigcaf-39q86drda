import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  rotaDespachosService,
  entregaRegistrosService,
  type MotoristaPortalData,
  type MotoristaPortalParada,
} from '@/services/rota-despachos'
import {
  lerFilaLocal,
  enfileirarEntrega,
  sincronizarFilaEntregas,
  salvarCachePortal,
  lerCachePortal,
  type FilaEntregaItem,
} from '@/lib/motoristaOffline'
import type { EscolaRecord, EntregaRegistroRecord } from '@/lib/types'
import { SignaturePad } from '@/components/SignaturePad'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Truck,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
  MapPin,
  AlertTriangle,
  FileCheck,
  Check,
  Loader2,
  Camera,
  Image as ImageIcon,
  Trash2,
  Navigation,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { MotoristaTrechoMapa } from '@/components/MotoristaTrechoMapa'
import { compressImage } from '@/lib/imageCompressor'
import {
  extrairCoordenadas,
  DEPOSITO_CENTRAL,
  resolverDepositoCentral,
} from '@/lib/routeOptimization'
import { configuracoesService } from '@/services/configuracoes'

export const MotoristaPortal: React.FC = () => {
  const [searchParams] = useSearchParams()
  const token = (searchParams.get('token') || '').trim()

  const [loading, setLoading] = useState(true)
  const [tokenStatus, setTokenStatus] = useState<'valido' | 'renovado' | 'invalido'>('valido')
  const [data, setData] = useState<MotoristaPortalData | null>(null)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [isSyncing, setIsSyncing] = useState(false)
  const [filaLocal, setFilaLocal] = useState<FilaEntregaItem[]>([])

  // Coordenadas do Depósito Central da Cooperativa (das configurações do sistema)
  const [depositoConfig, setDepositoConfig] = useState<{
    latitude: number
    longitude: number
    nome: string
    isCadastrado: boolean
  }>({
    latitude: DEPOSITO_CENTRAL.latitude,
    longitude: DEPOSITO_CENTRAL.longitude,
    nome: DEPOSITO_CENTRAL.nome,
    isCadastrado: false,
  })

  // Modal de registro de entrega por parada
  const [selectedParada, setSelectedParada] = useState<MotoristaPortalParada | null>(null)
  const [chegadaEm, setChegadaEm] = useState<string>('')
  const [assinaturaDataUrl, setAssinaturaDataUrl] = useState<string | undefined>(undefined)
  const [fotoDataUrl, setFotoDataUrl] = useState<string | undefined>(undefined)
  const [isProcessingFoto, setIsProcessingFoto] = useState(false)
  const [observacao, setObservacao] = useState<string>('')
  const [isSavingEntrega, setIsSavingEntrega] = useState(false)

  // Atualizar estado de conexão online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Tenta sincronizar automaticamente quando volta sinal
      if (token) {
        syncFila()
      }
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [token])

  // Carregar configurações do depósito da cooperativa (Depósito Central único das configurações)
  useEffect(() => {
    configuracoesService
      .get()
      .then((cfg) => {
        const depResolvido = resolverDepositoCentral(cfg)
        const coordsCadastradas = Boolean(
          cfg && extrairCoordenadas(cfg.deposito_latitude, cfg.deposito_longitude),
        )
        setDepositoConfig({
          latitude: depResolvido.latitude,
          longitude: depResolvido.longitude,
          nome: depResolvido.nome,
          isCadastrado: coordsCadastradas,
        })
      })
      .catch(() => {
        setDepositoConfig({
          latitude: DEPOSITO_CENTRAL.latitude,
          longitude: DEPOSITO_CENTRAL.longitude,
          nome: DEPOSITO_CENTRAL.nome,
          isCadastrado: false,
        })
      })
  }, [])

  // Carregar dados da rota pelo token
  const carregarDados = useCallback(
    async (silencioso = false) => {
      if (!token) {
        setTokenStatus('invalido')
        setLoading(false)
        return
      }

      if (!silencioso) setLoading(true)

      // Atualiza fila local do token
      const fila = lerFilaLocal(token)
      setFilaLocal(fila)

      try {
        const valRes = await rotaDespachosService.getByToken(token)
        if (valRes.status !== 'valido' || !valRes.record) {
          setTokenStatus(valRes.status)
          // Se estiver offline e tínhamos cache, tenta mostrar
          if (!navigator.onLine) {
            const cached = lerCachePortal(token)
            if (cached) {
              setData(cached)
              setTokenStatus('valido')
            }
          }
          setLoading(false)
          return
        }

        setTokenStatus('valido')
        const portalData = await rotaDespachosService.carregarPortalMotorista(valRes.record)
        setData(portalData)
        salvarCachePortal(token, portalData)

        // Se houver entregas na fila local com sucesso, mesclar visualmente
        if (fila.length > 0) {
          syncFila()
        }
      } catch (err) {
        console.warn('Erro ao carregar do servidor, tentando cache local:', err)
        const cached = lerCachePortal(token)
        if (cached) {
          setData(cached)
          setTokenStatus('valido')
        } else {
          setTokenStatus('invalido')
        }
      } finally {
        setLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Função de sincronização da fila
  const syncFila = async () => {
    if (!token || isSyncing || !navigator.onLine) return
    setIsSyncing(true)
    try {
      const res = await sincronizarFilaEntregas(token, async (item) => {
        return await entregaRegistrosService.salvarRegistro({
          rota_id: item.rota_id,
          escola_id: item.escola_id,
          motorista_id: item.motorista_id,
          despacho_id: item.despacho_id,
          chegada_em: item.chegada_em,
          confirmado_em: item.confirmado_em,
          assinatura: item.assinatura,
          foto: item.foto,
          observacao: item.observacao,
          client_uid: item.client_uid,
        })
      })

      const novaFila = lerFilaLocal(token)
      setFilaLocal(novaFila)

      if (res.sucessos > 0) {
        toast({
          title: 'Sincronização concluída',
          description: `${res.sucessos} entrega(s) sincronizada(s) com a central.`,
        })
        // Recarregar os dados para atualizar as paradas
        await carregarDados(true)
      }
    } catch (e) {
      console.error('Erro na sincronização:', e)
    } finally {
      setIsSyncing(false)
    }
  }

  // Intervalo de tentativa de sync automática a cada 20s se houver pendências
  useEffect(() => {
    const pendentes = filaLocal.some((f) => f.status_sync === 'pendente')
    if (!pendentes) return

    const interval = setInterval(() => {
      if (navigator.onLine && !isSyncing) {
        syncFila()
      }
    }, 20000)

    return () => clearInterval(interval)
  }, [filaLocal, isSyncing, token])

  // Abrir modal de entrega: grava AUTOMATICAMENTE o horário de chegada
  const handleOpenRegistro = (parada: MotoristaPortalParada) => {
    setSelectedParada(parada)
    // Horário de chegada gravado automaticamente no momento da abertura do formulário
    const nowIso = new Date().toISOString()
    setChegadaEm(parada.registro?.chegada_em || nowIso)
    setAssinaturaDataUrl(parada.registro?.assinatura || undefined)
    setFotoDataUrl(parada.registro?.foto || undefined)
    setObservacao(parada.registro?.observacao || '')
  }

  // Manipular captura/anexo de foto do material entregue
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingFoto(true)
    try {
      // Compactar no cliente antes de salvar em base64: max ~1280px e JPEG ~0.8
      const res = await compressImage(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.8 })
      setFotoDataUrl(res.dataUrl)
      toast({
        title: 'Foto anexada',
        description: 'Foto compactada e pronta para o comprovante.',
      })
    } catch (err) {
      console.error('Erro ao processar foto:', err)
      toast({
        variant: 'destructive',
        title: 'Falha na foto',
        description: 'Não foi possível carregar a imagem. Tente novamente.',
      })
    } finally {
      setIsProcessingFoto(false)
      // Limpar input para permitir re-seleção se necessário
      e.target.value = ''
    }
  }

  const handleRemoverFoto = () => {
    setFotoDataUrl(undefined)
  }

  // Confirmar registro de entrega: grava AUTOMATICAMENTE horário de confirmação
  const handleConfirmEntrega = async () => {
    if (!selectedParada || !data) return
    setIsSavingEntrega(true)
    const nowIso = new Date().toISOString()
    const clientUid = `cli_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const registroItem = {
      client_uid: clientUid,
      rota_id: data.rota.id,
      escola_id: selectedParada.escola_id,
      motorista_id: data.despacho.motorista_id,
      despacho_id: data.despacho.id,
      chegada_em: chegadaEm || nowIso,
      confirmado_em: nowIso,
      assinatura: assinaturaDataUrl,
      foto: fotoDataUrl,
      observacao: observacao.trim() || undefined,
      status_sync: (navigator.onLine ? 'pendente' : 'pendente') as 'pendente',
    }

    try {
      // 1. Sempre grava imediatamente na fila offline local (garantia de não perda)
      enfileirarEntrega(token, registroItem)
      const novaFila = lerFilaLocal(token)
      setFilaLocal(novaFila)

      // 2. Atualizar estado visual local imediatamente (otimista)
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          paradas: prev.paradas.map((p) =>
            p.escola_id === selectedParada.escola_id
              ? {
                  ...p,
                  registro: {
                    id: clientUid,
                    rota_id: data.rota.id,
                    escola_id: selectedParada.escola_id,
                    motorista_id: data.despacho.motorista_id,
                    despacho_id: data.despacho.id,
                    chegada_em: chegadaEm || nowIso,
                    confirmado_em: nowIso,
                    assinatura: assinaturaDataUrl,
                    foto: fotoDataUrl,
                    observacao: observacao.trim() || undefined,
                    status_sync: 'pendente',
                  },
                }
              : p,
          ),
        }
      })

      // 3. Se online, tenta enviar imediatamente
      if (navigator.onLine) {
        try {
          await entregaRegistrosService.salvarRegistro({
            rota_id: data.rota.id,
            escola_id: selectedParada.escola_id,
            motorista_id: data.despacho.motorista_id,
            despacho_id: data.despacho.id,
            chegada_em: chegadaEm || nowIso,
            confirmado_em: nowIso,
            assinatura: assinaturaDataUrl,
            foto: fotoDataUrl,
            observacao: observacao.trim() || undefined,
            client_uid: clientUid,
          })
          // Atualiza a fila marcando sincronizado
          const f = lerFilaLocal(token).map((it) =>
            it.client_uid === clientUid ? { ...it, status_sync: 'sincronizado' as const } : it,
          )
          salvarCachePortal(token, data)
          setFilaLocal(f)
          toast({
            title: 'Entrega registrada!',
            description: 'Dados sincronizados com a cooperativa.',
          })
        } catch (err) {
          toast({
            title: 'Salvo localmente (Offline)',
            description: 'Será sincronizado automaticamente assim que houver sinal.',
          })
        }
      } else {
        toast({
          title: 'Entrega salva no celular (Sem sinal)',
          description: 'Aguardando conexão para sincronizar.',
        })
      }

      setSelectedParada(null)
    } finally {
      setIsSavingEntrega(false)
    }
  }

  // Contagem de entregas realizadas
  const contagemEntregas = useMemo(() => {
    if (!data?.paradas) return { feitas: 0, total: 0 }
    const total = data.paradas.length
    // Conta se tem registro confirmado no banco ou na fila local
    const entreguesSet = new Set<string>()
    data.paradas.forEach((p) => {
      if (p.registro?.confirmado_em) entreguesSet.add(p.escola_id)
    })
    filaLocal.forEach((f) => {
      entreguesSet.add(f.escola_id)
    })
    return {
      feitas: entreguesSet.size,
      total,
    }
  }, [data, filaLocal])

  const pendentesSyncCount = useMemo(() => {
    return filaLocal.filter((f) => f.status_sync === 'pendente').length
  }, [filaLocal])

  // Próxima entrega pendente na ordem da rota
  const proximaParadaPendente = useMemo(() => {
    if (!data?.paradas) return null
    return (
      data.paradas.find((p) => {
        const estaEntregueNoBanco = Boolean(p.registro?.confirmado_em)
        const estaEntregueNaFila = filaLocal.some(
          (f) => f.escola_id === p.escola_id && f.confirmado_em,
        )
        return !estaEntregueNoBanco && !estaEntregueNaFila
      }) || null
    )
  }, [data, filaLocal])

  // Última parada FECHADA (já entregue) na ordem da rota
  const ultimaParadaEntregue = useMemo(() => {
    if (!data?.paradas) return null
    // Filtra todas as paradas já entregues e pega a de maior ordem (última entregue)
    const entregues = data.paradas
      .filter((p) => {
        const estaEntregueNoBanco = Boolean(p.registro?.confirmado_em)
        const estaEntregueNaFila = filaLocal.some(
          (f) => f.escola_id === p.escola_id && f.confirmado_em,
        )
        return estaEntregueNoBanco || estaEntregueNaFila
      })
      .sort((a, b) => b.ordem - a.ordem)

    return entregues[0] || null
  }, [data, filaLocal])

  // Coordenadas válidas para o trecho:
  // - Antes da primeira entrega: origem = Depósito Central (das configurações)
  // - Depois de entregar a parada N: origem = parada N (a última entregue)
  // - Se a última parada não tiver coordenadas válidas: fallback seguro para o depósito central
  const trechoOrigemInfo = useMemo(() => {
    if (ultimaParadaEntregue) {
      const esc = ultimaParadaEntregue.escola
      const coords = extrairCoordenadas(esc?.latitude, esc?.longitude)
      if (coords) {
        const escNome = esc?.nome || (esc as any)?.name || `Parada #${ultimaParadaEntregue.ordem}`
        return {
          latitude: coords.latitude,
          longitude: coords.longitude,
          tipo: 'parada_anterior' as const,
          nome: escNome,
          ordem: ultimaParadaEntregue.ordem,
        }
      }
    }

    return {
      latitude: depositoConfig.latitude,
      longitude: depositoConfig.longitude,
      tipo: 'deposito' as const,
      nome: depositoConfig.nome,
    }
  }, [ultimaParadaEntregue, depositoConfig])

  const trechoDestinoInfo = useMemo(() => {
    if (!proximaParadaPendente) return null
    const esc = proximaParadaPendente.escola
    const coords = extrairCoordenadas(esc?.latitude, esc?.longitude)
    if (!coords) return null
    const escNome = esc?.nome || (esc as any)?.name || 'Próxima Parada'
    const escEnd = esc?.endereco || (esc as any)?.address || ''
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      nome: escNome,
      ordem: proximaParadaPendente.ordem,
      endereco: escEnd,
    }
  }, [proximaParadaPendente])

  // Link do Google Maps do trecho (origem -> destino)
  const googleMapsTrechoUrl = useMemo(() => {
    if (!trechoDestinoInfo || !trechoOrigemInfo) return ''
    const destStr = `${trechoDestinoInfo.latitude},${trechoDestinoInfo.longitude}`
    const origStr = `${trechoOrigemInfo.latitude},${trechoOrigemInfo.longitude}`
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      origStr,
    )}&destination=${encodeURIComponent(destStr)}&travelmode=driving`
  }, [trechoOrigemInfo, trechoDestinoInfo])

  // Formatação de hora simples
  const formatTime = (iso?: string) => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">
            Carregando rota do motorista...
          </p>
        </div>
      </div>
    )
  }

  if (tokenStatus === 'renovado') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-amber-300 shadow-md">
          <CardHeader className="text-center pb-2">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-2" />
            <CardTitle className="text-xl text-amber-900">Link Renovado</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Esta rota foi redisparada pela cooperativa e este link não é mais válido.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-xs text-muted-foreground space-y-4 pt-2">
            <p>
              Por favor, solicite o <strong>novo link atualizado</strong> à cooperativa pelo
              WhatsApp.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (tokenStatus === 'invalido' || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive/40 shadow-md">
          <CardHeader className="text-center pb-2">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle className="text-xl text-destructive">Link Inválido ou Expirado</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Não foi possível localizar uma rota ativa para este endereço.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-xs text-muted-foreground pt-2">
            <p>Verifique o link recebido no WhatsApp ou contate a administração da cooperativa.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const motoristaNome = data.despacho.expand?.motorista_id?.nome || 'Motorista'
  const cicloNome =
    (data.despacho.expand?.ciclo_id as any)?.nome ||
    (data.despacho.expand?.ciclo_id as any)?.numero ||
    ''
  const chamadaNome = data.despacho.expand?.chamada_id?.chamada || ''
  const chamadaOuCiclo = cicloNome || chamadaNome

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-16">
      {/* Barra de Status de Conexão Superior */}
      <div
        className={`sticky top-0 z-30 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs transition-colors ${
          isOnline ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white animate-pulse'
        }`}
      >
        <div className="flex items-center gap-2">
          {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          <span>{isOnline ? 'Online (Conectado)' : 'Offline (Modo sem sinal ativo)'}</span>
        </div>

        <div className="flex items-center gap-2">
          {pendentesSyncCount > 0 && (
            <Badge variant="secondary" className="bg-white/20 text-white text-[11px] px-2 py-0.5">
              {pendentesSyncCount} aguardando sinal
            </Badge>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => carregarDados(false)}
            disabled={loading || isSyncing}
            className="h-7 px-2 text-white hover:bg-white/20 text-xs gap-1"
            title="Atualizar rota e sincronizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Cabeçalho do Motorista */}
        <Card className="border-t-4 border-t-primary shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge variant="outline" className="text-primary font-bold mb-1">
                  PORTAL DO MOTORISTA
                </Badge>
                <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <Truck className="h-6 w-6 text-primary" />
                  {data.rota.nome}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Motorista: <strong className="text-foreground">{motoristaNome}</strong>
                  {chamadaOuCiclo && ` • ${chamadaOuCiclo}`}
                </CardDescription>
              </div>

              <div className="text-right shrink-0">
                <div className="text-2xl sm:text-3xl font-black text-primary">
                  {contagemEntregas.feitas}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{contagemEntregas.total}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Entregas feitas
                </span>
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mt-3">
              <div
                className="bg-emerald-600 h-full transition-all duration-300"
                style={{
                  width: `${
                    contagemEntregas.total > 0
                      ? (contagemEntregas.feitas / contagemEntregas.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </CardHeader>
        </Card>

        {/* SEÇÃO DO MAPA DO TRECHO (Origem -> Próxima Entrega Pendente) */}
        {trechoDestinoInfo ? (
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center justify-between">
              <span>Mapa do Trecho a Percorrer</span>
              <span className="text-[11px] font-semibold text-primary">
                Próxima: Parada #{trechoDestinoInfo.ordem}
              </span>
            </h3>
            <MotoristaTrechoMapa
              origem={trechoOrigemInfo}
              destino={trechoDestinoInfo}
              todasParadas={data.paradas.map((p) => {
                const c = extrairCoordenadas(p.escola?.latitude, p.escola?.longitude)
                return {
                  latitude: c ? c.latitude : undefined,
                  longitude: c ? c.longitude : undefined,
                  nome: p.escola?.nome || 'Escola',
                  ordem: p.ordem,
                  entregue: Boolean(
                    p.registro?.confirmado_em ||
                    filaLocal.some((f) => f.escola_id === p.escola_id && f.confirmado_em),
                  ),
                }
              })}
              googleMapsUrl={googleMapsTrechoUrl}
            />{' '}
          </div>
        ) : contagemEntregas.feitas > 0 && contagemEntregas.feitas >= contagemEntregas.total ? (
          <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-1.5" />
            <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
              Todas as entregas da rota foram concluídas!
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              Excelente trabalho! Retorne ao depósito ou informe à central.
            </p>
          </Card>
        ) : null}

        {/* Lista de Paradas na Ordem */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center justify-between">
            <span>Roteiro de Entregas (Na ordem)</span>
            <span>{data.paradas.length} paradas</span>
          </h3>

          {data.paradas.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma escola cadastrada nesta rota.
            </Card>
          ) : (
            data.paradas.map((parada) => {
              const escola = parada.escola
              const filaItem = filaLocal.find((f) => f.escola_id === parada.escola_id)
              const estaEntregue = Boolean(
                parada.registro?.confirmado_em || filaItem?.confirmado_em,
              )
              const horaChegada = formatTime(parada.registro?.chegada_em || filaItem?.chegada_em)
              const horaConfirmacao = formatTime(
                parada.registro?.confirmado_em || filaItem?.confirmado_em,
              )
              const statusSyncItem = filaItem?.status_sync || parada.registro?.status_sync

              // Resolução defensiva de campos da escola (compatível com EscolaRecord real e UI School)
              const escolaNome =
                escola?.nome ||
                (escola as any)?.name ||
                (escola as any)?.nome_escola ||
                'Escola sem nome'

              const escolaEndereco =
                escola?.endereco || (escola as any)?.address || (escola as any)?.logradouro || ''

              const escolaBairro = escola?.bairro || ''
              const enderecoCompleto = [escolaEndereco, escolaBairro].filter(Boolean).join(' - ')

              const escolaTelefone = escola?.telefone || (escola as any)?.contact || ''
              const escolaContatoNome = escola?.contato || (escola as any)?.contatoResponsavel || ''
              const infoContato = [
                escolaTelefone,
                escolaContatoNome ? `(${escolaContatoNome})` : '',
              ]
                .filter(Boolean)
                .join(' ')

              // Monta link do Google Maps para a escola se houver endereço ou coordenadas
              let mapsUrl = ''
              if (escola?.latitude && escola?.longitude) {
                mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${escola.latitude},${escola.longitude}`,
                )}`
              } else if (enderecoCompleto || escolaEndereco || escolaNome) {
                const buscaMaps = enderecoCompleto || escolaEndereco || escolaNome
                mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  buscaMaps,
                )}`
              }

              return (
                <Card
                  key={parada.id}
                  className={`border transition-all shadow-xs ${
                    estaEntregue
                      ? 'border-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Indicador de Ordem ou Check de Entregue */}
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 mt-0.5 ${
                            estaEntregue
                              ? 'bg-emerald-600 text-white'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          {estaEntregue ? <Check className="h-5 w-5" /> : `#${parada.ordem}`}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-base text-foreground leading-snug">
                              {escolaNome}
                            </h4>
                            {parada.contratoNumero && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 font-mono font-medium border-slate-300 dark:border-slate-700 text-muted-foreground"
                              >
                                {parada.contratoNumero}
                              </Badge>
                            )}
                          </div>

                          {enderecoCompleto && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{enderecoCompleto}</span>
                            </p>
                          )}

                          {infoContato && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Contato: {infoContato}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Botão de rota no Google Maps */}
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-medium"
                          title="Abrir endereço no Google Maps"
                        >
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          <span className="hidden sm:inline">Mapa</span>
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      )}
                    </div>

                    {/* Status da entrega e horários gravados */}
                    {estaEntregue ? (
                      <div className="pt-2 border-t border-emerald-200 dark:border-emerald-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1 text-[11px] px-2 py-0.5 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Entregue
                          </Badge>

                          <span className="text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center gap-1 font-medium">
                            <Clock className="h-3 w-3" />
                            {horaChegada && `Chegada: ${horaChegada}`}
                            {horaConfirmacao && ` • Saída: ${horaConfirmacao}`}
                          </span>

                          {statusSyncItem === 'pendente' && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-600 border-amber-300 bg-amber-50"
                            >
                              Aguardando sinal
                            </Badge>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenRegistro(parada)}
                          className="h-7 text-xs border-emerald-300 hover:bg-emerald-100"
                        >
                          Ver / Editar
                        </Button>
                      </div>
                    ) : (
                      <div className="pt-2 border-t flex items-center justify-end">
                        <Button
                          type="button"
                          size="lg"
                          onClick={() => handleOpenRegistro(parada)}
                          className="w-full sm:w-auto h-11 text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs gap-2"
                        >
                          <FileCheck className="h-4 w-4" />
                          Registrar Entrega
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* MODAL DE REGISTRO DE ENTREGA (TEMPOS AUTOMÁTICOS + ASSINATURA) */}
      <Dialog
        open={Boolean(selectedParada)}
        onOpenChange={(open) => {
          if (!open) setSelectedParada(null)
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileCheck className="h-5 w-5 text-primary" />
              Registrar Entrega
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedParada?.escola?.nome ||
                (selectedParada?.escola as any)?.name ||
                'Escola'}{' '}
              (Parada #{selectedParada?.ordem})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Bloco de Horários Automáticos (sem digitação manual) */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Horário de Chegada (Automático):
                </span>
                <strong className="text-foreground font-mono text-sm">
                  {formatTime(chegadaEm) || 'Registrado agora'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                <span>Horário de Confirmação:</span>
                <span className="font-mono">Gravado ao salvar</span>
              </div>
            </div>

            {/* Assinatura em Canvas Touch */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">
                Assinatura do Recebedor na Escola <span className="text-destructive">*</span>
              </Label>
              <SignaturePad
                value={assinaturaDataUrl}
                onChange={(dataUrl) => setAssinaturaDataUrl(dataUrl)}
                disabled={isSavingEntrega}
              />
            </div>

            {/* Foto do Material Entregue (Câmera ou Arquivo) */}
            <div className="space-y-2 pt-1 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Camera className="h-4 w-4 text-primary" />
                  Foto do Material Entregue (Opcional)
                </Label>
                {fotoDataUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoverFoto}
                    disabled={isSavingEntrega || isProcessingFoto}
                    className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remover
                  </Button>
                )}
              </div>

              {fotoDataUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col items-center justify-center">
                  <img
                    src={fotoDataUrl}
                    alt="Foto do Material Entregue"
                    className="max-h-56 w-auto object-contain rounded-md"
                  />
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    Compactada (~1280px)
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFotoChange}
                      disabled={isSavingEntrega || isProcessingFoto}
                      className="hidden"
                    />
                    <div className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors">
                      {isProcessingFoto ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Camera className="h-4 w-4 text-primary" />
                      )}
                      <span>Tirar Foto (Câmera)</span>
                    </div>
                  </label>

                  <label className="flex-1 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFotoChange}
                      disabled={isSavingEntrega || isProcessingFoto}
                      className="hidden"
                    />
                    <div className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors">
                      {isProcessingFoto ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-primary" />
                      )}
                      <span>Escolher da Galeria</span>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Observação opcional */}
            <div className="space-y-1.5">
              <Label htmlFor="obs-entrega" className="text-xs font-semibold text-foreground">
                Observações da Entrega (Opcional)
              </Label>
              <Textarea
                id="obs-entrega"
                placeholder="Ex: Recebido pela nutricionista Maria, portão lateral, etc."
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSavingEntrega}
              onClick={() => setSelectedParada(null)}
              className="h-10 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isSavingEntrega}
              onClick={handleConfirmEntrega}
              className="h-10 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
            >
              {isSavingEntrega ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Confirmar Entrega
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
