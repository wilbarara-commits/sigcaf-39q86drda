import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { LatLngCoord, obterTrechoDiretoOSRM } from '@/services/osrm'
import { calcularDistanciaHaversineKm } from '@/lib/routeOptimization'
import { Warehouse, MapPin, Navigation, ExternalLink, Loader2, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface MotoristaTrechoMapaProps {
  origem: {
    latitude: number
    longitude: number
    tipo: 'deposito' | 'motorista'
    nome: string
  }
  destino: {
    latitude: number
    longitude: number
    nome: string
    ordem?: number
    endereco?: string
  }
  todasParadas?: Array<{
    latitude?: number | null
    longitude?: number | null
    nome: string
    ordem: number
    entregue: boolean
  }>
  onAlternarOrigem?: () => void
  podeAlternarOrigem?: boolean
  googleMapsUrl: string
}

function createOrigemIcon(tipo: 'deposito' | 'motorista') {
  const isDeposito = tipo === 'deposito'
  const bg = isDeposito ? '#0f172a' : '#2563eb'
  const border = isDeposito ? '#38bdf8' : '#60a5fa'
  const iconEmoji = isDeposito ? '🏛️' : '📍'

  return L.divIcon({
    className: 'custom-origem-marker',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 9999px;
        background-color: ${bg};
        color: #ffffff;
        border: 2.5px solid ${border};
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        font-size: 16px;
        cursor: pointer;
      ">
        ${iconEmoji}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  })
}

function createDestinoIcon(ordem?: number) {
  return L.divIcon({
    className: 'custom-proxima-marker',
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
      ">
        <span style="
          position: absolute;
          width: 42px;
          height: 42px;
          border-radius: 9999px;
          background-color: rgba(220, 38, 38, 0.4);
          animation: truck-pulse 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        "></span>
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 9999px;
          background-color: #dc2626;
          color: #ffffff;
          border: 2.5px solid #ffffff;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.6);
          font-weight: 800;
          font-size: ${ordem && ordem >= 100 ? '11px' : '13px'};
          font-family: ui-sans-serif, system-ui, sans-serif;
        ">
          ${ordem ? `#${ordem}` : '★'}
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  })
}

function createOutraParadaIcon(ordem: number, entregue: boolean) {
  const bg = entregue ? '#10b981' : '#64748b'
  const opacity = entregue ? 0.7 : 0.6
  return L.divIcon({
    className: 'custom-outra-marker',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 9999px;
        background-color: ${bg};
        color: #ffffff;
        border: 1.5px solid #ffffff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.25);
        font-weight: 700;
        font-size: 10px;
        opacity: ${opacity};
      ">
        ${ordem}
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  })
}

function MapBoundsUpdater({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    try {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true })
    } catch {
      /* ignore */
    }
  }, [map, bounds])
  return null
}

export const MotoristaTrechoMapa: React.FC<MotoristaTrechoMapaProps> = ({
  origem,
  destino,
  todasParadas = [],
  onAlternarOrigem,
  podeAlternarOrigem = false,
  googleMapsUrl,
}) => {
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null)
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null)
  const [duracaoMin, setDuracaoMin] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [isOsrmSuccess, setIsOsrmSuccess] = useState(false)

  const origemCoord: LatLngCoord = useMemo(
    () => ({ latitude: origem.latitude, longitude: origem.longitude }),
    [origem.latitude, origem.longitude],
  )
  const destinoCoord: LatLngCoord = useMemo(
    () => ({ latitude: destino.latitude, longitude: destino.longitude }),
    [destino.latitude, destino.longitude],
  )

  useEffect(() => {
    let active = true
    setLoading(true)

    obterTrechoDiretoOSRM(origemCoord, destinoCoord, { timeoutMs: 8000 })
      .then((res) => {
        if (!active) return
        setLoading(false)
        if (res) {
          setRouteCoords(res.coordinates)
          setDistanciaKm(res.distanciaKm)
          setDuracaoMin(res.duracaoMinutos)
          setIsOsrmSuccess(true)
        } else {
          // Fallback gracioso: traçado em linha reta
          setRouteCoords([
            [origemCoord.latitude, origemCoord.longitude],
            [destinoCoord.latitude, destinoCoord.longitude],
          ])
          const dReta = calcularDistanciaHaversineKm(
            origemCoord.latitude,
            origemCoord.longitude,
            destinoCoord.latitude,
            destinoCoord.longitude,
          )
          setDistanciaKm(dReta)
          setDuracaoMin(null)
          setIsOsrmSuccess(false)
        }
      })
      .catch(() => {
        if (!active) return
        setLoading(false)
        setRouteCoords([
          [origemCoord.latitude, origemCoord.longitude],
          [destinoCoord.latitude, destinoCoord.longitude],
        ])
        const dReta = calcularDistanciaHaversineKm(
          origemCoord.latitude,
          origemCoord.longitude,
          destinoCoord.latitude,
          destinoCoord.longitude,
        )
        setDistanciaKm(dReta)
        setDuracaoMin(null)
        setIsOsrmSuccess(false)
      })

    return () => {
      active = false
    }
  }, [origemCoord, destinoCoord])

  const bounds = useMemo<L.LatLngBoundsExpression>(() => {
    return L.latLngBounds([
      [origem.latitude, origem.longitude],
      [destino.latitude, destino.longitude],
    ])
  }, [origem.latitude, origem.longitude, destino.latitude, destino.longitude])

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
      {/* Barra de controle e resumo do trecho atual */}
      <div className="p-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-red-600 hover:bg-red-600 text-white text-[11px] px-2 py-0.5 font-bold gap-1">
            <Navigation className="h-3.5 w-3.5" />
            Próxima Entrega
            {destino.ordem ? ` (#${destino.ordem})` : ''}
          </Badge>
          <span className="font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-[280px]">
            {destino.nome}
          </span>
        </div>

        {/* Alternador de Origem (Do depósito vs Da minha localização) */}
        {podeAlternarOrigem && onAlternarOrigem && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAlternarOrigem}
            className="h-7 text-[11px] bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white gap-1"
          >
            <Compass className="h-3 w-3 text-sky-400" />
            <span>Origem: {origem.tipo === 'deposito' ? 'Depósito' : 'GPS Atual'}</span>
          </Button>
        )}
      </div>

      {/* Caixa de Métricas do Trecho (Distância e Previsão) */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border-b flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-[11px]">De:</span>
            <strong className="text-foreground flex items-center gap-1">
              {origem.tipo === 'deposito' ? (
                <Warehouse className="h-3.5 w-3.5 text-sky-600" />
              ) : (
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
              )}
              {origem.nome}
            </strong>
          </div>

          <div className="flex items-center gap-1.5">
            {loading ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Calculando rota...
              </span>
            ) : (
              <>
                {distanciaKm !== null && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-foreground bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    {distanciaKm.toFixed(1).replace('.', ',')} km
                    {isOsrmSuccess ? '' : ' (linha reta)'}
                  </span>
                )}
                {duracaoMin !== null && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                    ⏱️ Chegada em ~{duracaoMin} min
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Botão de navegação Google Maps com trânsito real no celular */}
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Navegar no Google Maps</span>
            <ExternalLink className="h-3 w-3 opacity-80" />
          </a>
        )}
      </div>

      {/* Mapa do Leaflet */}
      <div style={{ height: '280px' }} className="w-full relative z-0">
        <MapContainer
          center={[origem.latitude, origem.longitude]}
          zoom={12}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <MapBoundsUpdater bounds={bounds} />

          {/* Marcador de Origem */}
          <Marker
            position={[origem.latitude, origem.longitude]}
            icon={createOrigemIcon(origem.tipo)}
          >
            <Popup>
              <div className="text-xs p-1">
                <strong>Origem: {origem.nome}</strong>
                <p className="text-[10px] text-muted-foreground">Ponto de partida do trecho</p>
              </div>
            </Popup>
          </Marker>

          {/* Marcador de Destino (Próxima parada ativa) */}
          <Marker
            position={[destino.latitude, destino.longitude]}
            icon={createDestinoIcon(destino.ordem)}
          >
            <Popup>
              <div className="text-xs p-1 space-y-1">
                <strong className="text-red-700">Próxima Parada #{destino.ordem}</strong>
                <p className="font-semibold text-slate-900">{destino.nome}</p>
                {destino.endereco && (
                  <p className="text-[10px] text-muted-foreground">{destino.endereco}</p>
                )}
              </div>
            </Popup>
          </Marker>

          {/* Outras paradas secundárias discretas */}
          {todasParadas
            .filter((p) => p.latitude && p.longitude && p.nome !== destino.nome)
            .map((p) => (
              <Marker
                key={`parada-${p.ordem}`}
                position={[p.latitude!, p.longitude!]}
                icon={createOutraParadaIcon(p.ordem, p.entregue)}
              >
                <Popup>
                  <div className="text-xs p-1">
                    <span>
                      Parada #{p.ordem} — {p.nome}
                    </span>
                    {p.entregue && (
                      <p className="text-[10px] text-emerald-600 font-bold">Já entregue</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* Linha da Rota do Trecho */}
          {routeCoords && routeCoords.length > 1 && (
            <Polyline
              positions={routeCoords}
              pathOptions={{
                color: '#dc2626',
                weight: 5,
                opacity: 0.9,
                dashArray: isOsrmSuccess ? undefined : '6, 6',
              }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
