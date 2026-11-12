import type { Order } from '@/lib/types'

/**
 * Recorte operacional por DATA DE ENTREGA (filtro primário de /rotas).
 *
 * O operador da cooperativa pensa em datas, não em chamadas: esta helper
 * descobre, a partir dos pedidos em ciclos abertos, quais datas de entrega
 * possuem pedidos e quais chamadas operam em cada data. O ciclo continua
 * existindo por baixo (retenção/histórico) — nada do modelo de dados muda.
 */

export interface ChamadaNaDataEntrega {
  chamadaId: string
  /** Ciclo principal da chamada na data (o ciclo que a tela /rotas passa a selecionar) */
  cicloPrincipalId: string
  /** Quantidade de pedidos ativos desta chamada na data */
  pedidos: number
}

export interface DataEntregaAgregada {
  /** Data de entrega do pedido (mesmo formato de Order.date, ex.: 'yyyy-mm-dd') */
  data: string
  totalPedidos: number
  chamadas: ChamadaNaDataEntrega[]
}

/** Estrutura mínima de ciclo necessária para o agrupamento (CicloRecord é compatível) */
interface CicloLike {
  id: string
  chamada_id?: string
  status?: string
  data_despacho?: string
}

function isCicloAberto(status?: string): boolean {
  const norm = (status || '').trim().toLowerCase()
  // Ciclos terminais (fechado/cancelado) não geram datas operacionais:
  // a consulta histórica permanece pelos mecanismos já existentes.
  return norm !== 'fechado' && norm !== 'cancelado'
}

/**
 * Agrupa pedidos ativos (não cancelados) de ciclos abertos por data de entrega.
 * Cada chamada da data aponta para o ciclo principal (preferência: ciclo cuja
 * data_despacho coincide com a data; senão o de maior volume de pedidos).
 * As datas voltam em ordem crescente.
 */
export function agruparPedidosPorDataEntrega(
  orders: Order[],
  ciclos: CicloLike[],
): DataEntregaAgregada[] {
  const ciclosAbertos = new Map<string, CicloLike>()
  for (const c of ciclos) {
    if (isCicloAberto(c.status)) ciclosAbertos.set(c.id, c)
  }

  // data -> chamadaId -> { pedidos, cicloId -> contagem }
  const porData = new Map<string, Map<string, { pedidos: number; ciclos: Map<string, number> }>>()

  for (const o of orders) {
    if (o.status === 'Cancelado') continue
    if (!o.date || !o.cicloId) continue
    const ciclo = ciclosAbertos.get(o.cicloId)
    if (!ciclo) continue

    let chamadasMap = porData.get(o.date)
    if (!chamadasMap) {
      chamadasMap = new Map()
      porData.set(o.date, chamadasMap)
    }

    const chamadaId = ciclo.chamada_id || 'sem-chamada'
    let rec = chamadasMap.get(chamadaId)
    if (!rec) {
      rec = { pedidos: 0, ciclos: new Map() }
      chamadasMap.set(chamadaId, rec)
    }
    rec.pedidos++
    rec.ciclos.set(o.cicloId, (rec.ciclos.get(o.cicloId) || 0) + 1)
  }

  const resultado: DataEntregaAgregada[] = []
  for (const [data, chamadasMap] of porData.entries()) {
    const chamadas: ChamadaNaDataEntrega[] = []
    for (const [chamadaId, rec] of chamadasMap.entries()) {
      const ids = Array.from(rec.ciclos.keys())
      const cicloPrincipalId =
        ids.find((id) => ciclosAbertos.get(id)?.data_despacho === data) ||
        ids.reduce(
          (melhor, id) => ((rec.ciclos.get(id) || 0) > (rec.ciclos.get(melhor) || 0) ? id : melhor),
          ids[0] || '',
        ) ||
        ''
      chamadas.push({ chamadaId, cicloPrincipalId, pedidos: rec.pedidos })
    }
    resultado.push({ data, totalPedidos: rec_total(chamadas), chamadas })
  }

  resultado.sort((a, b) => a.data.localeCompare(b.data))
  return resultado
}

function rec_total(chamadas: ChamadaNaDataEntrega[]): number {
  return chamadas.reduce((acc, c) => acc + c.pedidos, 0)
}

/** Data de hoje no formato local 'yyyy-mm-dd' (sem UTC shift) */
export function dataISOHoje(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/**
 * Data pré-selecionada ao abrir a página (a mais próxima/ativa):
 * 1. dataPreferida (data de despacho do ciclo em foco), se existir na lista;
 * 2. hoje, se houver pedidos hoje;
 * 3. a primeira data futura;
 * 4. a data mais recente passada.
 */
export function escolherDataPadrao(
  datas: DataEntregaAgregada[],
  dataPreferida?: string,
  hoje?: string,
): string {
  if (datas.length === 0) return ''
  const lista = datas.map((d) => d.data)
  if (dataPreferida && lista.includes(dataPreferida)) return dataPreferida
  const hojeStr = hoje || dataISOHoje()
  if (lista.includes(hojeStr)) return hojeStr
  const futura = lista.find((d) => d >= hojeStr)
  if (futura) return futura
  return lista[lista.length - 1]
}

/** Formata 'yyyy-mm-dd' como 'dd/mm/aaaa' (tolerante a outros formatos) */
export function formatarDataEntrega(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return data
}
