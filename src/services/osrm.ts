/**
 * Serviço de Roteamento Rodoviário via OSRM (Open Source Routing Machine).
 *
 * Utiliza o endpoint público e aberto do OpenStreetMap:
 * https://router.project-osrm.org/route/v1/driving/{lon},{lat};{lon},{lat}...
 *
 * Características:
 * - Sem chave de API ou custo.
 * - Cache em memória (Map por sessão) para evitar requisições idênticas repetidas.
 * - Timeout configurável (padrão 8 segundos) com AbortController.
 * - Retorna coordenadas [latitude, longitude] prontas para uso no Leaflet ([lat, lng]).
 * - Retorna distância real percorrida por estradas em metros / quilômetros e duração estimada.
 * - Suporta divisão entre trecho de saída do depósito (trecho 1) e trecho entre paradas (trecho 2),
 *   ou rota unificada.
 */

export interface LatLngCoord {
  latitude: number
  longitude: number
}

export interface OsrmRouteSegment {
  coordinates: [number, number][] // [lat, lng] formatado para Leaflet
  distanceMeters: number
  durationSeconds: number
}

export interface OsrmRouteResult {
  trechoOrigem: [number, number][] | null // Depósito -> 1ª parada por estrada
  trechoParadas: [number, number][] // 1ª parada -> 2ª -> ... N por estrada
  rotaCompleta: [number, number][] // Todos os pontos contínuos por estrada
  distanciaTotalKm: number // Distância real da rota completa por estrada
  distanciaOrigemKm: number // Distância real do trecho Depósito -> 1ª parada
  distanciaParadasKm: number // Distância real entre paradas
  duracaoEstimadaMinutos: number // Duração total estimada em minutos
  viaEstrada: true
}

// Cache em memória persistente durante a sessão do navegador
const routeCache = new Map<string, OsrmRouteResult>()

/**
 * Gera chave de cache determinística com 5 casas decimais (~1 metro de precisão).
 */
function buildCacheKey(pontos: LatLngCoord[]): string {
  return pontos.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(';')
}

/**
 * Consulta a rota OSRM para uma sequência de pontos [lon, lat].
 * OSRM espera {lon},{lat};{lon},{lat}...
 * Retorna geometria GeoJSON com coordenadas [lon, lat], que são invertidas para [lat, lng].
 */
async function fetchOsrmDrivingRoute(
  pontos: LatLngCoord[],
  timeoutMs = 8000,
): Promise<{
  coordinates: [number, number][] // [lat, lng]
  distanceMeters: number
  durationSeconds: number
} | null> {
  if (pontos.length < 2) return null

  // Montar URL: /route/v1/driving/{lon},{lat};{lon},{lat}?overview=full&geometries=geojson
  const coordsStr = pontos
    .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';')

  const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      return null
    }

    const data = await res.json()
    if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      return null
    }

    const route = data.routes[0]
    const geojsonCoords: [number, number][] = route.geometry?.coordinates || []
    if (geojsonCoords.length === 0) return null

    // GeoJSON retorna [lon, lat]. Inverter para [lat, lng] exigido pelo Leaflet
    const leafletCoords: [number, number][] = geojsonCoords.map(([lon, lat]) => [lat, lon])

    return {
      coordinates: leafletCoords,
      distanceMeters: Number(route.distance) || 0,
      durationSeconds: Number(route.duration) || 0,
    }
  } catch {
    // Timeout, falha de rede, abort, etc.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Obtém o traçado completo da rota por estradas reais via OSRM.
 *
 * Divide o trajeto de forma coerente com o design visual do SIGCAF:
 * - Trecho 1: Depósito -> Primeira parada (para traçado em linha tracejada por estrada)
 * - Trecho 2: Parada 1 -> Parada 2 -> ... -> Parada N (para traçado contínuo por estrada)
 *
 * Caso a rota tenha apenas o depósito e 1 parada, o trecho 1 cobre todo o percurso.
 * Caso a consulta OSRM falhe ou dê timeout, retorna null para acionar o fallback imediato.
 */
export async function obterRotaEstradaOSRM(
  deposito: LatLngCoord,
  paradas: LatLngCoord[],
  options?: { timeoutMs?: number },
): Promise<OsrmRouteResult | null> {
  if (paradas.length === 0) return null

  const pontosCompletos: LatLngCoord[] = [deposito, ...paradas]
  const cacheKey = buildCacheKey(pontosCompletos)

  const cached = routeCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const timeoutMs = options?.timeoutMs ?? 8000

  // Se houver apenas 1 parada: Depósito -> Parada 1
  if (paradas.length === 1) {
    const result = await fetchOsrmDrivingRoute(pontosCompletos, timeoutMs)
    if (!result) return null

    const distKm = result.distanceMeters / 1000
    const routeResult: OsrmRouteResult = {
      trechoOrigem: result.coordinates,
      trechoParadas: [],
      rotaCompleta: result.coordinates,
      distanciaTotalKm: distKm,
      distanciaOrigemKm: distKm,
      distanciaParadasKm: 0,
      duracaoEstimadaMinutos: Math.round(result.durationSeconds / 60),
      viaEstrada: true,
    }

    routeCache.set(cacheKey, routeResult)
    return routeResult
  }

  // Com 2 ou mais paradas:
  // Fazemos a chamada da rota completa (Depósito -> P1 -> P2 -> ... -> Pn)
  // E também o trecho do depósito -> P1 para desenhar a saída tracejada distintiva,
  // ou chamamos simultaneamente:
  //   1) Depósito -> P1
  //   2) P1 -> P2 -> ... -> Pn
  // Isso nos dá a geometria exata separada para cada estilo visual (tracejado na saída do depósito,
  // contínuo nas paradas) com precisão máxima!
  try {
    const [origemSegment, paradasSegment] = await Promise.all([
      fetchOsrmDrivingRoute([deposito, paradas[0]], timeoutMs),
      fetchOsrmDrivingRoute(paradas, timeoutMs),
    ])

    // Se ambos os trechos responderam com sucesso
    if (origemSegment && paradasSegment) {
      const distOrigemKm = origemSegment.distanceMeters / 1000
      const distParadasKm = paradasSegment.distanceMeters / 1000
      const distTotalKm = distOrigemKm + distParadasKm
      const duracaoMin = Math.round(
        (origemSegment.durationSeconds + paradasSegment.durationSeconds) / 60,
      )

      const routeResult: OsrmRouteResult = {
        trechoOrigem: origemSegment.coordinates,
        trechoParadas: paradasSegment.coordinates,
        rotaCompleta: [...origemSegment.coordinates, ...paradasSegment.coordinates],
        distanciaTotalKm: distTotalKm,
        distanciaOrigemKm: distOrigemKm,
        distanciaParadasKm: distParadasKm,
        duracaoEstimadaMinutos: duracaoMin,
        viaEstrada: true,
      }

      routeCache.set(cacheKey, routeResult)
      return routeResult
    }

    // Se o fracionamento falhou, tentar obter a rota unificada inteira
    const fullRoute = await fetchOsrmDrivingRoute(pontosCompletos, timeoutMs)
    if (!fullRoute) return null

    const distTotalKm = fullRoute.distanceMeters / 1000
    const duracaoMin = Math.round(fullRoute.durationSeconds / 60)

    const routeResult: OsrmRouteResult = {
      trechoOrigem: null,
      trechoParadas: fullRoute.coordinates,
      rotaCompleta: fullRoute.coordinates,
      distanciaTotalKm: distTotalKm,
      distanciaOrigemKm: 0,
      distanciaParadasKm: distTotalKm,
      duracaoEstimadaMinutos: duracaoMin,
      viaEstrada: true,
    }

    routeCache.set(cacheKey, routeResult)
    return routeResult
  } catch {
    return null
  }
}

/**
 * Limpa o cache de rotas (útil em testes ou reload).
 */
export function limparCacheRotasOSRM(): void {
  routeCache.clear()
}
