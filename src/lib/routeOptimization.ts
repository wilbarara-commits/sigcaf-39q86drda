/**
 * Utilitário de otimização de rotas por coordenadas geográficas.
 * Utiliza distância Haversine, heurística do Vizinho Mais Próximo com âncora na 1ª parada,
 * e melhoria local 2-opt para redução do percurso total.
 */

export interface CoordenadaGeo {
  latitude: number
  longitude: number
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
 * Heurística do Vizinho Mais Próximo com a primeira parada fixa (âncora).
 */
function vizinhoMaisProximo(paradasComCoord: ParadaOtimizavel[]): ParadaOtimizavel[] {
  if (paradasComCoord.length <= 2) {
    return [...paradasComCoord]
  }

  const rota = [paradasComCoord[0]]
  const naoVisitadas = paradasComCoord.slice(1)

  while (naoVisitadas.length > 0) {
    const atual = rota[rota.length - 1]
    let menorDist = Infinity
    let menorIdx = -1

    for (let i = 0; i < naoVisitadas.length; i++) {
      const candidato = naoVisitadas[i]
      const dist = calcularDistanciaHaversineKm(
        atual.latitude!,
        atual.longitude!,
        candidato.latitude!,
        candidato.longitude!,
      )
      if (dist < menorDist) {
        menorDist = dist
        menorIdx = i
      }
    }

    if (menorIdx !== -1) {
      rota.push(naoVisitadas[menorIdx])
      naoVisitadas.splice(menorIdx, 1)
    } else {
      rota.push(naoVisitadas.pop()!)
    }
  }

  return rota
}

/**
 * Aplica 2-opt mantendo a 1ª parada fixa (índice 0 nunca é invertido).
 * O trecho invertido abrange os índices entre i e k inclusive (1 <= i < k < n).
 */
function aplicar2Opt(paradas: ParadaOtimizavel[], maxIteracoes = 100): ParadaOtimizavel[] {
  if (paradas.length <= 3) {
    return paradas
  }

  let melhorRota = [...paradas]
  let melhorDistancia = calcularDistanciaTotalCaminho(melhorRota)
  let houveMelhoria = true
  let iteracao = 0

  while (houveMelhoria && iteracao < maxIteracoes) {
    houveMelhoria = false
    iteracao++

    const n = melhorRota.length
    // i começa em 1 para manter a 1ª parada intacta
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        // Criar rota com segmento invertido entre i e k
        const novaRota = [
          ...melhorRota.slice(0, i),
          ...melhorRota.slice(i, k + 1).reverse(),
          ...melhorRota.slice(k + 1),
        ]

        const novaDistancia = calcularDistanciaTotalCaminho(novaRota)
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
 * Função principal para otimizar uma lista de paradas da rota:
 * 1. Separa paradas com coordenadas e sem coordenadas.
 * 2. Mantém a 1ª parada da rota atual como âncora do percurso.
 * 3. Aplica vizinho mais próximo nas paradas com coordenadas partindo da âncora.
 * 4. Aplica melhoria 2-opt no resultado.
 * 5. Mantém as escolas sem coordenadas na ordem relativa original após as escolas com coordenadas.
 * 6. Monta o comparativo completo (atual vs sugerido, distâncias km, badges).
 */
export function otimizarSequenciaParadas(
  paradasOriginais: ParadaOtimizavel[],
): ResultadoOtimizacaoRota {
  const totalParadas = paradasOriginais.length

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
    }
  }

  // Caso especial: se a PRIMEIRA parada não tem coordenadas mas outras têm,
  // mantemos as com coordenadas ordenadas após ela ou ajustamos o conjunto
  let rotaComCoordOtimizada: ParadaOtimizavel[] = []

  if (comCoord.length >= 2) {
    // Se a primeira parada de todas tiver coordenadas, ela é garantidamente a âncora.
    // Se a primeira parada não tem coordenadas, ela ficará no semCoord, e a âncora será a primeira que tem coordenadas.
    const rotaNN = vizinhoMaisProximo(comCoord)
    rotaComCoordOtimizada = aplicar2Opt(rotaNN)
  } else {
    rotaComCoordOtimizada = [...comCoord]
  }

  // Agrupar a nova sequência:
  // Se a primeira parada original era sem coordenadas, mantemos a primeira parada original onde estava?
  // O requisito 5 diz:
  // "(a) escola da rota SEM coordenadas cadastradas → excluí-la da otimização, mantê-la na posição relativa atual ao final, e avisar no diálogo"
  // E o requisito 2 diz: "heurística do vizinho mais próximo partindo da PRIMEIRA parada atual como âncora (a rota continua começando onde começa hoje)"
  // Portanto: paradas com coordenadas otimizadas primeiro (partindo da primeira parada atual como âncora), seguidas das sem coordenadas ao final na ordem original relativa.
  // Caso a primeira parada atual NÃO tenha coordenadas: para respeitar a âncora "continua começando onde começa hoje",
  // se p[0] não tiver coordenadas, p[0] ainda é a primeira?
  // Requisito 5(a): "mantê-la na posição relativa atual ao final". Logo, as com coordenadas vêm primeiro (iniciando pela 1ª parada com coordenada, ou se p[0] tiver coordenada, por ela), e as sem coordenadas vão ao final na ordem relativa original.
  // Se p[0] tem coordenadas, comCoord[0] == p[0], então a rota continua começando em p[0]!

  const sequenciaFinalBruta: ParadaOtimizavel[] = [...rotaComCoordOtimizada, ...semCoord]

  // Calcular distâncias estimadas (somatório haversine para os pares consecutivos que possuem coordenadas)
  const distanciaAtualKm = calcularDistanciaTotalCaminho(paradasOriginais)
  const distanciaSugeridaKm = calcularDistanciaTotalCaminho(sequenciaFinalBruta)

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
  }
}
