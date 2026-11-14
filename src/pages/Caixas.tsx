import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/context/app-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { agregarDatasEntrega, escolherDataPadrao, formatarDataEntrega } from '@/lib/datasEntrega'
import { formatQuantityOneDecimal } from '@/lib/decimalUtils'

/**
 * Caixas (/caixas) — folha de conferência por rota para montagem de caixas.
 *
 * Segue o modelo PDF do usuário: por rota, coluna TOTAL à esquerda, escolas
 * numeradas ("N. NOME"), produtos nas linhas, linha TOTAL no pé da página;
 * rota com mais de 20 escolas divide em 2+ páginas com numeração contínua;
 * última seção traz totais por produto por rota + PESO TOTAL por rota.
 * "Imprimir PDF" imprime exatamente o mesmo layout da tela em A4 paisagem.
 *
 * Mesma base da Consolidação Final / Compras: pedidos ativos → itens →
 * produtos, unidade do catálogo, escola → rota via paradas_rota, no recorte
 * data de entrega + chamada, isolamento por ciclo_id (anti-vazamento).
 * Tela de consulta: sem edição, sem exportação.
 */

const ESCOLAS_POR_PAGINA = 20

function isCicloNaoTerminal(status?: string): boolean {
  const norm = (status || '').trim().toLowerCase()
  return norm !== 'fechado' && norm !== 'cancelado'
}

/** 3 → "3"; 99,5 → "99,5"; 4,5 → "4,5" (pt-BR). */
function formatQty(value: number): string {
  const n = Number(value) || 0
  if (Number.isInteger(n)) return String(n)
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

/** Data curta do modelo: "19/out". */
function formatDataCurta(dataISO: string): string {
  const d = new Date(`${dataISO}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dataISO
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

interface EscolaColuna {
  escolaId: string
  numero: number
  rotulo: string
  nome: string
}

interface ProdutoLinha {
  produtoId: string
  nome: string
  unidade: string
  porEscola: Record<string, number>
  totalRota: number
}

interface PaginaFolha {
  escolas: EscolaColuna[]
  numeroInicial: number
  numeroFinal: number
  produtos: ProdutoLinha[]
  totalPagina: number
}

interface RotaFolha {
  rotaId: string
  nome: string
  paginas: PaginaFolha[]
  totalRota: number
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function Caixas() {
  const { orders, products, schools, ciclos, chamadas, rotas, paradasRota, activeCiclo } = useApp()

  const [dataEntregaSel, setDataEntregaSel] = useState<string>('')
  const [chamadaSel, setChamadaSel] = useState<string>('')
  const [rotaSel, setRotaSel] = useState<string>('todas')
  const dataInicializadaRef = useRef(false)

  // Filtro PRIMÁRIO: datas com pedidos em ciclos abertos (mesmo padrão de /rotas)
  const datasEntregaAgregadas = useMemo(() => agregarDatasEntrega(orders, ciclos), [orders, ciclos])

  const dataEntregaAtual = useMemo(
    () => datasEntregaAgregadas.find((d) => d.data === dataEntregaSel) || null,
    [datasEntregaAgregadas, dataEntregaSel],
  )

  // Pré-seleção da data padrão: data de despacho do ciclo corrente, depois hoje/próxima
  useEffect(() => {
    if (dataInicializadaRef.current || datasEntregaAgregadas.length === 0) return
    dataInicializadaRef.current = true
    const dataPadrao = escolherDataPadrao(datasEntregaAgregadas, activeCiclo?.data_despacho)
    if (!dataPadrao) return
    setDataEntregaSel(dataPadrao)
    const agregada = datasEntregaAgregadas.find((d) => d.data === dataPadrao)
    const chamadaPreferida =
      (activeCiclo?.chamada_id &&
        agregada?.chamadas.find((c) => c.chamadaId === activeCiclo.chamada_id)) ||
      [...(agregada?.chamadas || [])].sort((a, b) => b.pedidos - a.pedidos)[0]
    if (chamadaPreferida) setChamadaSel(chamadaPreferida.chamadaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasEntregaAgregadas])

  const handleChangeDataEntrega = (data: string) => {
    if (data === dataEntregaSel) return
    setDataEntregaSel(data)
    const agregada = datasEntregaAgregadas.find((d) => d.data === data)
    const chamadaPreferida =
      (chamadaSel && agregada?.chamadas.find((c) => c.chamadaId === chamadaSel)) ||
      (activeCiclo?.chamada_id &&
        agregada?.chamadas.find((c) => c.chamadaId === activeCiclo.chamada_id)) ||
      [...(agregada?.chamadas || [])].sort((a, b) => b.pedidos - a.pedidos)[0]
    if (chamadaPreferida) setChamadaSel(chamadaPreferida.chamadaId)
  }

  // Seletor secundário de Chamada: só quando a data tem 2+ chamadas com pedidos
  const mostrarSeletorChamada = Boolean(dataEntregaAtual && dataEntregaAtual.chamadas.length > 1)

  useEffect(() => {
    if (!mostrarSeletorChamada || !dataEntregaAtual) return
    if (dataEntregaAtual.chamadas.some((c) => c.chamadaId === chamadaSel)) return
    const preferida =
      (activeCiclo?.chamada_id &&
        dataEntregaAtual.chamadas.find((c) => c.chamadaId === activeCiclo.chamada_id)) ||
      [...dataEntregaAtual.chamadas].sort((a, b) => b.pedidos - a.pedidos)[0]
    if (preferida) setChamadaSel(preferida.chamadaId)
  }, [mostrarSeletorChamada, dataEntregaAtual, chamadaSel, activeCiclo])

  // Ciclo → chamada (recorte data → chamada, anti-vazamento por ciclo_id)
  const cicloChamadaMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of ciclos) {
      if (c.chamada_id && isCicloNaoTerminal(c.status)) map.set(c.id, c.chamada_id)
    }
    return map
  }, [ciclos])

  // Pedidos do recorte: data de entrega + chamada selecionadas, não cancelados,
  // apenas ciclos abertos (isolamento por ciclo_id / anti-vazamento)
  const ordersRecorte = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'Cancelado') return false
      if (!o.date || !o.cicloId) return false
      if (!cicloChamadaMap.get(o.cicloId)) return false
      if (dataEntregaSel && o.date !== dataEntregaSel) return false
      if (chamadaSel && cicloChamadaMap.get(o.cicloId) !== chamadaSel) return false
      return true
    })
  }, [orders, dataEntregaSel, chamadaSel, cicloChamadaMap])

  // Rotas ativas da chamada selecionada
  const rotasDoRecorte = useMemo(() => {
    if (!chamadaSel) return rotas.filter((r) => r.ativa !== false)
    return rotas
      .filter((r) => r.ativa !== false && r.chamada_id === chamadaSel)
      .sort(
        (a, b) =>
          (Number(a.ordem) || 0) - (Number(b.ordem) || 0) ||
          (a.nome || '').localeCompare(b.nome || '', 'pt-BR'),
      )
  }, [rotas, chamadaSel])

  // Mapa escola → rota (paradas_rota), mesma fonte da Consolidação Final
  const escolaRotaMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of paradasRota) {
      if (p.rota_id && !map.has(p.escola_id)) map.set(p.escola_id, p.rota_id)
    }
    return map
  }, [paradasRota])

  // Ordem das paradas por rota (ordem de visita)
  const ordemParadaPorEscola = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of paradasRota) map.set(p.escola_id, Number(p.ordem) || 0)
    return map
  }, [paradasRota])

  const escolaPorId = useMemo(() => {
    const map = new Map<string, unknown>()
    for (const s of schools as unknown as Array<{ id?: string }>) {
      if (s?.id) map.set(s.id, s)
    }
    return map
  }, [schools])

  // Folha por rota: escolas da rota (paradas_rota, ordem de visita), páginas de
  // até 20 escolas com numeração contínua, produtos nas linhas do recorte.
  const folhas = useMemo<RotaFolha[]>(() => {
    const rotasIds = new Set(rotasDoRecorte.map((r) => r.id))

    // Escolas por rota (todas as paradas da rota, ordenadas)
    const escolasPorRota = new Map<string, string[]>()
    for (const rota of rotasDoRecorte) {
      const escolasDaRota: string[] = []
      for (const [escolaId, rotaId] of escolaRotaMap) {
        if (rotaId === rota.id) escolasDaRota.push(escolaId)
      }
      escolasDaRota.sort(
        (a, b) =>
          (ordemParadaPorEscola.get(a) || 0) - (ordemParadaPorEscola.get(b) || 0) ||
          String((escolaPorId.get(a) as { nome?: string })?.nome || '').localeCompare(
            String((escolaPorId.get(b) as { nome?: string })?.nome || ''),
            'pt-BR',
          ),
      )
      escolasPorRota.set(rota.id, escolasDaRota)
    }

    // Quantidades: produto × escola (somente escolas de rota conhecida)
    const porProduto = new Map<string, ProdutoLinha>()
    for (const order of ordersRecorte) {
      const rotaDoPedido =
        (order.rotaLogisticaId && rotasIds.has(order.rotaLogisticaId) && order.rotaLogisticaId) ||
        (order.rotaId && rotasIds.has(order.rotaId) && order.rotaId) ||
        escolaRotaMap.get(order.schoolId) ||
        ''
      if (!rotaDoPedido || !rotasIds.has(rotaDoPedido)) continue
      for (const item of order.items) {
        const qtd = Number(item.quantity) || 0
        if (qtd <= 0) continue
        const prod = products.find((p) => p.id === item.productId)
        if (!prod) continue
        let linha = porProduto.get(prod.id)
        if (!linha) {
          linha = {
            produtoId: prod.id,
            nome: prod.name,
            unidade: prod.unit || '',
            porEscola: {},
            totalRota: 0,
          }
          porProduto.set(prod.id, linha)
        }
        linha.porEscola[order.schoolId] = (linha.porEscola[order.schoolId] || 0) + qtd
        linha.totalRota += qtd
      }
    }

    const rotasComPedidos = new Set<string>()
    for (const linha of porProduto.values()) {
      for (const escolaId of Object.keys(linha.porEscola)) {
        const rotaId = escolaRotaMap.get(escolaId)
        if (rotaId && rotasIds.has(rotaId)) rotasComPedidos.add(rotaId)
      }
    }

    const folhasOut: RotaFolha[] = []
    for (const rota of rotasDoRecorte) {
      if (rotaSel !== 'todas' && rotaSel !== rota.id) continue
      const escolasIds = escolasPorRota.get(rota.id) || []
      if (escolasIds.length === 0) continue
      if (rotaSel === 'todas' && !rotasComPedidos.has(rota.id)) continue

      // Produtos da rota (alguma quantidade > 0 nas escolas da rota)
      const produtos: ProdutoLinha[] = [...porProduto.values()]
        .filter((l) => escolasIds.some((e) => (l.porEscola[e] || 0) > 0))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

      let numero = 1
      const paginas: PaginaFolha[] = chunk(escolasIds, ESCOLAS_POR_PAGINA).map((lote) => {
        const numeroInicial = numero
        const colunas: EscolaColuna[] = lote.map((escolaId) => {
          const rec = escolaPorId.get(escolaId) as { nome?: string } | undefined
          const nome = String(rec?.nome || 'Escola')
          const col: EscolaColuna = {
            escolaId,
            numero,
            rotulo: `${numero}. ${nome}`,
            nome,
          }
          numero += 1
          return col
        })
        const produtosPagina = produtos.map((l) => ({
          ...l,
          porEscola: l.porEscola,
          totalRota: l.totalRota,
        }))
        const totalPagina = colunas.reduce((acc, col) => {
          let somaEscola = 0
          for (const l of produtos) somaEscola += l.porEscola[col.escolaId] || 0
          return acc + somaEscola
        }, 0)
        return {
          escolas: colunas,
          numeroInicial,
          numeroFinal: numero - 1,
          produtos: produtosPagina,
          totalPagina,
        }
      })

      const totalRota = paginas.reduce((acc, p) => acc + p.totalPagina, 0)
      folhasOut.push({ rotaId: rota.id, nome: rota.nome || 'Rota', paginas, totalRota })
    }

    return folhasOut
  }, [
    rotasDoRecorte,
    ordersRecorte,
    products,
    escolaRotaMap,
    ordemParadaPorEscola,
    escolaPorId,
    rotaSel,
  ])

  // Seção final: totais por produto × rota (todas as rotas do recorte)
  const totaisPorProduto = useMemo(() => {
    const rotasIds = new Set(rotasDoRecorte.map((r) => r.id))
    const map = new Map<
      string,
      { nome: string; unidade: string; porRota: Record<string, number>; total: number }
    >()
    for (const order of ordersRecorte) {
      const rotaDoPedido =
        (order.rotaLogisticaId && rotasIds.has(order.rotaLogisticaId) && order.rotaLogisticaId) ||
        (order.rotaId && rotasIds.has(order.rotaId) && order.rotaId) ||
        escolaRotaMap.get(order.schoolId) ||
        ''
      if (!rotaDoPedido || !rotasIds.has(rotaDoPedido)) continue
      for (const item of order.items) {
        const qtd = Number(item.quantity) || 0
        if (qtd <= 0) continue
        const prod = products.find((p) => p.id === item.productId)
        if (!prod) continue
        let linha = map.get(prod.id)
        if (!linha) {
          linha = { nome: prod.name, unidade: prod.unit || '', porRota: {}, total: 0 }
          map.set(prod.id, linha)
        }
        linha.porRota[rotaDoPedido] = (linha.porRota[rotaDoPedido] || 0) + qtd
        linha.total += qtd
      }
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [ordersRecorte, products, rotasDoRecorte, escolaRotaMap])

  const rotasDoResumo = useMemo(() => {
    const ids = new Set<string>()
    for (const l of totaisPorProduto) {
      for (const rotaId of Object.keys(l.porRota)) ids.add(rotaId)
    }
    return rotasDoRecorte.filter((r) => ids.has(r.id))
  }, [totaisPorProduto, rotasDoRecorte])

  const pesoTotalPorRota = useMemo(() => {
    const map: Record<string, number> = {}
    let total = 0
    for (const l of totaisPorProduto) {
      total += l.total
      for (const r of rotasDoResumo) map[r.id] = (map[r.id] || 0) + (l.porRota[r.id] || 0)
    }
    return { porRota: map, total }
  }, [totaisPorProduto, rotasDoResumo])

  const chamadaInfo = useMemo(() => {
    const ch = chamadas.find((c) => c.id === chamadaSel)
    if (!ch) return ''
    const dep = String(ch.dependencia_administrativa || '').trim()
    return `Chamada ${ch.chamada}${dep ? ` — ${dep}` : ''}`
  }, [chamadas, chamadaSel])

  const carregando = !dataEntregaSel && datasEntregaAgregadas.length > 0

  /** PDF da folha de conferência: mesma árvore DOM da tela em A4 paisagem
   * (CSS @media print dedicado em main.css). window.print é síncrono. */
  const handleImprimirPdf = () => {
    window.print()
  }

  return (
    <div className="space-y-6 print:bg-white" id="caixas-print-root">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Caixas</h1>
          <p className="text-muted-foreground text-sm">
            Folha de conferência por rota para montagem das caixas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Select value={dataEntregaSel} onValueChange={handleChangeDataEntrega}>
            <SelectTrigger className="w-[220px]" aria-label="Data de entrega">
              <SelectValue placeholder="Data de entrega" />
            </SelectTrigger>
            <SelectContent>
              {datasEntregaAgregadas.map((d) => (
                <SelectItem key={d.data} value={d.data}>
                  {formatarDataEntrega(d.data)} ({d.totalPedidos}{' '}
                  {d.totalPedidos === 1 ? 'pedido' : 'pedidos'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mostrarSeletorChamada && (
            <Select value={chamadaSel} onValueChange={setChamadaSel}>
              <SelectTrigger className="w-[200px]" aria-label="Chamada">
                <SelectValue placeholder="Chamada" />
              </SelectTrigger>
              <SelectContent>
                {(dataEntregaAtual?.chamadas || []).map((c) => {
                  const nome = chamadas.find((ch) => ch.id === c.chamadaId)?.chamada || c.chamadaId
                  return (
                    <SelectItem key={c.chamadaId} value={c.chamadaId}>
                      {nome} ({c.pedidos})
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}

          <Select value={rotaSel} onValueChange={setRotaSel}>
            <SelectTrigger className="w-[180px]" aria-label="Rota">
              <SelectValue placeholder="Rota" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as rotas</SelectItem>
              {rotasDoRecorte.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome || 'Rota'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" onClick={handleImprimirPdf} className="print:hidden">
            <Printer className="h-4 w-4" />
            Imprimir PDF
          </Button>
        </div>
      </div>

      {carregando ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </CardContent>
        </Card>
      ) : folhas.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            {dataEntregaSel
              ? `Nenhuma escola com pedidos em rotas para ${formatarDataEntrega(dataEntregaSel)}${
                  chamadaInfo ? ` · ${chamadaInfo}` : ''
                }.`
              : 'Nenhuma data de entrega com pedidos em ciclos abertos.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Folhas por rota (páginas de até 20 escolas) */}
          {folhas.map((folha) =>
            folha.paginas.map((pagina, idx) => (
              <Card
                key={`${folha.rotaId}-${idx}`}
                className="overflow-hidden print:shadow-none print:border-border print:break-after-page"
              >
                <CardContent className="p-0">
                  <div className="px-4 py-3 border-b bg-muted/40 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-bold uppercase">{folha.nome}</h2>
                    <div className="text-sm text-muted-foreground">
                      {chamadaInfo || '—'} · Data: {formatarDataEntrega(dataEntregaSel)}
                    </div>
                  </div>
                  <div className="px-4 py-2 border-b flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {pagina.escolas.map((col) => (
                      <span key={col.escolaId} className="whitespace-nowrap">
                        {col.rotulo}
                      </span>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="text-right w-20">Total</TableHead>
                          {pagina.escolas.map((col) => (
                            <TableHead key={col.escolaId} className="text-center w-14">
                              {col.numero}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagina.produtos.map((l) => (
                          <TableRow key={l.produtoId}>
                            <TableCell className="text-right font-medium whitespace-nowrap text-xs">
                              {l.nome}
                              {l.unidade ? ` (${l.unidade})` : ''}
                            </TableCell>
                            {pagina.escolas.map((col) => (
                              <TableCell
                                key={col.escolaId}
                                className={cn(
                                  'text-center font-mono text-xs',
                                  (l.porEscola[col.escolaId] || 0) === 0 &&
                                    'text-muted-foreground/40',
                                )}
                              >
                                {formatQty(l.porEscola[col.escolaId] || 0)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                        <TableRow className="bg-primary/10 font-bold hover:bg-primary/10">
                          <TableCell className="text-right">
                            {`TOTAL ${folha.nome.replace(/^rota\s*/i, '')} ${formatQty(pagina.totalPagina)}`}
                          </TableCell>
                          {pagina.escolas.map((col) => (
                            <TableCell key={col.escolaId} className="text-center font-mono text-xs">
                              {' '}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="px-4 py-2 border-t flex items-center justify-between text-sm">
                    <span className="font-semibold">
                      {formatDataCurta(dataEntregaSel)} · {pagina.numeroInicial}–
                      {pagina.numeroFinal}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {pagina.escolas.length} {pagina.escolas.length === 1 ? 'escola' : 'escolas'} ·{' '}
                      {formatQuantityOneDecimal(pagina.totalPagina)} kg
                    </span>
                  </div>
                </CardContent>
              </Card>
            )),
          )}

          {/* Seção final: totais por produto por rota + PESO TOTAL */}
          <Card className="overflow-hidden print:break-after-page">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b bg-muted/40">
                <h2 className="font-bold">Totais por produto</h2>
                <div className="text-sm text-muted-foreground">
                  {chamadaInfo || '—'} · Data: {formatarDataEntrega(dataEntregaSel)}
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="min-w-[200px]">Produto</TableHead>
                      {rotasDoResumo.map((r) => (
                        <TableHead key={r.id} className="text-right whitespace-nowrap">
                          {(r.nome || 'Rota').replace(/^rota\s*/i, '')}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {totaisPorProduto.map((l) => (
                      <TableRow key={l.nome}>
                        <TableCell className="font-medium whitespace-nowrap text-xs">
                          {l.nome}
                          {l.unidade ? ` (${l.unidade})` : ''}
                        </TableCell>
                        {rotasDoResumo.map((r) => (
                          <TableCell key={r.id} className="text-right font-mono text-xs">
                            {formatQty(l.porRota[r.id] || 0)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-mono font-semibold text-xs">
                          {formatQty(l.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-primary/10 font-bold hover:bg-primary/10">
                      <TableCell>PESO TOTAL</TableCell>
                      {rotasDoResumo.map((r) => (
                        <TableCell key={r.id} className="text-right font-mono">
                          {formatQty(pesoTotalPorRota.porRota[r.id] || 0)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono">
                        {formatQty(pesoTotalPorRota.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground print:hidden">
            Mesma base de dados da Consolidação Final. Pedidos cancelados e ciclos
            fechados/cancelados não entram. Tela de consulta — sem edição.
          </p>
        </>
      )}
    </div>
  )
}
