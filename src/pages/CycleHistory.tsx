import { useState, useMemo } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  History,
  Calendar,
  School,
  Package,
  Layers,
  ArrowUpDown,
  Search,
  CheckCircle2,
  Clock,
  Eye,
  BarChart2,
} from 'lucide-react'
import type { CicloRecord } from '@/lib/types'

export default function CycleHistory() {
  const { ciclos, orders, products, schools } = useApp()

  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [filtroNome, setFiltroNome] = useState('')

  // Detalhes do ciclo selecionado
  const [selectedCiclo, setSelectedCiclo] = useState<CicloRecord | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Comparação entre dois ciclos
  const [compareCicloAId, setCompareCicloAId] = useState<string>('')
  const [compareCicloBId, setCompareCicloBId] = useState<string>('')
  const [compareOpen, setCompareOpen] = useState(false)

  // Filtragem de ciclos
  const filteredCiclos = useMemo(() => {
    return ciclos.filter((c) => {
      if (filtroNome.trim()) {
        if (!c.nome.toLowerCase().includes(filtroNome.toLowerCase())) return false
      }
      if (dataInicio && c.data_inicio < dataInicio) return false
      if (dataFim && c.data_fim > dataFim) return false
      return true
    })
  }, [ciclos, filtroNome, dataInicio, dataFim])

  // Estatísticas calculadas por ciclo
  const ciclosStats = useMemo(() => {
    const map: Record<
      string,
      {
        pedidosCount: number
        escolasCount: number
        itensCount: number
        valorTotal: number
      }
    > = {}

    for (const c of ciclos) {
      const cOrders = orders.filter((o) => o.cicloId === c.id && o.status !== 'Cancelado')
      const schoolSet = new Set(cOrders.map((o) => o.schoolId))
      let totalQtd = 0
      let totalVal = 0

      for (const o of cOrders) {
        totalVal += o.total
        for (const item of o.items) {
          totalQtd += Number(item.quantity) || 0
        }
      }

      map[c.id] = {
        pedidosCount: cOrders.length,
        escolasCount: schoolSet.size,
        itensCount: totalQtd,
        valorTotal: totalVal,
      }
    }

    return map
  }, [ciclos, orders])

  const handleOpenDetails = (c: CicloRecord) => {
    setSelectedCiclo(c)
    setDetailsOpen(true)
  }

  // Dados para comparação de consumo entre ciclos A e B
  const comparisonData = useMemo(() => {
    if (!compareCicloAId || !compareCicloBId) return []

    const cicloAOrders = orders.filter(
      (o) => o.cicloId === compareCicloAId && o.status !== 'Cancelado',
    )
    const cicloBOrders = orders.filter(
      (o) => o.cicloId === compareCicloBId && o.status !== 'Cancelado',
    )

    const mapA: Record<string, number> = {}
    for (const o of cicloAOrders) {
      for (const it of o.items) {
        mapA[it.productId] = (mapA[it.productId] || 0) + it.quantity
      }
    }

    const mapB: Record<string, number> = {}
    for (const o of cicloBOrders) {
      for (const it of o.items) {
        mapB[it.productId] = (mapB[it.productId] || 0) + it.quantity
      }
    }

    return products.map((p) => {
      const qtdA = mapA[p.id] || 0
      const qtdB = mapB[p.id] || 0
      const diff = qtdB - qtdA
      const percent = qtdA > 0 ? (diff / qtdA) * 100 : qtdB > 0 ? 100 : 0
      return {
        id: p.id,
        nome: p.name,
        unidade: p.unit,
        qtdA,
        qtdB,
        diff,
        percent,
      }
    })
  }, [compareCicloAId, compareCicloBId, orders, products])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Ciclos</h1>
          <p className="text-muted-foreground">
            Acompanhe a evolução de fechamento semanal, escolas atendidas e compare o consumo.
          </p>
        </div>

        {ciclos.length >= 2 && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setCompareCicloAId(ciclos[1]?.id || ciclos[0]?.id)
              setCompareCicloBId(ciclos[0]?.id)
              setCompareOpen(true)
            }}
          >
            <BarChart2 className="h-4 w-4 text-primary" /> Comparar Ciclos
          </Button>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Buscar por nome</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ex: Ciclo 01..."
                  value={filtroNome}
                  onChange={(e) => setFiltroNome(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Data Início (a partir de)</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Data Fim (até)</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Ciclos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Ciclos Registrados
          </CardTitle>
          <CardDescription>
            Relação cronológica dos ciclos semanais de coleta, correção e fechamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Fase / Status</TableHead>
                  <TableHead className="text-center">Escolas Atendidas</TableHead>
                  <TableHead className="text-center">Pedidos</TableHead>
                  <TableHead className="text-right">Volume Consolidado</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCiclos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum ciclo encontrado com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCiclos.map((c) => {
                    const st = ciclosStats[c.id] || {
                      pedidosCount: 0,
                      escolasCount: 0,
                      itensCount: 0,
                      valorTotal: 0,
                    }

                    const statusBadge =
                      c.status === 'coletando' ? (
                        <Badge className="bg-blue-600 hover:bg-blue-700">Coletando</Badge>
                      ) : c.status === 'correcao' ? (
                        <Badge className="bg-amber-600 hover:bg-amber-700">Correção</Badge>
                      ) : (
                        <Badge variant="secondary">Fechado</Badge>
                      )

                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-semibold text-primary">{c.nome}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(c.data_inicio).toLocaleDateString('pt-BR')} a{' '}
                          {new Date(c.data_fim).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>{statusBadge}</TableCell>
                        <TableCell className="text-center font-medium">{st.escolasCount}</TableCell>
                        <TableCell className="text-center font-medium">{st.pedidosCount}</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {st.itensCount} itens / Kg
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          R${' '}
                          {st.valorTotal.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDetails(c)}
                            className="gap-1 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5" /> Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Detalhes do Ciclo */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCiclo?.nome}</DialogTitle>
            <DialogDescription>
              Período de{' '}
              {selectedCiclo && new Date(selectedCiclo.data_inicio).toLocaleDateString('pt-BR')} a{' '}
              {selectedCiclo && new Date(selectedCiclo.data_fim).toLocaleDateString('pt-BR')} •
              Status: {selectedCiclo?.status}
            </DialogDescription>
          </DialogHeader>

          {selectedCiclo && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Escolas Atendidas</p>
                    <p className="text-lg font-bold text-primary">
                      {ciclosStats[selectedCiclo.id]?.escolasCount || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Volume Consolidado</p>
                    <p className="text-lg font-bold text-primary">
                      {ciclosStats[selectedCiclo.id]?.itensCount || 0} itens
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Valor Previsto</p>
                    <p className="text-lg font-bold text-foreground">
                      R$ {(ciclosStats[selectedCiclo.id]?.valorTotal || 0).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Pedidos Vinculados a este Ciclo</h4>
                <div className="rounded border max-h-[280px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Escola</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders
                        .filter((o) => o.cicloId === selectedCiclo.id)
                        .map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-medium text-xs">{o.numero}</TableCell>
                            <TableCell className="text-xs">{o.schoolName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {o.origem}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{o.status}</TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              R$ {o.total.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Comparação de Consumo entre Dois Ciclos */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" /> Comparação de Consumo entre Ciclos
            </DialogTitle>
            <DialogDescription>
              Analise a variação percentual e de volume de cada produto agrícola entre dois
              períodos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Ciclo Base (A)</Label>
                <select
                  value={compareCicloAId}
                  onChange={(e) => setCompareCicloAId(e.target.value)}
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ciclos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Ciclo Comparado (B)</Label>
                <select
                  value={compareCicloBId}
                  onChange={(e) => setCompareCicloBId(e.target.value)}
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ciclos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-md border max-h-[350px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Ciclo Base (A)</TableHead>
                    <TableHead className="text-right">Ciclo B</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead className="text-right">Variação %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.map((row) => {
                    const diffColor =
                      row.diff > 0
                        ? 'text-emerald-600 font-semibold'
                        : row.diff < 0
                          ? 'text-rose-600 font-semibold'
                          : 'text-muted-foreground'

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-xs">
                          {row.nome} ({row.unidade})
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{row.qtdA}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{row.qtdB}</TableCell>
                        <TableCell className={`text-right font-mono text-xs ${diffColor}`}>
                          {row.diff > 0 ? `+${row.diff}` : row.diff}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs ${diffColor}`}>
                          {row.percent > 0
                            ? `+${row.percent.toFixed(1)}%`
                            : `${row.percent.toFixed(1)}%`}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
