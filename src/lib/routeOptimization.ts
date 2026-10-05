/**
 * Utilitário de otimização de rotas por coordenadas geográficas.
 * Utiliza distância Haversine, heurística do Vizinho Mais Próximo partindo do Depósito Central,
 * e melhoria local 2-opt para redução do percurso total de entrega.
 */

export interface CoordenadaGeo {
  latitude: number
  longitude: number
}

/**
 * Ponto de partida padrão de todas as rotas otimizadas da cooperativa:
 * Depósito Central (coordenadas geográficas fixas).
 */
export const DEPOSITO_CENTRAL = {
  nome: 'Depósito Central',
  latitude: -22.260264,
  longitude: -42.738042,
} as const

export interface DepositoCentralConfig {
  nome: string
  latitude: number
  longitude: number
}

/**
 * Resolve o Depósito Central ativo a partir da configuração fornecida (banco/contexto),
 * aplicando fallback seguro para as coordenadas e nome padrão se campos estiverem vazios/inválidos.
 */
export function resolverDepositoCentral(
  config?: {
    deposito_nome?: string | null
    deposito_latitude?: string | number | null
    deposito_longitude?: string | number | null
  } | null,
): DepositoCentralConfig {
  if (!config) {
    return { ...DEPOSITO_CENTRAL }
  }

  const coords = extrairCoordenadas(config.deposito_latitude, config.deposito_longitude)
  const nome = config.deposito_nome?.trim() || DEPOSITO_CENTRAL.nome

  if (!coords) {
    return {
      nome,
      latitude: DEPOSITO_CENTRAL.latitude,
      longitude: DEPOSITO_CENTRAL.longitude,
    }
  }

  return {
    nome,
    latitude: coords.latitude,
    longitude: coords.longitude,
  }
}

export interface ParadaOtimizavel {
  escolaId: string
  nome: string
  endereco?: string
  alunos?: number
  contratoNumero?: string
  ordem: number
  latitude?: number | null
  longitude?: number | null
}

export interface ParadaComparativo extends ParadaOtimizavel {
  ordemOriginal: number
  ordemSugerida: number
  posicaoMudou: boolean
  semCoordenada: boolean
}

export interface ResultadoOtimizacaoRota {
  paradasSugeridas: ParadaComparativo[]
  distanciaAtualKm: number
  distanciaSugeridaKm: number
  economiaKm: number
  economiaPercentual: number
  houveMudanca: boolean
  escolasSemCoordenadasCount: number
  escolasComCoordenadasCount: number
  totalParadas: number
  podeOtimizar: boolean
  motivoNaoOtimizavel?: string
  depositoPartida?: {
    nome: string
    latitude: number
    longitude: number
  }
}

/**
 * Converte graus para radianos.
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Calcula a distância em quilômetros entre dois pontos usando a fórmula de Haversine.
 * Raio médio da Terra: 6371 km.
 */
export function calcularDistanciaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371 // km
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Extrai e normaliza latitude/longitude a partir de strings ou números.
 * Suporta formatos com vírgula decimal (pt-BR) ou ponto decimal.
 */
export function extrairCoordenadas(
  latRaw?: string | number | null,
  lonRaw?: string | number | null,
): { latitude: number; longitude: number } | null {
  if (latRaw === undefined || latRaw === null || lonRaw === undefined || lonRaw === null) {
    return null
  }

  const parseVal = (v: string | number): number | null => {
    if (typeof v === 'number') {
      return Number.isFinite(v) ? v : null
    }
    const clean = String(v).trim().replace(',', '.')
    if (!clean) return null
    const num = Number(clean)
    return Number.isFinite(num) ? num : null
  }

  const lat = parseVal(latRaw)
  const lon = parseVal(lonRaw)

  if (lat === null || lon === null) return null

  // Validação dos intervalos válidos de latitude [-90, 90] e longitude [-180, 180]
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

  // Checar se não é ponto zero exato inválido
  if (lat === 0 && lon === 0) return null

  return { latitude: lat, longitude: lon }
}

/**
 * Calcula a distância total percorrida em km ao longo de uma sequência de coordenadas.
 */
export function calcularDistanciaTotalCaminho(
  paradas: Array<{ latitude?: number | null; longitude?: number | null }>,
): number {
  let totalKm = 0
  for (let i = 0; i < paradas.length - 1; i++) {
    const p1 = paradas[i]
    const p2 = paradas[i + 1]
    if (
      p1.latitude !== null &&
      p1.latitude !== undefined &&
      p1.longitude !== null &&
      p1.longitude !== undefined &&
      p2.latitude !== null &&
      p2.latitude !== undefined &&
      p2.longitude !== null &&
      p2.longitude !== undefined
    ) {
      totalKm += calcularDistanciaHaversineKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
    }
  }
  return totalKm
}

/**
 * Heurística do Vizinho Mais Próximo partindo de uma origem geográfica fixa (ex.: Depósito Central).
 * Ordena as escolas escolhendo a cada passo a escola mais próxima do ponto atual,
 * iniciando pela escola mais próxima da origem.
 */
function vizinhoMaisProximoComOrigem(
  origem: CoordenadaGeo,
  paradasComCoord: ParadaOtimizavel[],
): ParadaOtimizavel[] {
  if (paradasComCoord.length <= 1) {
    return [...paradasComCoord]
  }

  const rota: ParadaOtimizavel[] = []
  const naoVisitadas = [...paradasComCoord]
  let pontoAtual: CoordenadaGeo = origem

  while (naoVisitadas.length > 0) {
    let menorDist = Infinity
    let menorIdx = -1

    for (let i = 0; i < naoVisitadas.length; i++) {
      const candidato = naoVisitadas[i]
      const dist = calcularDistanciaHaversineKm(
        pontoAtual.latitude,
        pontoAtual.longitude,
        candidato.latitude!,
        candidato.longitude!,
      )
      if (dist < menorDist) {
        menorDist = dist
        menorIdx = i
      }
    }

    if (menorIdx !== -1) {
      const proxima = naoVisitadas[menorIdx]
      rota.push(proxima)
      pontoAtual = { latitude: proxima.latitude!, longitude: proxima.longitude! }
      naoVisitadas.splice(menorIdx, 1)
    } else {
      const proxima = naoVisitadas.pop()!
      rota.push(proxima)
      pontoAtual = { latitude: proxima.latitude!, longitude: proxima.longitude! }
    }
  }

  return rota
}

/**
 * Aplica melhoria local 2-opt em toda a sequência de paradas considerando a origem fixa.
 * O percurso avaliado é: Origem -> paradas[0] -> ... -> paradas[n-1].
 * Pode inverter qualquer segmento entre 0 e n-1 (0 <= i < k < n), desde que reduza a distância total partindo da origem.
 */
function aplicar2OptComOrigem(
  origem: CoordenadaGeo,
  paradas: ParadaOtimizavel[],
  maxIteracoes = 100,
): ParadaOtimizavel[] {
  if (paradas.length < 2) {
    return paradas
  }

  let melhorRota = [...paradas]
  let melhorDistancia = calcularDistanciaTotalCaminho([origem, ...melhorRota])
  let houveMelhoria = true
  let iteracao = 0

  while (houveMelhoria && iteracao < maxIteracoes) {
    houveMelhoria = false
    iteracao++

    const n = melhorRota.length
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        // Criar rota com segmento invertido entre i e k
        const novaRota = [
          ...melhorRota.slice(0, i),
          ...melhorRota.slice(i, k + 1).reverse(),
          ...melhorRota.slice(k + 1),
        ]

        const novaDistancia = calcularDistanciaTotalCaminho([origem, ...novaRota])
        // Redução significativa de percurso (> 1 metro)
        if (novaDistancia + 0.001 < melhorDistancia) {
          melhorRota = novaRota
          melhorDistancia = novaDistancia
          houveMelhoria = true
          break
        }
      }
      if (houveMelhoria) break
    }
  }

  return melhorRota
}

/**
 * Função principal para otimizar uma lista de paradas da rota partindo do Depósito Central:
 * 1. Separa paradas com coordenadas e sem coordenadas.
 * 2. Define o Depósito Central como ponto de partida da rota.
 * 3. Aplica vizinho mais próximo nas paradas com coordenadas partindo do Depósito Central.
 * 4. Aplica melhoria 2-opt considerando o percurso completo desde o Depósito Central.
 * 5. Mantém as escolas sem coordenadas na ordem relativa original após as escolas com coordenadas.
 * 6. Calcula a distância estimada partindo do Depósito Central (depósito -> primeira parada -> subsequentes).
 * 7. Monta o comparativo completo (atual vs sugerido partindo do depósito, distâncias km, badges).
 */
/**
 * Constrói a URL universal do Google Maps com trajeto traçado (origem -> destino).
 * Suporta coordenadas {latitude, longitude} ou string de endereço/busca.
 * Utiliza ponto decimal para números.
 * Formato universal: https://www.google.com/maps/dir/?api=1&origin=LAT1,LNG1&destination=LAT2,LNG2
 */
export function buildGoogleMapsRouteUrl(
  origem: { latitude: number; longitude: number } | string,
  destino: { latitude: number; longitude: number } | string,
): string {
  const formatPoint = (pt: { latitude: number; longitude: number } | string): string => {
    if (typeof pt === 'string') {
      return pt.trim()
    }
    // Garante que o separador decimal seja ponto e não vírgula
    const lat = pt.latitude.toFixed(6).replace(',', '.')
    const lng = pt.longitude.toFixed(6).replace(',', '.')
    return `${lat},${lng}`
  }

  const origStr = formatPoint(origem)
  const destStr = formatPoint(destino)

  if (!origStr || !destStr) return ''

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origStr,
  )}&destination=${encodeURIComponent(destStr)}`
}

export function otimizarSequenciaParadas(
  paradasOriginais: ParadaOtimizavel[],
  origemCustomizada?: CoordenadaGeo & { nome?: string },
): ResultadoOtimizacaoRota {
  const totalParadas = paradasOriginais.length
  const origem: CoordenadaGeo & { nome: string } = {
    latitude: origemCustomizada?.latitude ?? DEPOSITO_CENTRAL.latitude,
    longitude: origemCustomizada?.longitude ?? DEPOSITO_CENTRAL.longitude,
    nome: origemCustomizada?.nome ?? DEPOSITO_CENTRAL.nome,
  }

  if (totalParadas < 3) {
    return {
      paradasSugeridas: [],
      distanciaAtualKm: 0,
      distanciaSugeridaKm: 0,
      economiaKm: 0,
      economiaPercentual: 0,
      houveMudanca: false,
      escolasSemCoordenadasCount: 0,
      escolasComCoordenadasCount: 0,
      totalParadas,
      podeOtimizar: false,
      motivoNaoOtimizavel: 'A otimização de rota faz sentido a partir de 3 paradas.',
      depositoPartida: origem,
    }
  }

  // Identificar quais têm coordenadas válidas
  const comCoord: ParadaOtimizavel[] = []
  const semCoord: ParadaOtimizavel[] = []

  paradasOriginais.forEach((p, index) => {
    const coords = extrairCoordenadas(p.latitude, p.longitude)
    const normalizado: ParadaOtimizavel = {
      ...p,
      ordem: p.ordem || index + 1,
      latitude: coords ? coords.latitude : null,
      longitude: coords ? coords.longitude : null,
    }

    if (coords) {
      comCoord.push(normalizado)
    } else {
      semCoord.push(normalizado)
    }
  })

  if (comCoord.length === 0) {
    return {
      paradasSugeridas: [],
      distanciaAtualKm: 0,
      distanciaSugeridaKm: 0,
      economiaKm: 0,
      economiaPercentual: 0,
      houveMudanca: false,
      escolasSemCoordenadasCount: semCoord.length,
      escolasComCoordenadasCount: 0,
      totalParadas,
      podeOtimizar: false,
      motivoNaoOtimizavel:
        'Nenhuma escola desta rota possui coordenadas geográficas (latitude/longitude) cadastradas.',
      depositoPartida: origem,
    }
  }

  // Sequenciamento partindo da origem fixa (Depósito Central)
  let rotaComCoordOtimizada: ParadaOtimizavel[] = []

  if (comCoord.length >= 2) {
    const rotaNN = vizinhoMaisProximoComOrigem(origem, comCoord)
    rotaComCoordOtimizada = aplicar2OptComOrigem(origem, rotaNN)
  } else {
    rotaComCoordOtimizada = [...comCoord]
  }

  // Sequência final: paradas com coordenadas otimizadas partindo do depósito + sem coordenadas ao final
  const sequenciaFinalBruta: ParadaOtimizavel[] = [...rotaComCoordOtimizada, ...semCoord]

  // Calcular distâncias estimadas partindo do Depósito Central:
  // Caminho atual: Depósito -> paradasOriginais consecutivas com coordenadas
  // Caminho sugerido: Depósito -> sequenciaFinalBruta consecutivas com coordenadas
  const caminhoAtualComOrigem = [origem, ...paradasOriginais]
  const caminhoSugeridoComOrigem = [origem, ...sequenciaFinalBruta]

  const distanciaAtualKm = calcularDistanciaTotalCaminho(caminhoAtualComOrigem)
  const distanciaSugeridaKm = calcularDistanciaTotalCaminho(caminhoSugeridoComOrigem)

  const economiaKm = Math.max(0, distanciaAtualKm - distanciaSugeridaKm)
  const economiaPercentual = distanciaAtualKm > 0 ? (economiaKm / distanciaAtualKm) * 100 : 0

  // Montar lista de paradas comparativo com nova numeração 1..N
  const paradasSugeridas: ParadaComparativo[] = sequenciaFinalBruta.map((parada, idx) => {
    const ordemSugerida = idx + 1
    const ordemOriginal = parada.ordem
    const posicaoMudou = ordemOriginal !== ordemSugerida
    const semCoordenada = parada.latitude === null || parada.latitude === undefined

    return {
      ...parada,
      ordemOriginal,
      ordemSugerida,
      posicaoMudou,
      semCoordenada,
    }
  })

  const houveMudanca = paradasSugeridas.some((p) => p.posicaoMudou)

  return {
    paradasSugeridas,
    distanciaAtualKm,
    distanciaSugeridaKm,
    economiaKm,
    economiaPercentual,
    houveMudanca,
    escolasSemCoordenadasCount: semCoord.length,
    escolasComCoordenadasCount: comCoord.length,
    totalParadas,
    podeOtimizar: true,
    depositoPartida: origem,
  }
}
