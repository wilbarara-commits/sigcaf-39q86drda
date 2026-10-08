import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  Building2,
  FileSpreadsheet,
  PhoneCall,
  Scale,
  DollarSign,
  TrendingUp,
  CheckSquare,
  Square,
  Layers,
} from 'lucide-react'
import type { CicloRecord, Order, Product, School, ChamadaRecord, Contract } from '@/lib/types'

export type DimensionMode = 'escolas' | 'chamadas' | 'contratos'

interface ConsumptionComparisonProps {
  ciclos: CicloRecord[]
  orders: Order[]
  products: Product[]
  schools: School[]
  chamadas: ChamadaRecord[]
  contracts: Contract[]
}

const PALETTE = [
  '#2563eb', // blue-600
  '#16a34a', // green-600
  '#dc2626', // red-600
  '#d97706', // amber-600
  '#9333ea', // purple-600
  '#0891b2', // cyan-600
  '#e11d48', // rose-600
  '#4f46e5', // indigo-600
  '#059669', // emerald-600
  '#ea580c', // orange-600
  '#0284c7', // light blue
  '#7c3aed', // violet
]

export function ConsumptionComparison({
  ciclos,
  orders,
  products,
  schools,
  chamadas,
  contracts,
}: ConsumptionComparisonProps) {
  // Dimensão atual: Escolas, Chamadas ou Contratos
  const [dimensao, setDimensao] = useState<DimensionMode>('escolas')

  // Janela de ciclos (4, 8 ou 12)
  const [numCiclos, setNumCiclos] = useState<number>(4)

  // Produto selecionado
  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    return products[0]?.id || ''
  })

  // Seleções ativas por dimensão
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([])
  const [selectedChamadaIds, setSelectedChamadaIds] = useState<string[]>([])
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([])

  // Busca do filtro na lista lateral de checkboxes
  const [buscaItem, setBuscaItem] = useState('')

  // Ciclos ordenados cronologicamente (mais antigos para mais recentes para o gráfico caminhar para frente)
  // Pegamos os últimos N ciclos ordenando por data_inicio decrescente, pegamos N e invertemos
  const recentCiclos = useMemo(() => {
    const valid = ciclos.filter((c) => c.status !== 'cancelado')
    const sortedDesc = [...valid].sort((a, b) => {
      const dtA = a.data_inicio || a.created || ''
      const dtB = b.data_inicio || b.created || ''
      return dtB.localeCompare(dtA)
    })
    const slice = sortedDesc.slice(0, numCiclos)
    return slice.reverse()
  }, [ciclos, numCiclos])

  // Identificador do ciclo -> label amigável no eixo X
  const cicloLabels = useMemo(() => {
    const map = new Map<string, string>()
    recentCiclos.forEach((c) => {
      map.set(c.id, c.nome)
    })
    return map
  }, [recentCiclos])

  // Produto atualmente ativo
  const currentProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || products[0]
  }, [products, selectedProductId])

  // Inicializar seleção do produto quando lista estiver pronta
  useMemo(() => {
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id)
    }
  }, [products, selectedProductId])

  // Mapa de escolas por ID para acesso rápido
  const schoolsMap = useMemo(() => {
    const map = new Map<string, School>()
    schools.forEach((s) => map.set(s.id, s))
    return map
  }, [schools])

  // Mapa de chamadas por ID
  const chamadasMap = useMemo(() => {
    const map = new Map<string, ChamadaRecord>()
    chamadas.forEach((ch) => map.set(ch.id, ch))
    return map
  }, [chamadas])

  // Mapa de contratos por ID
  const contractsMap = useMemo(() => {
    const map = new Map<string, Contract>()
    contracts.forEach((ct) => map.set(ct.id, ct))
    return map
  }, [contracts])

  // Mapeamento escola -> contratoId (a partir de contracts.escolas)
  const schoolToContractMap = useMemo(() => {
    const map = new Map<string, string>()
    contracts.forEach((ct) => {
      ct.escolas?.forEach((escLink) => {
        if (!escLink.encerrado_em) {
          map.set(escLink.escolaId, ct.id)
        }
      })
    })
    return map
  }, [contracts])

  // Mapeamento contrato -> chamadaId
  const contractToChamadaMap = useMemo(() => {
    const map = new Map<string, string>()
    contracts.forEach((ct) => {
      if (ct.chamada_id) {
        map.set(ct.id, ct.chamada_id)
      }
    })
    return map
  }, [contracts])

  // Mapeamento ciclo -> chamadaId
  const cicloToChamadaMap = useMemo(() => {
    const map = new Map<string, string>()
    ciclos.forEach((c) => {
      if (c.chamada_id) {
        map.set(c.id, c.chamada_id)
      }
    })
    return map
  }, [ciclos])

  // Resolver chamadaId de um pedido com segurança e robustez:
  // 1. o.chamadaId explícito
  // 2. chamada do ciclo vinculado (c.chamada_id)
  // 3. chamada do contrato da escola do pedido
  const getOrderChamadaId = (o: Order): string | undefined => {
    if (o.chamadaId) return o.chamadaId
    if (o.cicloId && cicloToChamadaMap.has(o.cicloId)) {
      return cicloToChamadaMap.get(o.cicloId)
    }
    const cId = schoolToContractMap.get(o.schoolId)
    if (cId && contractToChamadaMap.has(cId)) {
      return contractToChamadaMap.get(cId)
    }
    return undefined
  }

  // Resolver contratoId de um pedido com segurança:
  // 1. contrato da escola em contracts.escolas
  // 2. caso o pedido pertença a chamada que tenha 1 único contrato ativo
  const getOrderContractId = (o: Order): string | undefined => {
    const direct = schoolToContractMap.get(o.schoolId)
    if (direct) return direct
    const chId = getOrderChamadaId(o)
    if (chId) {
      const chContracts = contracts.filter(
        (ct) => ct.chamada_id === chId && ct.status !== 'Cancelado',
      )
      if (chContracts.length === 1) return chContracts[0].id
    }
    return undefined
  }

  // Lista de Escolas com dados ou disponíveis
  const availableSchools = useMemo(() => {
    return [...schools].sort((a, b) => a.name.localeCompare(b.name))
  }, [schools])

  // Lista de Chamadas disponíveis
  const availableChamadas = useMemo(() => {
    return [...chamadas].sort((a, b) => a.chamada.localeCompare(b.chamada))
  }, [chamadas])

  // Lista de Contratos disponíveis
  const availableContracts = useMemo(() => {
    return [...contracts].sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
  }, [contracts])

  // Inicializar seleções padrões se vazias
  useMemo(() => {
    if (selectedSchoolIds.length === 0 && availableSchools.length > 0) {
      setSelectedSchoolIds(availableSchools.slice(0, 5).map((s) => s.id))
    }
  }, [availableSchools, selectedSchoolIds.length])

  useMemo(() => {
    if (selectedChamadaIds.length === 0 && availableChamadas.length > 0) {
      setSelectedChamadaIds(availableChamadas.slice(0, 5).map((ch) => ch.id))
    }
  }, [availableChamadas, selectedChamadaIds.length])

  useMemo(() => {
    if (selectedContractIds.length === 0 && availableContracts.length > 0) {
      setSelectedContractIds(availableContracts.slice(0, 5).map((ct) => ct.id))
    }
  }, [availableContracts, selectedContractIds.length])

  // Pedidos elegíveis dos ciclos recentes
  const recentCycleIds = useMemo(() => new Set(recentCiclos.map((c) => c.id)), [recentCiclos])

  const eligibleOrders = useMemo(() => {
    return orders.filter(
      (o) => o.cicloId && recentCycleIds.has(o.cicloId) && o.status !== 'Cancelado',
    )
  }, [orders, recentCycleIds])

  // Entidades selecionadas na dimensão atual
  const activeEntities = useMemo(() => {
    if (dimensao === 'escolas') {
      return selectedSchoolIds
        .map((id) => {
          const sch = schoolsMap.get(id)
          return { id, label: sch?.name || `Escola #${id.slice(0, 6)}` }
        })
        .filter(Boolean)
    }
    if (dimensao === 'chamadas') {
      return selectedChamadaIds
        .map((id) => {
          const ch = chamadasMap.get(id)
          return { id, label: ch ? `Chamada ${ch.chamada}` : `Chamada #${id.slice(0, 6)}` }
        })
        .filter(Boolean)
    }
    // contratos
    return selectedContractIds
      .map((id) => {
        const ct = contractsMap.get(id)
        return { id, label: ct?.numero ? `Contrato ${ct.numero}` : `Contrato #${id.slice(0, 6)}` }
      })
      .filter(Boolean)
  }, [
    dimensao,
    selectedSchoolIds,
    selectedChamadaIds,
    selectedContractIds,
    schoolsMap,
    chamadasMap,
    contractsMap,
  ])

  // Cores fixadas por série/entidade
  const entityColors = useMemo(() => {
    const map = new Map<string, string>()
    activeEntities.forEach((ent, idx) => {
      map.set(ent.id, PALETTE[idx % PALETTE.length])
    })
    return map
  }, [activeEntities])

  // Montagem dos pontos dos gráficos para cada ciclo na janela
  // chartDataKg e chartDataReais: [{ cicloId, cicloNome, [entidadeId]: valor }]
  const { chartDataKg, chartDataReais, maxKg, maxReais } = useMemo(() => {
    const kgRows: Array<Record<string, any>> = []
    const reaisRows: Array<Record<string, any>> = []
    let peakKg = 0
    let peakReais = 0

    // Pré-agrupar pedidos por ciclo
    const ordersByCiclo = new Map<string, Order[]>()
    recentCiclos.forEach((c) => ordersByCiclo.set(c.id, []))
    eligibleOrders.forEach((o) => {
      if (o.cicloId && ordersByCiclo.has(o.cicloId)) {
        ordersByCiclo.get(o.cicloId)!.push(o)
      }
    })

    recentCiclos.forEach((c) => {
      const cOrders = ordersByCiclo.get(c.id) || []
      const cicloLabel = cicloLabels.get(c.id) || c.nome

      const kgRow: Record<string, any> = {
        cicloId: c.id,
        cicloNome: cicloLabel,
      }
      const reaisRow: Record<string, any> = {
        cicloId: c.id,
        cicloNome: cicloLabel,
      }

      // Inicializa 0 para todas as entidades ativas
      activeEntities.forEach((ent) => {
        kgRow[ent.id] = 0
        reaisRow[ent.id] = 0
      })

      cOrders.forEach((o) => {
        // Encontrar a qual entidade esse pedido pertence de acordo com a dimensão
        let matchedEntId: string | undefined

        if (dimensao === 'escolas') {
          matchedEntId = o.schoolId
        } else if (dimensao === 'chamadas') {
          matchedEntId = getOrderChamadaId(o)
        } else if (dimensao === 'contratos') {
          matchedEntId = getOrderContractId(o)
        }

        if (matchedEntId && kgRow[matchedEntId] !== undefined) {
          // 1. Quantidade em KG (itens do produto selecionado neste pedido)
          if (selectedProductId) {
            const itemMatches = o.items.filter((it) => it.productId === selectedProductId)
            for (const it of itemMatches) {
              kgRow[matchedEntId] += Number(it.quantity) || 0
            }
          }

          // 2. Valor canônico em R$ (o.total canônico do pedido)
          reaisRow[matchedEntId] += Number(o.total) || 0
        }
      })

      // Arredondamentos e cálculo dos picos
      activeEntities.forEach((ent) => {
        const valKg = Math.round((kgRow[ent.id] || 0) * 100) / 100
        const valReais = Math.round((reaisRow[ent.id] || 0) * 100) / 100
        kgRow[ent.id] = valKg
        reaisRow[ent.id] = valReais
        if (valKg > peakKg) peakKg = valKg
        if (valReais > peakReais) peakReais = valReais
      })

      kgRows.push(kgRow)
      reaisRows.push(reaisRow)
    })

    return {
      chartDataKg: kgRows,
      chartDataReais: reaisRows,
      maxKg: peakKg,
      maxReais: peakReais,
    }
  }, [
    recentCiclos,
    eligibleOrders,
    cicloLabels,
    activeEntities,
    dimensao,
    selectedProductId,
    schoolToContractMap,
    contractToChamadaMap,
    cicloToChamadaMap,
  ])

  // Funções de alternar seleção na lista lateral
  const toggleSchool = (id: string) => {
    setSelectedSchoolIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleChamada = (id: string) => {
    setSelectedChamadaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleContract = (id: string) => {
    setSelectedContractIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // Itens filtrados para exibição na lista lateral
  const filteredSideItems = useMemo(() => {
    const q = buscaItem.toLowerCase().trim()
    if (dimensao === 'escolas') {
      return availableSchools
        .filter((s) => !q || s.name.toLowerCase().includes(q))
        .map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: s.route ? `Rota: ${s.route}` : undefined,
          checked: selectedSchoolIds.includes(s.id),
        }))
    }
    if (dimensao === 'chamadas') {
      return availableChamadas
        .filter(
          (ch) =>
            !q ||
            ch.chamada.toLowerCase().includes(q) ||
            (ch.programa || '').toLowerCase().includes(q),
        )
        .map((ch) => ({
          id: ch.id,
          title: `Chamada ${ch.chamada}`,
          subtitle: ch.programa ? `Programa: ${ch.programa}` : undefined,
          checked: selectedChamadaIds.includes(ch.id),
        }))
    }
    return availableContracts
      .filter(
        (ct) =>
          !q ||
          (ct.numero || '').toLowerCase().includes(q) ||
          (ct.numero_chamada || '').toLowerCase().includes(q),
      )
      .map((ct) => ({
        id: ct.id,
        title: `Contrato ${ct.numero}`,
        subtitle: ct.numero_chamada ? `Chamada: ${ct.numero_chamada}` : undefined,
        checked: selectedContractIds.includes(ct.id),
      }))
  }, [
    dimensao,
    buscaItem,
    availableSchools,
    availableChamadas,
    availableContracts,
    selectedSchoolIds,
    selectedChamadaIds,
    selectedContractIds,
  ])

  const selectAll = () => {
    if (dimensao === 'escolas') {
      setSelectedSchoolIds(availableSchools.map((s) => s.id))
    } else if (dimensao === 'chamadas') {
      setSelectedChamadaIds(availableChamadas.map((ch) => ch.id))
    } else {
      setSelectedContractIds(availableContracts.map((ct) => ct.id))
    }
  }

  const unselectAll = () => {
    if (dimensao === 'escolas') {
      setSelectedSchoolIds([])
    } else if (dimensao === 'chamadas') {
      setSelectedChamadaIds([])
    } else {
      setSelectedContractIds([])
    }
  }

  const handleToggleItem = (id: string) => {
    if (dimensao === 'escolas') toggleSchool(id)
    else if (dimensao === 'chamadas') toggleChamada(id)
    else toggleContract(id)
  }

  const unidadeLabel = currentProduct?.unit || 'Kg'

  return (
    <div className="space-y-6">
      {/* Barra de Dimensões e Controles de Janela */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border bg-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Comparar por:</span>
          </div>

          <div className="inline-flex rounded-lg border bg-muted p-1">
            <button
              type="button"
              onClick={() => setDimensao('escolas')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dimensao === 'escolas'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Escolas
            </button>
            <button
              type="button"
              onClick={() => setDimensao('chamadas')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dimensao === 'chamadas'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PhoneCall className="h-3.5 w-3.5" />
              Chamadas
            </button>
            <button
              type="button"
              onClick={() => setDimensao('contratos')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dimensao === 'contratos'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Contratos
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Janela de análise:</span>
            <Select
              value={String(numCiclos)}
              onValueChange={(val) => setNumCiclos(Number(val) || 4)}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Últimos 4 Ciclos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">Últimos 4 Ciclos</SelectItem>
                <SelectItem value="8">Últimos 8 Ciclos</SelectItem>
                <SelectItem value="12">Últimos 12 Ciclos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Badge variant="outline" className="text-xs">
            {recentCiclos.length}{' '}
            {recentCiclos.length === 1 ? 'ciclo analisado' : 'ciclos analisados'}
          </Badge>
        </div>
      </div>

      {/* Grid Principal: Seletor lateral + Gráficos lado a lado/empilhados */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Lateral: Produto e Seleção de Itens da Dimensão */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Produto para comparar</span>
                {currentProduct && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {unidadeLabel}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Insumo agrícola analisado no gráfico de volume
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="w-full text-xs h-9">
                  <SelectValue placeholder="Selecione um produto..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} {p.unit ? `(${p.unit})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Lista de Seleção por Dimensão */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold capitalize">
                  {dimensao === 'escolas' && 'Escolas'}
                  {dimensao === 'chamadas' && 'Chamadas Públicas'}
                  {dimensao === 'contratos' && 'Contratos'}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={selectAll}
                    title="Selecionar todos"
                  >
                    <CheckSquare className="h-3 w-3 mr-1" />
                    Todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={unselectAll}
                    title="Limpar seleção"
                  >
                    <Square className="h-3 w-3 mr-1" />
                    Limpar
                  </Button>
                </div>
              </div>
              <CardDescription className="text-xs">
                Selecione as séries para exibir simultaneamente nos gráficos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {filteredSideItems.length > 7 && (
                <input
                  type="text"
                  placeholder={`Buscar ${dimensao}...`}
                  value={buscaItem}
                  onChange={(e) => setBuscaItem(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs border rounded-md mb-2 bg-background"
                />
              )}

              <div className="rounded-md border p-2 space-y-1.5 max-h-[380px] overflow-y-auto">
                {filteredSideItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    Nenhum item encontrado.
                  </p>
                ) : (
                  filteredSideItems.map((item) => {
                    const isChecked = item.checked
                    const color = isChecked ? entityColors.get(item.id) : undefined

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItem(item.id)}
                        className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer transition-colors text-xs ${
                          isChecked
                            ? 'bg-accent/40 hover:bg-accent/60 font-medium'
                            : 'hover:bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggleItem(item.id)}
                          className="mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {color && (
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color }}
                              />
                            )}
                            <span className="truncate">{item.title}</span>
                          </div>
                          {item.subtitle && (
                            <span className="text-[11px] text-muted-foreground block truncate">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="pt-2 text-right">
                <span className="text-[11px] text-muted-foreground">
                  {activeEntities.length}{' '}
                  {activeEntities.length === 1 ? 'série ativa' : 'séries ativas'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos Semelhantes: 1. Quantidade em KG | 2. Valor em R$ */}
        <div className="lg:col-span-8 space-y-6">
          {/* Gráfico 1: Volume em KG / Unidade do Produto */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" />
                    Tendência de Consumo ({currentProduct?.name || 'Insumo'}) — Últimos {numCiclos}{' '}
                    Ciclos
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Evolução do volume consumido em {unidadeLabel} por{' '}
                    {dimensao === 'escolas'
                      ? 'escola'
                      : dimensao === 'chamadas'
                        ? 'chamada pública'
                        : 'contrato'}{' '}
                    ao longo dos ciclos operacionais.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Pico: {maxKg.toLocaleString('pt-BR')} {unidadeLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {activeEntities.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center border border-dashed rounded-md text-xs text-muted-foreground">
                  Selecione ao menos um item na lista ao lado para exibir a tendência de consumo em{' '}
                  {unidadeLabel}.
                </div>
              ) : recentCiclos.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center border border-dashed rounded-md text-xs text-muted-foreground">
                  Nenhum ciclo registrado para comparação.
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartDataKg}
                      margin={{ top: 16, right: 24, left: 8, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                      <XAxis
                        dataKey="cicloNome"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                        unit={` ${unidadeLabel}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        formatter={(val: any, name: any) => {
                          const entity = activeEntities.find((e) => e.id === name)
                          const num = Number(val) || 0
                          return [
                            `${num.toLocaleString('pt-BR', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })} ${unidadeLabel}`,
                            entity?.label || name,
                          ]
                        }}
                        labelFormatter={(lbl) => `Ciclo: ${lbl}`}
                      />
                      <Legend
                        verticalAlign="bottom"
                        wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }}
                        formatter={(value) => {
                          const entity = activeEntities.find((e) => e.id === value)
                          return entity?.label || value
                        }}
                      />
                      {activeEntities.map((ent) => (
                        <Line
                          key={ent.id}
                          type="monotone"
                          dataKey={ent.id}
                          name={ent.id}
                          stroke={entityColors.get(ent.id) || '#2563eb'}
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 6, strokeWidth: 2 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 2: Valor Financeiro em R$ (Canônico order.total) */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    Valor Consolidado (R$) — Últimos {numCiclos} Ciclos
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Evolução do faturamento total canônico dos pedidos por{' '}
                    {dimensao === 'escolas'
                      ? 'escola'
                      : dimensao === 'chamadas'
                        ? 'chamada pública'
                        : 'contrato'}{' '}
                    (calculado a partir de order.total).
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50"
                >
                  Pico: R${' '}
                  {maxReais.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {activeEntities.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center border border-dashed rounded-md text-xs text-muted-foreground">
                  Selecione ao menos um item na lista ao lado para exibir a tendência financeira em
                  R$.
                </div>
              ) : recentCiclos.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center border border-dashed rounded-md text-xs text-muted-foreground">
                  Nenhum ciclo registrado para comparação.
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartDataReais}
                      margin={{ top: 16, right: 24, left: 16, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                      <XAxis
                        dataKey="cicloNome"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickFormatter={(val) =>
                          Number(val) >= 1000
                            ? `R$ ${(Number(val) / 1000).toFixed(0)}k`
                            : `R$ ${val}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        formatter={(val: any, name: any) => {
                          const entity = activeEntities.find((e) => e.id === name)
                          const num = Number(val) || 0
                          return [
                            `R$ ${num.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`,
                            entity?.label || name,
                          ]
                        }}
                        labelFormatter={(lbl) => `Ciclo: ${lbl}`}
                      />
                      <Legend
                        verticalAlign="bottom"
                        wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }}
                        formatter={(value) => {
                          const entity = activeEntities.find((e) => e.id === value)
                          return entity?.label || value
                        }}
                      />
                      {activeEntities.map((ent) => (
                        <Line
                          key={ent.id}
                          type="monotone"
                          dataKey={ent.id}
                          name={ent.id}
                          stroke={entityColors.get(ent.id) || '#2563eb'}
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 6, strokeWidth: 2 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
