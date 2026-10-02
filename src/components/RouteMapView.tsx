import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { extrairCoordenadas, calcularDistanciaTotalCaminho } from '@/lib/routeOptimization'
import {
  obterRotaEstradaOSRM,
  obterRotaEstradaEmRotaOSRM,
  OsrmRouteResult,
  OsrmEmRotaResult,
} from '@/services/osrm'
import {
  MapPin,
  Building2,
  Warehouse,
  AlertTriangle,
  ZoomIn,
  Layers,
  Info,
  Navigation,
  Loader2,
} from 'lucide-react'

export interface ParadaMapaItem {
  escolaId: string
  nome: string
  endereco?: string
  alunos?: number
  ordem: number
  contratoNumero?: string
  latitude?: string | number | null
  longitude?: string | number | null
  pedidosCount?: number
}

export interface RouteMapViewProps {
  rotaNome: string
  paradas: ParadaMapaItem[]
  deposito: {
    nome: string
    latitude: number
    longitude: number
  }
  caminhaoEscolaId?: string | null
  isEmRota?: boolean
  height?: string | number
  className?: string
}

/**
 * Cria divIcon do Leaflet para o Depósito Central (origem da rota).
 */
function createDepositoIcon(nome: string) {
  return L.divIcon({
    className: 'custom-deposito-marker',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 9999px;
        background-color: #0f172a;
        color: #ffffff;
        border: 2.5px solid #38bdf8;
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        cursor: pointer;
        transition: transform 0.15s ease-in-out;
      " title="${nome.replace(/"/g, '&quot;')}">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })
}

/**
 * Cria divIcon do Leaflet para uma Parada da Rota com o NÚMERO DA PARADA bem visível.
 * Estilo circular elegante compatível com Tailwind (verde esmeralda primário).
 */
function createNumberedStopIcon(ordem: number, isFirst: boolean) {
  const bg = isFirst ? '#15803d' : '#047857' // destaque para a 1ª parada
  const border = '#ffffff'
  const size = ordem >= 100 ? 32 : 30

  return L.divIcon({
    className: `custom-stop-marker stop-marker-${ordem}`,
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${size}px;
        height: ${size}px;
        border-radius: 9999px;
        background-color: ${bg};
        color: #ffffff;
        border: 2.5px solid ${border};
        box-shadow: 0 3px 8px rgba(0,0,0,0.35);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 700;
        font-size: ${ordem >= 100 ? '11px' : '13px'};
        line-height: 1;
        cursor: pointer;
        transition: transform 0.15s ease-in-out;
      ">
        ${ordem}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

/**
 * Cria divIcon do Leaflet para o Marcador de CAMINHÃO com animação de pulso.
 * Posicionado junto à parada indicada, com visual chamativo e elegante (laranja/âmbar escuro com pulso).
 */
function createTruckMarkerIcon(ordem: number) {
  return L.divIcon({
    className: 'custom-truck-marker',
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        pointer-events: auto;
      ">
        <!-- Anel de pulso contínuo -->
        <span style="
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 9999px;
          background-color: rgba(245, 158, 11, 0.45);
          animation: truck-pulse 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        "></span>
        <!-- Botão/Pino do Caminhão -->
        <div style="
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #ffffff;
          border: 2.5px solid #ffffff;
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.6), 0 2px 4px rgba(0,0,0,0.25);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        " title="Caminhão de Entrega — Parada atual #${ordem}">
          🚚
        </div>
        <!-- Badgezinha com número da parada -->
        <div style="
          position: absolute;
          top: -2px;
          right: -2px;
          background-color: #1e293b;
          color: #f8fafc;
          border: 1.5px solid #ffffff;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: 800;
          padding: 0 4px;
          line-height: 14px;
          min-width: 16px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        ">
          ${ordem}
        </div>
      </div>
    `,
    iconSize: [44, 44],
    // Leve offset (-16, -26) para ficar visível ao lado/acima do pino verde da parada
    iconAnchor: [30, 36],
    popupAnchor: [-8, -36],
  })
}

/**
 * Sub-componente que ajusta a visualização para enquadrar todos os pontos (fitBounds).
 */
function MapBoundsUpdater({
  bounds,
  padding = 45,
}: {
  bounds: L.LatLngBoundsExpression | null
  padding?: number
}) {
  const map = useMap()

  useEffect(() => {
    if (!bounds) return
    try {
      map.fitBounds(bounds, {
        padding: [padding, padding],
        maxZoom: 16,
        animate: true,
      })
    } catch {
      // Ignora erro se o mapa estiver desmontando
    }
  }, [map, bounds, padding])

  return null
}

export function RouteMapView({
  rotaNome,
  paradas,
  deposito,
  caminhaoEscolaId,
  isEmRota = false,
  height = 420,
  className = '',
}: RouteMapViewProps) {
  const [, setMapReady] = useState(false)
  const [osrmResult, setOsrmResult] = useState<OsrmRouteResult | null>(null)
  const [osrmEmRotaResult, setOsrmEmRotaResult] = useState<OsrmEmRotaResult | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [osrmFailed, setOsrmFailed] = useState(false)

  // Extrair coordenadas válidas das paradas na ordem atual
  const paradasComCoord = useMemo(() => {
    const list: Array<{
      parada: ParadaMapaItem
      ordem: number
      lat: number
      lng: number
      isFirst: boolean
    }> = []

    paradas.forEach((p, idx) => {
      const coords = extrairCoordenadas(p.latitude, p.longitude)
      if (coords) {
        list.push({
          parada: p,
          ordem: p.ordem || idx + 1,
          lat: coords.latitude,
          lng: coords.longitude,
          isFirst: idx === 0,
        })
      }
    })

    return list
  }, [paradas])

  const escolasSemCoordCount = paradas.length - paradasComCoord.length

  // Parada onde o caminhão se encontra atualmente (se houver e tiver coordenadas)
  const paradaCaminhao = useMemo(() => {
    if (!caminhaoEscolaId) return null
    return paradasComCoord.find((p) => p.parada.escolaId === caminhaoEscolaId) || null
  }, [caminhaoEscolaId, paradasComCoord])

  // Coordenadas válidas do depósito
  const depositoCoords = useMemo(() => {
    const coords = extrairCoordenadas(deposito.latitude, deposito.longitude)
    if (coords) return coords
    return { latitude: -22.260264, longitude: -42.738042 }
  }, [deposito])

  // Bounds que englobam depósito + todas as paradas com coordenadas
  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    const points: [number, number][] = [[depositoCoords.latitude, depositoCoords.longitude]]

    paradasComCoord.forEach((p) => {
      points.push([p.lat, p.lng])
    })

    if (points.length === 0) return null
    return L.latLngBounds(points)
  }, [depositoCoords, paradasComCoord])

  // Índice da parada onde o caminhão está (-1 se não estiver em nenhuma com coordenada)
  const caminhaoCoordIndex = useMemo(() => {
    if (!caminhaoEscolaId) return -1
    return paradasComCoord.findIndex((p) => p.parada.escolaId === caminhaoEscolaId)
  }, [caminhaoEscolaId, paradasComCoord])

  // Se o caminhão está na última parada com coordenadas
  const isCaminhaoNaUltimaParada = useMemo(() => {
    return (
      caminhaoCoordIndex >= 0 &&
      paradasComCoord.length > 0 &&
      caminhaoCoordIndex >= paradasComCoord.length - 1
    )
  }, [caminhaoCoordIndex, paradasComCoord.length])

  // Índice da próxima parada quando EM ROTA (-1 se caminhão já estiver na última parada, pois a próxima destinação é o Retorno ao Depósito Central)
  const proximaParadaCoordIndex = useMemo(() => {
    if (paradasComCoord.length === 0) return -1
    if (caminhaoCoordIndex < 0) return 0
    if (isCaminhaoNaUltimaParada) return -1
    return caminhaoCoordIndex + 1
  }, [caminhaoCoordIndex, paradasComCoord.length, isCaminhaoNaUltimaParada])

  // Próxima parada (objeto ParadaMapaItem) - se estiver na última parada, não há próxima escola física
  const proximaParada = useMemo(() => {
    if (proximaParadaCoordIndex < 0 || proximaParadaCoordIndex >= paradasComCoord.length)
      return null
    return paradasComCoord[proximaParadaCoordIndex]
  }, [proximaParadaCoordIndex, paradasComCoord])

  // Efeito para buscar a rota por estradas reais via OSRM sempre que paradas/depósito/modo/caminhão mudarem
  useEffect(() => {
    let active = true

    if (paradasComCoord.length === 0) {
      setOsrmResult(null)
      setOsrmEmRotaResult(null)
      setLoadingRoute(false)
      setOsrmFailed(false)
      return
    }

    setLoadingRoute(true)
    setOsrmFailed(false)

    const coordsArray = paradasComCoord.map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
    }))

    if (isEmRota) {
      // Modo EM ROTA: trecho concluído, trecho em vermelho caminhão -> próxima, e retorno ao depósito
      obterRotaEstradaEmRotaOSRM(depositoCoords, coordsArray, caminhaoCoordIndex, {
        timeoutMs: 8000,
      })
        .then((res) => {
          if (!active) return
          setLoadingRoute(false)
          if (res) {
            setOsrmEmRotaResult(res)
            setOsrmResult(null)
            setOsrmFailed(false)
          } else {
            setOsrmEmRotaResult(null)
            setOsrmResult(null)
            setOsrmFailed(true)
          }
        })
        .catch(() => {
          if (!active) return
          setLoadingRoute(false)
          setOsrmEmRotaResult(null)
          setOsrmResult(null)
          setOsrmFailed(true)
        })
    } else {
      // Modo NÃO DESPACHADA: preserva comportamento 100% idêntico
      obterRotaEstradaOSRM(depositoCoords, coordsArray, { timeoutMs: 8000 })
        .then((res) => {
          if (!active) return
          setLoadingRoute(false)
          if (res) {
            setOsrmResult(res)
            setOsrmEmRotaResult(null)
            setOsrmFailed(false)
          } else {
            setOsrmResult(null)
            setOsrmEmRotaResult(null)
            setOsrmFailed(true)
          }
        })
        .catch(() => {
          if (!active) return
          setLoadingRoute(false)
          setOsrmResult(null)
          setOsrmEmRotaResult(null)
          setOsrmFailed(true)
        })
    }

    return () => {
      active = false
    }
  }, [depositoCoords, paradasComCoord, isEmRota, caminhaoCoordIndex])

  // Estimativa em linha reta (fallback e comparativo)
  const distanciaLinhaRetaKm = useMemo(() => {
    if (paradasComCoord.length === 0) return 0
    if (isEmRota) {
      // Quando EM ROTA: Depósito -> Todas paradas -> Retorno ao depósito
      const pontos = [
        depositoCoords,
        ...paradasComCoord.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        depositoCoords,
      ]
      return calcularDistanciaTotalCaminho(pontos)
    }
    // Não despachada: Depósito -> Paradas (sem retorno)
    const pontos = [
      depositoCoords,
      ...paradasComCoord.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    ]
    return calcularDistanciaTotalCaminho(pontos)
  }, [depositoCoords, paradasComCoord, isEmRota])

  // =================== LINHAS PARA MODO NÃO DESPACHADA ===================
  // Trecho 1: Depósito -> Primeira parada (se existir)
  // Se OSRM respondeu, usa o caminho da estrada; senão linha reta
  const trechoOrigem = useMemo<[number, number][] | null>(() => {
    if (isEmRota || paradasComCoord.length === 0) return null

    if (osrmResult?.trechoOrigem && osrmResult.trechoOrigem.length > 0) {
      return osrmResult.trechoOrigem
    }

    // Fallback: linha reta
    const first = paradasComCoord[0]
    return [
      [depositoCoords.latitude, depositoCoords.longitude],
      [first.lat, first.lng],
    ]
  }, [depositoCoords, paradasComCoord, osrmResult, isEmRota])

  // Trecho 2: Entre as paradas sequenciais (parada 1 -> parada 2 -> ...)
  // Se OSRM respondeu, usa as curvas reais das estradas; senão linha reta
  const trechoParadas = useMemo<[number, number][]>(() => {
    if (isEmRota || paradasComCoord.length <= 1) return []

    if (osrmResult?.trechoParadas && osrmResult.trechoParadas.length > 0) {
      return osrmResult.trechoParadas
    }

    // Fallback: linhas retas entre as paradas
    return paradasComCoord.map((p) => [p.lat, p.lng])
  }, [paradasComCoord, osrmResult, isEmRota])

  // =================== LINHAS PARA MODO EM ROTA ===================
  // 1. Trecho Concluído: Depósito Central até a parada atual do caminhão (se caminhaoCoordIndex >= 0)
  const trechoEmRotaConcluido = useMemo<[number, number][]>(() => {
    if (!isEmRota || caminhaoCoordIndex < 0 || paradasComCoord.length === 0) return []

    if (osrmEmRotaResult?.trechoConcluido && osrmEmRotaResult.trechoConcluido.length > 0) {
      return osrmEmRotaResult.trechoConcluido
    }

    // Fallback linha reta: Depósito -> paradas[0..caminhaoCoordIndex]
    const pontos: [number, number][] = [[depositoCoords.latitude, depositoCoords.longitude]]
    for (let i = 0; i <= caminhaoCoordIndex; i++) {
      pontos.push([paradasComCoord[i].lat, paradasComCoord[i].lng])
    }
    return pontos
  }, [isEmRota, caminhaoCoordIndex, paradasComCoord, osrmEmRotaResult, depositoCoords])

  // 2. Trecho em VERMELHO: Da posição do caminhão (ou Depósito se não marcado) até a PRÓXIMA parada
  // Caso o caminhão esteja na última parada, o trecho ativo é o RETORNO da última parada ao Depósito Central em VERMELHO
  const trechoEmRotaAtivoVermelho = useMemo<[number, number][]>(() => {
    if (!isEmRota || paradasComCoord.length === 0) return []

    if (osrmEmRotaResult?.trechoAtivoVermelho && osrmEmRotaResult.trechoAtivoVermelho.length > 0) {
      return osrmEmRotaResult.trechoAtivoVermelho
    }

    // Se caminhão está na última parada, o trecho ativo é Última Parada -> Depósito Central
    if (isCaminhaoNaUltimaParada) {
      const last = paradasComCoord[paradasComCoord.length - 1]
      return [
        [last.lat, last.lng],
        [depositoCoords.latitude, depositoCoords.longitude],
      ]
    }

    if (proximaParadaCoordIndex < 0) return []

    // Fallback linha reta: Caminhão (ou depósito se não marcado) -> Próxima Parada
    const startLat =
      caminhaoCoordIndex >= 0 ? paradasComCoord[caminhaoCoordIndex].lat : depositoCoords.latitude
    const startLng =
      caminhaoCoordIndex >= 0 ? paradasComCoord[caminhaoCoordIndex].lng : depositoCoords.longitude

    const prox = paradasComCoord[proximaParadaCoordIndex]
    return [
      [startLat, startLng],
      [prox.lat, prox.lng],
    ]
  }, [
    isEmRota,
    paradasComCoord,
    proximaParadaCoordIndex,
    caminhaoCoordIndex,
    isCaminhaoNaUltimaParada,
    osrmEmRotaResult,
    depositoCoords,
  ])

  // 3. Trecho Retorno ao Depósito Central: da última parada até o Depósito Central
  const trechoEmRotaRetorno = useMemo<[number, number][]>(() => {
    if (!isEmRota || paradasComCoord.length === 0) return []

    if (
      osrmEmRotaResult?.trechoRetornoDeposito &&
      osrmEmRotaResult.trechoRetornoDeposito.length > 0
    ) {
      return osrmEmRotaResult.trechoRetornoDeposito
    }

    // Fallback linha reta: Última parada -> Depósito
    const last = paradasComCoord[paradasComCoord.length - 1]
    return [
      [last.lat, last.lng],
      [depositoCoords.latitude, depositoCoords.longitude],
    ]
  }, [isEmRota, paradasComCoord, osrmEmRotaResult, depositoCoords])

  // Centro padrão inicial: ou a média das coordenadas, ou o depósito
  const defaultCenter = useMemo<[number, number]>(() => {
    if (paradasComCoord.length > 0) {
      return [paradasComCoord[0].lat, paradasComCoord[0].lng]
    }
    return [depositoCoords.latitude, depositoCoords.longitude]
  }, [depositoCoords, paradasComCoord])

  const depositoIcon = useMemo(
    () => createDepositoIcon(deposito.nome || 'Depósito Central'),
    [deposito.nome],
  )

  return (
    <div
      className={`flex flex-col rounded-lg border bg-card overflow-hidden shadow-xs ${className}`}
    >
      {/* Barra de título do mapa */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground">
            Mapa da Rota: <span className="text-primary">{rotaNome}</span>
          </span>
          <Badge variant="outline" className="text-[10px] bg-background">
            {paradasComCoord.length} de {paradas.length} parada(s) no mapa
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {isEmRota && (
            <Badge
              variant="destructive"
              className="text-[10px] uppercase font-bold tracking-wider py-0 px-1.5"
            >
              EM ROTA
            </Badge>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900 border border-sky-400"></span>
            Depósito
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-700 border border-white"></span>
            Paradas (1..N)
          </span>
          {paradaCaminhao && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
              <span className="inline-block">🚚</span>
              Caminhão na Parada #{paradaCaminhao.ordem}
            </span>
          )}
          {isEmRota &&
            (isCaminhaoNaUltimaParada ? (
              <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                Retorno ao Depósito
              </span>
            ) : proximaParada ? (
              <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                Próxima: #{proximaParada.ordem}
              </span>
            ) : null)}
        </div>
      </div>

      {/* Container do Mapa Leaflet */}
      <div
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        className="w-full relative z-0"
      >
        <MapContainer
          center={defaultCenter}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          {/* Ajusta enquadramento dinamicamente */}
          <MapBoundsUpdater bounds={bounds} />
          {/* Marcador do Depósito Central */}
          <Marker
            position={[depositoCoords.latitude, depositoCoords.longitude]}
            icon={depositoIcon}
          >
            <Popup>
              <div className="text-xs p-1 space-y-1 min-w-[180px]">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Warehouse className="h-4 w-4 text-sky-600" />
                  <span>{deposito.nome || 'Depósito Central'}</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Ponto de partida oficial da cooperativa e retorno final da rota.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-0.5">
                  {depositoCoords.latitude.toFixed(6)}, {depositoCoords.longitude.toFixed(6)}
                </div>
              </div>
            </Popup>
          </Marker>
          {/* Marcadores das Paradas numeradas (todas visíveis) */}
          {paradasComCoord.map((item) => {
            const p = item.parada
            const isProx = isEmRota && proximaParada?.parada.escolaId === p.escolaId
            const icon = createNumberedStopIcon(item.ordem, item.isFirst)

            return (
              <Marker key={p.escolaId} position={[item.lat, item.lng]} icon={icon}>
                <Popup>
                  <div className="text-xs p-1 space-y-1.5 min-w-[210px] max-w-[280px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white shrink-0">
                          {item.ordem}
                        </span>
                        <span className="font-bold text-slate-900 leading-tight">{p.nome}</span>
                      </div>
                      {isProx && (
                        <Badge variant="destructive" className="text-[9px] py-0 px-1">
                          Próxima Parada
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 items-center">
                      {p.contratoNumero ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          Contrato: {p.contratoNumero}
                        </span>
                      ) : null}
                      {p.alunos ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700">
                          {p.alunos} alunos
                        </span>
                      ) : null}
                      {p.pedidosCount !== undefined ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700">
                          {p.pedidosCount} pedido(s)
                        </span>
                      ) : null}
                    </div>

                    {p.endereco ? (
                      <p className="text-[11px] text-slate-600 leading-snug">{p.endereco}</p>
                    ) : null}

                    <div className="text-[10px] font-mono text-slate-400 pt-0.5 border-t border-slate-100">
                      Parada #{item.ordem} • {item.lat.toFixed(6)}, {item.lng.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
          {/* Marcador destacado de CAMINHÃO MANUAL sobre a parada indicada */}
          {paradaCaminhao && (
            <Marker
              position={[paradaCaminhao.lat, paradaCaminhao.lng]}
              icon={createTruckMarkerIcon(paradaCaminhao.ordem)}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="text-xs p-1 space-y-1.5 min-w-[210px] max-w-[280px]">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚚</span>
                    <div>
                      <div className="font-bold text-amber-800 dark:text-amber-300">
                        Caminhão de Entrega Aqui Agora
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Posição manual na Parada #{paradaCaminhao.ordem}
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {paradaCaminhao.parada.nome}
                    </p>
                    {paradaCaminhao.parada.endereco && (
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                        {paradaCaminhao.parada.endereco}
                      </p>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Marcado manualmente pelo operador da cooperativa.
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
          {/* ================= DESENHO DE LINHAS: ROTA NÃO DESPACHADA ================= */}
          {!isEmRota && trechoOrigem && (
            <Polyline
              positions={trechoOrigem}
              pathOptions={{
                color: '#0284c7', // sky blue
                weight: 3.5,
                opacity: 0.85,
                dashArray: '8, 8',
              }}
            />
          )}
          {!isEmRota && trechoParadas.length > 1 && (
            <Polyline
              positions={trechoParadas}
              pathOptions={{
                color: '#047857', // emerald-700
                weight: 4,
                opacity: 0.9,
              }}
            />
          )}
          {/* ================= DESENHO DE LINHAS: ROTA EM ROTA ================= */}
          {/* 1. Trecho Concluído: Depósito Central até a posição do caminhão (verde contínuo) */}
          {isEmRota && trechoEmRotaConcluido.length > 1 && (
            <Polyline
              positions={trechoEmRotaConcluido}
              pathOptions={{
                color: '#059669', // emerald-600
                weight: 3.5,
                opacity: 0.75,
              }}
            />
          )}
          {/* 2. Trecho em VERMELHO: do caminhão até a próxima parada (OSRM e fallback em linha reta) */}
          {isEmRota && trechoEmRotaAtivoVermelho.length > 1 && (
            <Polyline
              positions={trechoEmRotaAtivoVermelho}
              pathOptions={{
                color: '#dc2626',
                weight: 6,
                opacity: 0.95,
                dashArray: undefined,
              }}
            />
          )}
          {/* 3. Trecho de Retorno ao Depósito Central: da última parada ao depósito (azul tracejado #0284c7, dash '6, 6') */}
          {/* Quando o caminhão está na última parada, o trecho ativo vermelho já cobre esse trecho; não duplicamos */}
          {isEmRota && !isCaminhaoNaUltimaParada && trechoEmRotaRetorno.length > 1 && (
            <Polyline
              positions={trechoEmRotaRetorno}
              pathOptions={{
                color: '#0284c7', // sky blue
                weight: 3,
                opacity: 0.8,
                dashArray: '6, 6',
              }}
            />
          )}{' '}
        </MapContainer>

        {/* Legenda flutuante sobre o mapa */}
        <div className="absolute bottom-2 right-2 z-[400] bg-background/95 backdrop-blur-xs border border-border/80 rounded-md p-2 text-[10px] shadow-md space-y-1 pointer-events-auto max-w-[245px]">
          <div className="font-semibold text-foreground flex items-center justify-between gap-1">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3 text-primary" /> Legenda do Trajeto
            </span>
            {(isEmRota ? osrmEmRotaResult : osrmResult) ? (
              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                Pela estrada
              </span>
            ) : osrmFailed ? (
              <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium">
                Linha reta
              </span>
            ) : null}
          </div>

          {/* Itens da Legenda conforme modo */}
          {isEmRota ? (
            <>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-5 h-1 bg-emerald-600 inline-block rounded-xs shrink-0"></span>
                <span>
                  Percurso Concluído
                  {caminhaoCoordIndex >= 0 ? ` (Depósito → #${caminhaoCoordIndex + 1})` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold">
                <span className="w-5 h-1.5 bg-red-600 inline-block rounded-xs shrink-0 shadow-xs"></span>
                <span>
                  Trecho Ativo em Progresso
                  {isCaminhaoNaUltimaParada
                    ? ' (Retorno ao Depósito)'
                    : ` (${caminhaoCoordIndex >= 0 ? `Caminhão #${caminhaoCoordIndex + 1}` : 'Depósito'} → Próxima #${proximaParada?.ordem ?? proximaParadaCoordIndex + 1})`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-sky-600 inline-block shrink-0"></span>
                <span>Retorno ao Depósito</span>
              </div>{' '}
              {osrmEmRotaResult && (
                <div className="pt-1 border-t border-border/60 space-y-0.5 text-[9px] text-muted-foreground">
                  <div className="flex items-center justify-between font-medium text-foreground">
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <Navigation className="h-2.5 w-2.5" />
                      Trecho Ativo:
                    </span>
                    <span>{osrmEmRotaResult.distanciaAtivaKm.toFixed(1).replace('.', ',')} km</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Circuito total:</span>
                    <span>
                      {osrmEmRotaResult.distanciaTotalPercursoKm.toFixed(1).replace('.', ',')} km
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Restante da rota:</span>
                    <span className="font-semibold text-foreground">
                      {osrmEmRotaResult.distanciaRestanteKm.toFixed(1).replace('.', ',')} km
                      {osrmEmRotaResult.duracaoRestanteMinutos > 0 &&
                        ` (~${osrmEmRotaResult.duracaoRestanteMinutos} min)`}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-sky-600 inline-block shrink-0"></span>
                <span>Saída do Depósito Central</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-5 h-1 bg-emerald-700 inline-block rounded-xs shrink-0"></span>
                <span>Sequência de Entrega (1 → {paradasComCoord.length})</span>
              </div>
              {paradaCaminhao && (
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium">
                  <span className="inline-block text-xs">🚚</span>
                  <span>Caminhão: Parada #{paradaCaminhao.ordem}</span>
                </div>
              )}
              {osrmResult && (
                <div className="pt-1 border-t border-border/60 flex items-center justify-between text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-1 text-foreground font-medium">
                    <Navigation className="h-2.5 w-2.5 text-emerald-600" />
                    Estrada: {osrmResult.distanciaTotalKm.toFixed(1).replace('.', ',')} km
                  </span>
                  {osrmResult.duracaoEstimadaMinutos > 0 && (
                    <span>~{osrmResult.duracaoEstimadaMinutos} min</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Rodapé informativo discreto */}
      <div className="px-3 py-2 bg-muted/20 border-t flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-[11px]">
          <span className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              {isEmRota
                ? 'Em rota: traçado em vermelho destaca o trecho ativo do caminhão até a próxima parada com retorno ao Depósito Central.'
                : 'Os números nos pinos refletem a ordem atual de entrega. Reordene arrastando na lista ao lado.'}
            </span>
          </span>

          {loadingRoute && (
            <span className="inline-flex items-center gap-1 text-primary text-[10px] bg-primary/10 px-2 py-0.5 rounded-full font-medium">
              <Loader2 className="h-3 w-3 animate-spin" />
              Calculando percurso rodoviário...
            </span>
          )}

          {/* Rodapé de Distâncias para Modo EM ROTA */}
          {isEmRota && osrmEmRotaResult && !loadingRoute && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 text-[10px] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full font-semibold">
                <Navigation className="h-3 w-3" />
                Trecho até Próxima Parada:{' '}
                <strong>{osrmEmRotaResult.distanciaAtivaKm.toFixed(1).replace('.', ',')} km</strong>
              </span>

              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[10px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-medium">
                Percurso real com retorno:{' '}
                <strong>
                  {osrmEmRotaResult.distanciaTotalPercursoKm.toFixed(1).replace('.', ',')} km
                </strong>
                {osrmEmRotaResult.duracaoEstimadaMinutos > 0 &&
                  ` (~${osrmEmRotaResult.duracaoEstimadaMinutos} min total)`}
              </span>

              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full font-medium">
                Restante até retornar:{' '}
                <strong>
                  {osrmEmRotaResult.distanciaRestanteKm.toFixed(1).replace('.', ',')} km
                </strong>
                {osrmEmRotaResult.duracaoRestanteMinutos > 0 &&
                  ` (~${osrmEmRotaResult.duracaoRestanteMinutos} min)`}
              </span>
            </div>
          )}

          {/* Rodapé de Distâncias para Modo NÃO DESPACHADA */}
          {!isEmRota && osrmResult && !loadingRoute && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[10px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-medium">
              <Navigation className="h-3 w-3" />
              Percurso real por estradas:{' '}
              <strong>{osrmResult.distanciaTotalKm.toFixed(1).replace('.', ',')} km</strong>
              {osrmResult.duracaoEstimadaMinutos > 0 &&
                ` (~${osrmResult.duracaoEstimadaMinutos} min de viagem)`}
            </span>
          )}

          {osrmFailed && !loadingRoute && distanciaLinhaRetaKm > 0 && (
            <span
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full"
              title="O serviço OSRM não respondeu a tempo; o mapa exibe as linhas retas estimadas para manter a operação"
            >
              Percurso por estrada indisponível no momento (exibindo linha reta: ~
              {distanciaLinhaRetaKm.toFixed(1).replace('.', ',')} km)
            </span>
          )}
        </div>

        {escolasSemCoordCount > 0 && (
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium text-[11px]">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>
              {escolasSemCoordCount} parada(s) sem coordenadas cadastradas não aparecem no mapa
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
