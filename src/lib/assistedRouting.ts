import {
  calcularDistanciaHaversineKm,
  extrairCoordenadas,
  DEPOSITO_CENTRAL,
  CoordenadaGeo,
} from './routeOptimization'
import { School, Order, Product } from './types'

export interface EscolaRoteamentoInput {
  escola: School
  pedidos: Order[]
  pesoKg: number
  temCoordenadas: boolean
  coords?: CoordenadaGeo
}

export interface ParadaSugeridaItem {
  escolaId: string
  escolaNome: string
  endereco: string
  alunos?: number
  ordem: number
  pesoKg: number
  pedidosCount: number
  latitude?: number | null
  longitude?: number | null
}

export interface RotaSugerida {
  id: string
  nome: string
  escolas: ParadaSugeridaItem[]
  pesoTotalKg: number
  distanciaKm: number
  duracaoMin: number
  paradasCount: number
}

export interface ParametrosRoteamentoAssistido {
  numRotas: number // padrão 2
  tempoParadaMin: number // padrão 10 min
  pesoAlvoKg?: number // opcional
}

export interface ResultadoRoteamentoAssistido {
  rotas: RotaSugerida[]
  escolasSemCoordenadas: Array<{
    escolaId: string
    escolaNome: string
    endereco: string
    pesoKg: number
    pedidosCount: number
  }>
  pesoTotalGeralKg: number
  totalEscolasComDemanda: number
}

/**
 * Calcula o peso total em kg de uma lista de pedidos.
 * Regra:
 * - itens com unidade em kg (ou gramas) usam o valor diretamente (ou convertido).
 * - itens com unidade diferente (ex.: 'un', 'unidade', 'cx', 'pct') usam o peso cadastrado do produto se disponível,
 *   senão assumem 1 kg/unidade como fallback padrão.
 */
export function calcularPesoPedidosKg(orders: Order[], productsMap: Map<string, Product>): number {
  let totalKg = 0

  for (const order of orders) {
    if (order.status === 'Cancelado') continue
    for (const item of order.items) {
      const qtd = Number(item.quantity) || 0
      if (qtd <= 0) continue

      const prod = productsMap.get(item.productId)
      const rawUnit = (prod?.unit || '').trim().toLowerCase()

      // Verificar se a unidade do produto indica peso
      if (rawUnit === 'kg' || rawUnit === 'quilo' || rawUnit === 'kilo') {
        totalKg += qtd
      } else if (rawUnit === 'g' || rawUnit === 'grama' || rawUnit === 'gramas') {
        totalKg += qtd / 1000
      } else {
        // Produto em unidade (un, cx, pct, maço, etc.)
        // Se houver peso cadastrado no produto (ex.: prod.peso ou peso em gramas/kg), usa; senão 1 kg/un
        const pesoCadastrado = (prod as any)?.peso ? Number((prod as any).peso) : null
        if (pesoCadastrado && pesoCadastrado > 0) {
          totalKg += qtd * pesoCadastrado
        } else {
          totalKg += qtd * 1 // fallback: 1 kg / un
        }
      }
    }
  }

  return Math.round(totalKg * 10) / 10
}

/**
 * Calcula a distância viária estimada multiplicando a distância geodésica Haversine por 1.3
 * (fator de sinuosidade padrão de malha viária).
 */
export function calcularDistanciaViariaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const distDireta = calcularDistanciaHaversineKm(lat1, lon1, lat2, lon2)
  return distDireta * 1.3
}

/**
 * Calcula a distância total percorrida em km com fator de sinuosidade 1.3
 * partindo da origem fixa e visitando a sequência de paradas.
 */
export function calcularDistanciaTotalRotaKm(
  origem: CoordenadaGeo,
  paradas: Array<{ latitude?: number | null; longitude?: number | null }>,
): number {
  if (paradas.length === 0) return 0

  let pontoAnterior: CoordenadaGeo = origem
  let distTotal = 0

  for (const p of paradas) {
    if (p.latitude != null && p.longitude != null) {
      distTotal += calcularDistanciaViariaHaversineKm(
        pontoAnterior.latitude,
        pontoAnterior.longitude,
        p.latitude,
        p.longitude,
      )
      pontoAnterior = { latitude: p.latitude, longitude: p.longitude }
    }
  }

  return Math.round(distTotal * 10) / 10
}

/**
 * Duração estimada da rota:
 * Duração = (nº de paradas × tempo médio por parada em min) + (distância em km ÷ 40 km/h × 60 min/h)
 */
export function calcularDuracaoRotaMin(
  numParadas: number,
  distanciaKm: number,
  tempoParadaMin: number,
): number {
  const tempoParadas = numParadas * tempoParadaMin
  const tempoDeslocamentoMin = (distanciaKm / 40) * 60
  return Math.round(tempoParadas + tempoDeslocamentoMin)
}

/**
 * Sequenciamento por vizinho mais próximo partindo da cooperativa/depósito central,
 * com refinamento local 2-opt.
 */
export function sequenciarParadas2Opt(
  origem: CoordenadaGeo,
  paradas: ParadaSugeridaItem[],
): ParadaSugeridaItem[] {
  if (paradas.length <= 1) {
    return paradas.map((p, idx) => ({ ...p, ordem: idx + 1 }))
  }

  // 1. Vizinho mais próximo a partir da origem
  const naoVisitadas = [...paradas]
  const rotaInicial: ParadaSugeridaItem[] = []
  let pontoAtual: CoordenadaGeo = origem

  while (naoVisitadas.length > 0) {
    let menorDist = Infinity
    let menorIdx = -1

    for (let i = 0; i < naoVisitadas.length; i++) {
      const candidato = naoVisitadas[i]
      if (candidato.latitude != null && candidato.longitude != null) {
        const d = calcularDistanciaViariaHaversineKm(
          pontoAtual.latitude,
          pontoAtual.longitude,
          candidato.latitude,
          candidato.longitude,
        )
        if (d < menorDist) {
          menorDist = d
          menorIdx = i
        }
      }
    }

    if (menorIdx !== -1) {
      const prox = naoVisitadas.splice(menorIdx, 1)[0]
      rotaInicial.push(prox)
      pontoAtual = { latitude: prox.latitude!, longitude: prox.longitude! }
    } else {
      const prox = naoVisitadas.pop()!
      rotaInicial.push(prox)
    }
  }

  // 2. Refinamento 2-opt partindo da origem
  let melhorRota = [...rotaInicial]
  let melhorDist = calcularDistanciaTotalRotaKm(origem, melhorRota)
  let houveMelhoria = true
  let iteracoes = 0
  const maxIteracoes = 100

  while (houveMelhoria && iteracoes < maxIteracoes) {
    houveMelhoria = false
    iteracoes++
    const n = melhorRota.length

    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const novaRota = [
          ...melhorRota.slice(0, i),
          ...melhorRota.slice(i, k + 1).reverse(),
          ...melhorRota.slice(k + 1),
        ]
        const novaDist = calcularDistanciaTotalRotaKm(origem, novaRota)
        if (novaDist + 0.01 < melhorDist) {
          melhorRota = novaRota
          melhorDist = novaDist
          houveMelhoria = true
          break
        }
      }
      if (houveMelhoria) break
    }
  }

  return melhorRota.map((p, idx) => ({ ...p, ordem: idx + 1 }))
}

/**
 * Recalcula totais (peso, distância, duração, paradas) de uma rota sugerida.
 */
export function recalcularMetricasRota(
  origem: CoordenadaGeo,
  escolas: ParadaSugeridaItem[],
  tempoParadaMin: number,
): {
  escolasOrdenadas: ParadaSugeridaItem[]
  pesoTotalKg: number
  distanciaKm: number
  duracaoMin: number
  paradasCount: number
} {
  const escolasOrdenadas = sequenciarParadas2Opt(origem, escolas)
  const pesoTotalKg = Math.round(escolasOrdenadas.reduce((sum, e) => sum + e.pesoKg, 0) * 10) / 10
  const distanciaKm = calcularDistanciaTotalRotaKm(origem, escolasOrdenadas)
  const paradasCount = escolasOrdenadas.length
  const duracaoMin = calcularDuracaoRotaMin(paradasCount, distanciaKm, tempoParadaMin)

  return {
    escolasOrdenadas,
    pesoTotalKg,
    distanciaKm,
    duracaoMin,
    paradasCount,
  }
}

/**
 * Algoritmo principal de sugestão de rotas assistida.
 * - Filtra escolas sem coordenadas e separa para inclusão manual.
 * - Agrupa as escolas com coordenadas em K clusters geográficos por proximidade angular/K-means balanceado.
 * - Balanceia peso e duração respeitando pesoAlvo se informado.
 * - Sequencia cada rota por vizinho mais próximo + 2-opt.
 */
export function gerarSugestaoRotasAssistida(params: {
  escolasInput: EscolaRoteamentoInput[]
  origem?: CoordenadaGeo
  parametros: ParametrosRoteamentoAssistido
}): ResultadoRoteamentoAssistido {
  const { escolasInput, parametros } = params
  const origem: CoordenadaGeo = params.origem || {
    latitude: DEPOSITO_CENTRAL.latitude,
    longitude: DEPOSITO_CENTRAL.longitude,
  }

  const kRotasDesejadas = Math.max(1, Math.min(parametros.numRotas || 2, 10))
  const tempoParadaMin = parametros.tempoParadaMin > 0 ? parametros.tempoParadaMin : 10
  const pesoAlvoKg =
    parametros.pesoAlvoKg && parametros.pesoAlvoKg > 0 ? parametros.pesoAlvoKg : undefined

  const escolasSemCoordenadas: ResultadoRoteamentoAssistido['escolasSemCoordenadas'] = []
  const escolasComCoords: Array<EscolaRoteamentoInput & { coords: CoordenadaGeo }> = []

  let pesoTotalGeralKg = 0

  for (const item of escolasInput) {
    pesoTotalGeralKg += item.pesoKg
    if (!item.temCoordenadas || !item.coords) {
      escolasSemCoordenadas.push({
        escolaId: item.escola.id,
        escolaNome: item.escola.name,
        endereco: item.escola.address,
        pesoKg: item.pesoKg,
        pedidosCount: item.pedidos.length,
      })
    } else {
      escolasComCoords.push({
        ...item,
        coords: item.coords,
      })
    }
  }

  pesoTotalGeralKg = Math.round(pesoTotalGeralKg * 10) / 10

  // Se não houver escolas com coordenadas, retorna rotas vazias
  if (escolasComCoords.length === 0) {
    const rotasVazias: RotaSugerida[] = []
    for (let i = 1; i <= kRotasDesejadas; i++) {
      rotasVazias.push({
        id: `sugestao-rota-${i}`,
        nome: `Rota ${i}`,
        escolas: [],
        pesoTotalKg: 0,
        distanciaKm: 0,
        duracaoMin: 0,
        paradasCount: 0,
      })
    }
    return {
      rotas: rotasVazias,
      escolasSemCoordenadas,
      pesoTotalGeralKg,
      totalEscolasComDemanda: escolasInput.length,
    }
  }

  const kEfetivo = Math.min(kRotasDesejadas, escolasComCoords.length)

  // 1. Clusterização geográfica com origem na cooperativa
  // Ordena os pontos pelo ângulo polar em relação à origem (sweep algorithm)
  // Isso cria clusters geograficamente contíguos em leque a partir do depósito
  const pontosComAngulo = escolasComCoords.map((e) => {
    const dLat = e.coords.latitude - origem.latitude
    const dLon = e.coords.longitude - origem.longitude
    const angulo = Math.atan2(dLat, dLon)
    const distOrigem = calcularDistanciaViariaHaversineKm(
      origem.latitude,
      origem.longitude,
      e.coords.latitude,
      e.coords.longitude,
    )
    return { item: e, angulo, distOrigem }
  })

  // Ordena por ângulo polar
  pontosComAngulo.sort((a, b) => a.angulo - b.angulo)

  // 2. Partição em K rotas considerando peso alvo e equilíbrio
  const clusters: Array<Array<EscolaRoteamentoInput & { coords: CoordenadaGeo }>> = Array.from(
    { length: kEfetivo },
    () => [],
  )

  if (pesoAlvoKg && pesoAlvoKg > 0) {
    // Alocação gulosa respeitando peso alvo
    let clusterIdx = 0
    let pesoAtualCluster = 0

    for (const pt of pontosComAngulo) {
      if (
        clusterIdx < kEfetivo - 1 &&
        pesoAtualCluster + pt.item.pesoKg > pesoAlvoKg &&
        clusters[clusterIdx].length > 0
      ) {
        clusterIdx++
        pesoAtualCluster = 0
      }
      clusters[clusterIdx].push(pt.item)
      pesoAtualCluster += pt.item.pesoKg
    }
  } else {
    // Divisão equilibrada por peso total acumulado
    const pesoTotalComCoords = pontosComAngulo.reduce((acc, p) => acc + p.item.pesoKg, 0)
    const pesoIdealPorRota = pesoTotalComCoords / kEfetivo

    let clusterIdx = 0
    let pesoAtualCluster = 0

    for (let i = 0; i < pontosComAngulo.length; i++) {
      const pt = pontosComAngulo[i]
      const sobraEscolas = pontosComAngulo.length - i
      const faltamRotas = kEfetivo - 1 - clusterIdx

      // Avança para o próximo cluster se atingiu o peso ideal e ainda há escolas suficientes para preencher os outros clusters
      if (
        clusterIdx < kEfetivo - 1 &&
        clusters[clusterIdx].length > 0 &&
        sobraEscolas > faltamRotas &&
        pesoAtualCluster + pt.item.pesoKg / 2 >= pesoIdealPorRota
      ) {
        clusterIdx++
        pesoAtualCluster = 0
      }

      clusters[clusterIdx].push(pt.item)
      pesoAtualCluster += pt.item.pesoKg
    }
  }

  // Se alguma rota ficou vazia mas há mais escolas, redistribui
  for (let c = 0; c < clusters.length; c++) {
    if (clusters[c].length === 0) {
      // Pega a escola do cluster mais pesado que tenha > 1 escola
      let maiorClusterIdx = -1
      let maiorQtd = 1
      for (let j = 0; j < clusters.length; j++) {
        if (clusters[j].length > maiorQtd) {
          maiorQtd = clusters[j].length
          maiorClusterIdx = j
        }
      }
      if (maiorClusterIdx !== -1) {
        const transferida = clusters[maiorClusterIdx].pop()!
        clusters[c].push(transferida)
      }
    }
  }

  // 3. Montar rotas sugeridas com sequenciamento 2-opt e métricas
  const rotasSugeridas: RotaSugerida[] = []

  for (let i = 0; i < kRotasDesejadas; i++) {
    const clusterItems = clusters[i] || []

    const paradasIniciais: ParadaSugeridaItem[] = clusterItems.map((c, idx) => ({
      escolaId: c.escola.id,
      escolaNome: c.escola.name,
      endereco: c.escola.address,
      alunos: c.escola.alunos,
      ordem: idx + 1,
      pesoKg: c.pesoKg,
      pedidosCount: c.pedidos.length,
      latitude: c.coords.latitude,
      longitude: c.coords.longitude,
    }))

    const metricas = recalcularMetricasRota(origem, paradasIniciais, tempoParadaMin)

    rotasSugeridas.push({
      id: `sugestao-rota-${i + 1}`,
      nome: `Rota ${i + 1}`,
      escolas: metricas.escolasOrdenadas,
      pesoTotalKg: metricas.pesoTotalKg,
      distanciaKm: metricas.distanciaKm,
      duracaoMin: metricas.duracaoMin,
      paradasCount: metricas.paradasCount,
    })
  }

  return {
    rotas: rotasSugeridas,
    escolasSemCoordenadas,
    pesoTotalGeralKg,
    totalEscolasComDemanda: escolasInput.length,
  }
}
