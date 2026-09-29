import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { extrairCoordenadas } from '@/lib/routeOptimization'
import { MapPin, Building2, Warehouse, AlertTriangle, ZoomIn, Layers, Info } from 'lucide-react'

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
  height = 420,
  className = '',
}: RouteMapViewProps) {
  const [mapReady, setMapReady] = useState(false)

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

  // Trecho 1: Depósito -> Primeira parada (se existir) — desenhado tracejado
  const trechoOrigem = useMemo<[number, number][] | null>(() => {
    if (paradasComCoord.length === 0) return null
    const first = paradasComCoord[0]
    return [
      [depositoCoords.latitude, depositoCoords.longitude],
      [first.lat, first.lng],
    ]
  }, [depositoCoords, paradasComCoord])

  // Trecho 2: Entre as paradas sequenciais (parada 1 -> parada 2 -> ...) — linha contínua
  const trechoParadas = useMemo<[number, number][]>(() => {
    if (paradasComCoord.length <= 1) return []
    return paradasComCoord.map((p) => [p.lat, p.lng])
  }, [paradasComCoord])

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
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900 border border-sky-400"></span>
            Depósito
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-700 border border-white"></span>
            Paradas (1..N)
          </span>
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
                  Ponto de partida oficial da cooperativa para esta rota de entrega.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-0.5">
                  {depositoCoords.latitude.toFixed(6)}, {depositoCoords.longitude.toFixed(6)}
                </div>
              </div>
            </Popup>
          </Marker>

          {/* Marcadores das Paradas numeradas */}
          {paradasComCoord.map((item) => {
            const p = item.parada
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

          {/* Trecho 1: Depósito -> Primeira parada (Tracejado) */}
          {trechoOrigem && (
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

          {/* Trecho 2: Parada 1 -> Parada 2 -> ... (Linha contínua) */}
          {trechoParadas.length > 1 && (
            <Polyline
              positions={trechoParadas}
              pathOptions={{
                color: '#047857', // emerald-700
                weight: 4,
                opacity: 0.9,
              }}
            />
          )}
        </MapContainer>

        {/* Legenda flutuante sobre o mapa */}
        <div className="absolute bottom-2 right-2 z-[400] bg-background/95 backdrop-blur-xs border border-border/80 rounded-md p-2 text-[10px] shadow-md space-y-1 pointer-events-auto">
          <div className="font-semibold text-foreground flex items-center gap-1">
            <Layers className="h-3 w-3 text-primary" /> Legenda do Trajeto
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-5 h-0.5 border-t-2 border-dashed border-sky-600 inline-block"></span>
            <span>Saída do Depósito Central</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-5 h-1 bg-emerald-700 inline-block rounded-xs"></span>
            <span>Sequência de Entrega (1 → {paradasComCoord.length})</span>
          </div>
        </div>
      </div>

      {/* Rodapé informativo discreto */}
      <div className="px-3 py-2 bg-muted/20 border-t flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
          <Info className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>
            Os números nos pinos refletem a ordem atual de entrega. Reordene arrastando na lista ao
            lado.
          </span>
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
