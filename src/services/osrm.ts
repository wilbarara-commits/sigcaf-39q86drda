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

export interface OsrmEmRotaResult {
  // Trechos geométricos [lat, lng]
  trechoConcluido: [number, number][] // Depósito -> paradas anteriores até a posição do caminhão
  trechoAtivoVermelho: [number, number][] // Caminhão -> Próxima parada (destaque VERMELHO)
  trechoRetornoDeposito: [number, number][] // Última parada -> Depósito Central
  // Distâncias em km
  distanciaConcluidaKm: number
  distanciaAtivaKm: number
  distanciaRetornoKm: number
  distanciaTotalPercursoKm: number // Todo o circuito: depósito -> paradas -> retorno ao depósito
  distanciaRestanteKm: number // trechoAtivo + trechos intermediários (se houver) + retorno
  // Durações
  duracaoEstimadaMinutos: number
  duracaoRestanteMinutos: number
  proximaParadaIndex: number // 0-based nas paradasComCoord
  caminhaoParadaIndex: number // -1 se o caminhão não foi localizado nas coordenadas
  viaEstrada: true
}

// Cache em memória persistente durante a sessão do navegador
const routeCache = new Map<string, OsrmRouteResult>()
const routeEmRotaCache = new Map<string, OsrmEmRotaResult>()

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
/**
 * Obtém o traçado e métricas detalhadas para o modo "EM ROTA" via estradas reais (OSRM).
 *
 * Cenário operacional:
 * - Origem da rota: Depósito Central.
 * - Destino final: Retorno ao Depósito Central (após a última parada).
 * - Posição do caminhão: parada atual (ou partida se não marcada).
 * - Próxima parada: a parada subsequente à do caminhão (se não marcada, a 1ª parada).
 * - Trecho em VERMELHO: percurso do caminhão até a próxima parada.
 * - Trecho concluído: depósito até a posição atual do caminhão (verde contínuo / neutro).
 * - Trecho de retorno: última parada de volta ao Depósito Central.
 * - Trechos após a próxima: ocultos/atenuados conforme especificado ("o mapa só mostra a rota entre o caminhão e a próxima parada").
 */
export async function obterRotaEstradaEmRotaOSRM(
  deposito: LatLngCoord,
  paradas: LatLngCoord[],
  caminhaoIndex: number, // -1 se não definido, ou índice 0..paradas.length-1
  options?: { timeoutMs?: number },
): Promise<OsrmEmRotaResult | null> {
  if (paradas.length === 0) return null

  const timeoutMs = options?.timeoutMs ?? 8000
  // Índice da próxima parada: se caminhaoIndex < 0 => 0; se caminhão na última parada => -1 (trecho ativo passa a ser o retorno ao depósito); senão caminhaoIndex + 1
  const isUltimaParada = caminhaoIndex >= 0 && caminhaoIndex >= paradas.length - 1
  const proximaIndex = caminhaoIndex < 0 ? 0 : isUltimaParada ? -1 : caminhaoIndex + 1

  // Chave de cache inclui depósito, todas as paradas e os índices
  const cacheKey = `em-rota:${caminhaoIndex}:${proximaIndex};${buildCacheKey([deposito, ...paradas])}`
  const cached = routeEmRotaCache.get(cacheKey)
  if (cached) {
    return cached
  }

  try {
    // 1. Ponto de partida do caminhão
    const pontoCaminhao: LatLngCoord =
      caminhaoIndex >= 0 && caminhaoIndex < paradas.length ? paradas[caminhaoIndex] : deposito

    // 2. Próxima parada (se isUltimaParada, a próxima destinação é o Depósito Central)
    const pontoProxima: LatLngCoord = isUltimaParada ? deposito : paradas[proximaIndex]

    // 3. Última parada
    const pontoUltima: LatLngCoord = paradas[paradas.length - 1]

    // Promessas a executar em paralelo:
    // A) Trecho concluído (se caminhaoIndex >= 0): Depósito -> Paradas[0..caminhaoIndex]
    const pontosConcluidos: LatLngCoord[] =
      caminhaoIndex >= 0 ? [deposito, ...paradas.slice(0, caminhaoIndex + 1)] : []

    const promisseConcluido =
      pontosConcluidos.length >= 2
        ? fetchOsrmDrivingRoute(pontosConcluidos, timeoutMs)
        : Promise.resolve(null)

    // B) Trecho Ativo em VERMELHO (apenas antes da última parada: caminhão -> próxima parada)
    // Se está na última parada, não há trecho ativo vermelho (o retorno é verde)
    const promisseAtivo = !isUltimaParada
      ? fetchOsrmDrivingRoute([pontoCaminhao, pontoProxima], timeoutMs)
      : Promise.resolve(null)

    // C) Trecho de Retorno: da Última parada de volta ao Depósito Central
    // (Quando na última parada, este trecho representa o retorno em verde pelas estradas)
    const promisseRetorno = fetchOsrmDrivingRoute([pontoUltima, deposito], timeoutMs)

    // D) Trecho restante intermediário (se houver paradas entre a próxima e a última):
    // Próxima -> ... -> Última
    const pontosRestantesIntermediarios: LatLngCoord[] =
      !isUltimaParada && proximaIndex >= 0 && proximaIndex < paradas.length - 1
        ? paradas.slice(proximaIndex)
        : []

    const promisseRestanteIntermediario =
      pontosRestantesIntermediarios.length >= 2
        ? fetchOsrmDrivingRoute(pontosRestantesIntermediarios, timeoutMs)
        : Promise.resolve(null)

    const [resConcluido, resAtivo, resRetorno, resIntermediario] = await Promise.all([
      promisseConcluido,
      promisseAtivo,
      promisseRetorno,
      promisseRestanteIntermediario,
    ])

    // Se o trecho ativo ou o retorno falharem completamente, podemos tentar buscar a rota completa
    // mas se resAtivo for nulo, fallback
    const coordsConcluido = resConcluido?.coordinates || []
    const distConcluidoKm = (resConcluido?.distanceMeters || 0) / 1000
    const durConcluidoSec = resConcluido?.durationSeconds || 0

    const coordsAtivo = isUltimaParada
      ? []
      : resAtivo?.coordinates || [
          [pontoCaminhao.latitude, pontoCaminhao.longitude],
          [pontoProxima.latitude, pontoProxima.longitude],
        ]
    const distAtivoKm = isUltimaParada ? 0 : (resAtivo?.distanceMeters || 0) / 1000
    const durAtivoSec = isUltimaParada ? 0 : resAtivo?.durationSeconds || 0

    const coordsRetorno = resRetorno?.coordinates || [
      [pontoUltima.latitude, pontoUltima.longitude],
      [deposito.latitude, deposito.longitude],
    ]
    const distRetornoKm = (resRetorno?.distanceMeters || 0) / 1000
    const durRetornoSec = resRetorno?.durationSeconds || 0

    const distIntermediarioKm = (resIntermediario?.distanceMeters || 0) / 1000
    const durIntermediarioSec = resIntermediario?.durationSeconds || 0

    // Distância restante:
    // Se está na última parada, o trecho restante é exatamente o retorno ao depósito
    const distRestanteKm = isUltimaParada
      ? distRetornoKm
      : distAtivoKm + distIntermediarioKm + distRetornoKm
    const durRestanteMin = isUltimaParada
      ? Math.round(durRetornoSec / 60)
      : Math.round((durAtivoSec + durIntermediarioSec + durRetornoSec) / 60)

    // Distância total do percurso completo (circuito fechado: depósito -> todas paradas -> depósito)
    // Se temos trechoConcluido + trechoAtivo + intermediario + retorno
    const distTotalCircuitoKm =
      distConcluidoKm + (isUltimaParada ? 0 : distAtivoKm) + distIntermediarioKm + distRetornoKm
    const durTotalMin = Math.round(
      (durConcluidoSec + (isUltimaParada ? 0 : durAtivoSec) + durIntermediarioSec + durRetornoSec) /
        60,
    )

    const result: OsrmEmRotaResult = {
      trechoConcluido: coordsConcluido,
      trechoAtivoVermelho: coordsAtivo,
      trechoRetornoDeposito: coordsRetorno,
      distanciaConcluidaKm: distConcluidoKm,
      distanciaAtivaKm: distAtivoKm,
      distanciaRetornoKm: distRetornoKm,
      distanciaTotalPercursoKm: distTotalCircuitoKm,
      distanciaRestanteKm: distRestanteKm,
      duracaoEstimadaMinutos: durTotalMin,
      duracaoRestanteMinutos: durRestanteMin,
      proximaParadaIndex: proximaIndex,
      caminhaoParadaIndex: caminhaoIndex,
      viaEstrada: true,
    }

    routeEmRotaCache.set(cacheKey, result)
    return result
  } catch {
    return null
  }
}

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
  routeEmRotaCache.clear()
}
