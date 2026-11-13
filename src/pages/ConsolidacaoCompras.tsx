import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/context/app-context'
import { CartaoComprarDialog } from '@/components/CartaoComprarDialog'
import PedidosCompraSection from '@/components/PedidosCompraSection'
import { compraDistribuicaoService, normalizarDataISO } from '@/services/compraDistribuicao'
import type { CompraDistribuicaoRecord } from '@/lib/types'
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
import { agregarDatasEntrega, escolherDataPadrao, formatarDataEntrega } from '@/lib/datasEntrega'

/**
 * Consolidação para Compras (/consolidacao-simples)
 *
 * Versão simples da Consolidação Final, por DATA DE ENTREGA, para uso nas
 * compras. Usa EXATAMENTE a mesma base de dados da Consolidação Final
 * (pedidos ativos → itens → quantidade por produto, com paradas_rota para
 * mapear escola → rota). Diferenças: linha TOTAL GERAL na PRIMEIRA linha,
 * sem exportação e sem outros filtros — os únicos controles são Data de
 * entrega (primário, padrão de /rotas) e Chamada (secundário, só aparece
 * quando a data tem mais de uma chamada com pedidos).
 */

interface LinhaProduto {
  produtoId: string
  nome: string
  unidade: string
  total: number
  porRota: Record<string, number>
}

function isCicloNaoTerminal(status?: string): boolean {
  const norm = (status || '').trim().toLowerCase()
  return norm !== 'fechado' && norm !== 'cancelado'
}

function formatQty(value: number): string {
  return (value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export default function ConsolidacaoCompras() {
  const { orders, products, ciclos, chamadas, rotas, paradasRota, activeCiclo } = useApp()

  const [dataEntregaSel, setDataEntregaSel] = useState<string>('')
  const [chamadaSel, setChamadaSel] = useState<string>('')
  const dataInicializadaRef = useRef(false)

  // Filtro PRIMÁRIO: datas com pedidos em ciclos abertos (mesmo padrão de /rotas)
  const datasEntregaAgregadas = useMemo(() => agregarDatasEntrega(orders, ciclos), [orders, ciclos])

  const dataEntregaAtual = useMemo(
    () => datasEntregaAgregadas.find((d) => d.data === dataEntregaSel) || null,
    [datasEntregaAgregadas, dataEntregaSel],
  )

  // Pré-seleção da data padrão (escolherDataPadrao): data de despacho do ciclo ativo, depois hoje/próxima
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

  // Troca do seletor primário de Data de Entrega: ajusta a chamada ao recorte da data
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

  // Seletor secundário de Chamada: visível só quando a data tem mais de uma chamada com pedidos
  const mostrarSeletorChamada = Boolean(dataEntregaAtual && dataEntregaAtual.chamadas.length > 1)

  // Garante chamada válida quando o seletor secundário está visível
  useEffect(() => {
    if (!mostrarSeletorChamada || !dataEntregaAtual) return
    if (dataEntregaAtual.chamadas.some((c) => c.chamadaId === chamadaSel)) return
    const preferida =
      (activeCiclo?.chamada_id &&
        dataEntregaAtual.chamadas.find((c) => c.chamadaId === activeCiclo.chamada_id)) ||
      [...dataEntregaAtual.chamadas].sort((a, b) => b.pedidos - a.pedidos)[0]
    if (preferida) setChamadaSel(preferida.chamadaId)
  }, [mostrarSeletorChamada, dataEntregaAtual, chamadaSel, activeCiclo])

  // Ciclo → chamada (para o recorte data → chamada)
  const cicloChamadaMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of ciclos) {
      if (c.chamada_id) map.set(c.id, c.chamada_id)
    }
    return map
  }, [ciclos])

  // Pedidos do recorte: data de entrega selecionada + chamada selecionada, não cancelados,
  // apenas ciclos abertos (isolamento por ciclo_id / anti-vazamento)
  const ordersRecorte = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'Cancelado') return false
      if (!o.date || !o.cicloId) return false
      if (!cicloChamadaMap.get(o.cicloId)) return false // ciclo terminal (fechado/cancelado): fora
      if (dataEntregaSel && o.date !== dataEntregaSel) return false
      if (chamadaSel && cicloChamadaMap.get(o.cicloId) !== chamadaSel) return false
      return true
    })
  }, [orders, dataEntregaSel, chamadaSel, cicloChamadaMap])

  // Rotas ativas da chamada selecionada (mesma regra da Consolidação Final)
  const rotasDoRecorte = useMemo(() => {
    if (!chamadaSel) {
      return rotas.filter((r) => r.ativa !== false)
    }
    return rotas
      .filter((r) => r.ativa !== false && r.chamada_id === chamadaSel)
      .sort(
        (a, b) =>
          (Number(a.ordem) || 0) - (Number(b.ordem) || 0) ||
          (a.nome || '').localeCompare(b.nome || ''),
      )
  }, [rotas, chamadaSel])

  // Mapa escola → rota (paradas_rota), mesma fonte da Consolidação Final
  const escolaRotaMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of paradasRota) {
      const rotaId = p.rota_id || (p as unknown as { rota_logistica_id?: string }).rota_logistica_id
      if (rotaId && !map.has(p.escola_id)) map.set(p.escola_id, rotaId)
    }
    return map
  }, [paradasRota])

  // Linhas da tabela: mesma base da Consolidação Final (pedidos → itens → produto)
  const linhas = useMemo(() => {
    const porProduto = new Map<string, LinhaProduto>()
    const rotasIds = new Set(rotasDoRecorte.map((r) => r.id))

    for (const order of ordersRecorte) {
      for (const item of order.items) {
        let linha = porProduto.get(item.productId)
        if (!linha) {
          const prod = products.find((p) => p.id === item.productId)
          if (!prod) continue
          linha = {
            produtoId: prod.id,
            nome: prod.name,
            unidade: prod.unit || '',
            total: 0,
            porRota: {},
          }
          porProduto.set(prod.id, linha)
        }
        const qtd = Number(item.quantity) || 0
        if (qtd <= 0) continue
        linha.total += qtd

        const rotaDoPedido =
          (order.rotaLogisticaId && rotasIds.has(order.rotaLogisticaId) && order.rotaLogisticaId) ||
          (order.rotaId && rotasIds.has(order.rotaId) && order.rotaId) ||
          escolaRotaMap.get(order.schoolId) ||
          ''
        if (rotaDoPedido && rotasIds.has(rotaDoPedido)) {
          linha.porRota[rotaDoPedido] = (linha.porRota[rotaDoPedido] || 0) + qtd
        }
      }
    }

    return [...porProduto.values()]
      .filter((l) => l.total > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [ordersRecorte, products, rotasDoRecorte, escolaRotaMap])

  // TOTAL GERAL (primeira linha): total por coluna
  const totalGeral = useMemo(() => {
    const porRota: Record<string, number> = {}
    let total = 0
    for (const l of linhas) {
      total += l.total
      for (const r of rotasDoRecorte) {
        porRota[r.id] = (porRota[r.id] || 0) + (l.porRota[r.id] || 0)
      }
    }
    return { total, porRota }
  }, [linhas, rotasDoRecorte])

  const chamadaNome = useMemo(
    () => chamadas.find((ch) => ch.id === chamadaSel)?.chamada || '',
    [chamadas, chamadaSel],
  )

  const carregando = !dataEntregaSel && datasEntregaAgregadas.length > 0

  // ---------------------------------------------------------------------------
  // Distribuição gravada (cartão "Comprar") + pedidos de compra por fornecedor
  // ---------------------------------------------------------------------------
  const [distribuicao, setDistribuicao] = useState<CompraDistribuicaoRecord[]>([])
  const [distribuicaoCarregada, setDistribuicaoCarregada] = useState(false)
  const [cartaoAberto, setCartaoAberto] = useState(false)
  const [produtoCartao, setProdutoCartao] = useState<LinhaProduto | null>(null)

  const recarregarDistribuicao = useCallback(async () => {
    if (!activeCiclo?.id) {
      setDistribuicao([])
      setDistribuicaoCarregada(true)
      return
    }
    try {
      const recs = await compraDistribuicaoService.listByCiclo(activeCiclo.id)
      setDistribuicao(recs)
    } catch {
      setDistribuicao([])
    } finally {
      setDistribuicaoCarregada(true)
    }
  }, [activeCiclo?.id])

  useEffect(() => {
    recarregarDistribuicao()
  }, [recarregarDistribuicao])

  const abrirCartao = (linha: LinhaProduto) => {
    setProdutoCartao(linha)
    setCartaoAberto(true)
  }

  // Recorte atual (data de entrega + chamada): as linhas gravadas carregam
  // data_entrega + chamada_id, então filtramos por esses campos. A data é
  // normalizada dos DOIS lados (slice 0-10): Order.date e data_entrega chegam
  // do PocketBase como "yyyy-mm-dd HH:mm:ss.mmmZ" e casa apenas o dia.
  const distribuicaoRecorte = useMemo(() => {
    return distribuicao.filter((d) => {
      if (dataEntregaSel && (d.data_entrega || '') !== normalizarDataISO(dataEntregaSel))
        return false
      if (chamadaSel && (d.chamada_id || '') !== chamadaSel) return false
      return true
    })
  }, [distribuicao, dataEntregaSel, chamadaSel])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consolidação para Compras</h1>
          <p className="text-muted-foreground text-sm">
            Totais por produto e rota para a data de entrega selecionada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            {dataEntregaSel
              ? `Nenhum pedido para ${formatarDataEntrega(dataEntregaSel)}${
                  chamadaNome ? ` · ${chamadaNome}` : ''
                }.`
              : 'Nenhuma data de entrega com pedidos em ciclos abertos.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="min-w-[220px]">Produto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {rotasDoRecorte.map((r) => (
                    <TableHead key={r.id} className="text-right whitespace-nowrap">
                      {(r.nome || 'Rota').toUpperCase()}
                    </TableHead>
                  ))}
                  <TableHead className="text-right w-24">Comprar</TableHead>
                  <TableHead className="text-right">TOTAL GERAL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Linha TOTAL GERAL — primeira linha do relatório */}
                <TableRow className="bg-primary/10 font-bold hover:bg-primary/10">
                  <TableCell className="font-bold">TOTAL GERAL</TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {formatQty(totalGeral.total)}
                  </TableCell>
                  {rotasDoRecorte.map((r) => (
                    <TableCell key={r.id} className="text-right font-mono font-bold">
                      {formatQty(totalGeral.porRota[r.id] || 0)}
                    </TableCell>
                  ))}
                  <TableCell />
                  <TableCell className="text-right font-mono font-bold">
                    {formatQty(totalGeral.total)}
                  </TableCell>
                </TableRow>
                {linhas.map((l) => (
                  <TableRow key={l.produtoId}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {l.nome}
                      {l.unidade ? ` (${l.unidade})` : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatQty(l.total)}</TableCell>
                    <TableCell className="w-24 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => abrirCartao(l)}
                        aria-label={`Comprar ${l.nome}`}
                      >
                        Comprar
                      </Button>
                    </TableCell>
                    {rotasDoRecorte.map((r) => {
                      const qtd = l.porRota[r.id] || 0
                      return (
                        <TableCell key={r.id} className="text-right font-mono">
                          {qtd > 0 ? (
                            formatQty(qtd)
                          ) : (
                            <span className="text-muted-foreground/40">–</span>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right font-mono">{formatQty(l.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Mesma base de dados da Consolidação Final. Pedidos cancelados e ciclos fechados/cancelados
        não entram no total.
      </p>

      {/* Pedidos de compra por fornecedor (linhas gravadas do recorte atual) */}
      <PedidosCompraSection
        distribuicao={distribuicaoRecorte}
        chamadaNome={chamadaNome}
        dataEntrega={dataEntregaSel}
        carregada={distribuicaoCarregada}
      />

      {/* Cartão "Comprar" — distribuição por fornecedor */}
      {produtoCartao && (
        <CartaoComprarDialog
          open={cartaoAberto}
          onOpenChange={setCartaoAberto}
          produtoId={produtoCartao.produtoId}
          produtoNome={produtoCartao.nome}
          unidade={produtoCartao.unidade}
          quantidadeTotal={produtoCartao.total}
          cicloId={activeCiclo?.id || ''}
          dataEntrega={dataEntregaSel}
          chamadaId={chamadaSel}
          onDistribuicaoGravada={recarregarDistribuicao}
        />
      )}
    </div>
  )
}
