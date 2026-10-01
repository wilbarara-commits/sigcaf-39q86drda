import { useState, useMemo } from 'react'
import { useApp } from '@/context/app-context'
import {
  FileSpreadsheet,
  FileDown,
  Calendar,
  Filter,
  DollarSign,
  TrendingUp,
  Package,
  CheckCircle2,
  AlertCircle,
  Building2,
  RefreshCw,
  Search,
  FileBarChart,
  School as SchoolIcon,
  CalendarCheck,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  exportToExcel,
  exportToPdf,
  formatCurrencyBRL,
  formatDateBR,
  type ReportFilterSummary,
  type TableExportColumn,
} from '@/lib/exportUtils'
import { MonthlyReportButton } from '@/components/MonthlyReportButton'
import { getMonthlyClosingStatus } from '@/lib/monthlyClosing'
import { BASE_PRODUCT_CATEGORIES, areCategoriesEqual } from '@/lib/productCsvImporter'

export default function Reports() {
  const { contracts, orders, schools, products, chamadas, isLoading, refreshData } = useApp()

  const availableCategories = useMemo(() => {
    const set = new Map<string, string>()
    BASE_PRODUCT_CATEGORIES.forEach((c) => {
      set.set(c.toLowerCase(), c)
    })
    products.forEach((p) => {
      if (p.category && p.category.trim()) {
        const trimmed = p.category.trim()
        const norm = trimmed.toLowerCase()
        if (!set.has(norm)) {
          set.set(norm, trimmed)
        }
      }
    })
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [products])

  // Tab state
  const [activeTab, setActiveTab] = useState<'faturamento' | 'entregas' | 'produtos'>('faturamento')

  // Global filters
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Report 1: Faturamento por Contrato specific filters
  const [filterPrograma, setFilterPrograma] = useState<string>('todos')
  const [filterStatusContrato, setFilterStatusContrato] = useState<string>('todos')
  const [filterChamada, setFilterChamada] = useState<string>('todas')
  const [modoExibicaoChamada, setModoExibicaoChamada] = useState<'todas' | 'somente_totais'>(
    'todas',
  )
  const [searchContrato, setSearchContrato] = useState<string>('')

  // Report 2: Entregas por Período specific filters
  const [filterEscola, setFilterEscola] = useState<string>('todas')
  const [searchPedido, setSearchPedido] = useState<string>('')

  // Report 3: Produtos Entregues specific filters
  const [filterCategoria, setFilterCategoria] = useState<string>('todas')
  const [searchProduto, setSearchProduto] = useState<string>('')

  // Quick Date Range Presets
  const setQuickRange = (range: 'all' | 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() // 0-indexed

    if (range === 'all') {
      setStartDate('')
      setEndDate('')
    } else if (range === 'thisMonth') {
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      setStartDate(firstDay.toISOString().split('T')[0])
      setEndDate(lastDay.toISOString().split('T')[0])
    } else if (range === 'lastMonth') {
      const firstDay = new Date(year, month - 1, 1)
      const lastDay = new Date(year, month, 0)
      setStartDate(firstDay.toISOString().split('T')[0])
      setEndDate(lastDay.toISOString().split('T')[0])
    } else if (range === 'thisYear') {
      setStartDate(`${year}-01-01`)
      setEndDate(`${year}-12-31`)
    }
  }

  /* =========================================================================
   * 1. REPORT: FATURAMENTO POR CONTRATO (Entregado x Saldo x Execução)
   * ========================================================================= */
  // Lista de chamadas únicas disponíveis nos contratos para o select de filtro
  const availableChamadas = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>()
    // Registra todas as chamadas conhecidas
    chamadas.forEach((ch) => {
      map.set(ch.id, { id: ch.id, label: ch.chamada || ch.id })
    })
    // Também extrai de contratos caso haja alguma chamada sem objeto correspondente
    contracts.forEach((c) => {
      if (c.chamada_id && !map.has(c.chamada_id)) {
        map.set(c.chamada_id, {
          id: c.chamada_id,
          label: c.chamadaNumero || c.numero_chamada || c.chamada_id,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [chamadas, contracts])

  const faturamentoData = useMemo(() => {
    return contracts
      .filter((c) => {
        // Filter programa
        if (filterPrograma !== 'todos' && (c.tipo || 'PNAE') !== filterPrograma) {
          return false
        }
        // Filter status
        if (filterStatusContrato !== 'todos' && c.status !== filterStatusContrato) {
          return false
        }
        // Filter chamada
        if (filterChamada !== 'todas') {
          const matchId = c.chamada_id === filterChamada
          const chObj = chamadas.find((ch) => ch.id === filterChamada)
          const matchLabel =
            chObj && (c.chamadaNumero === chObj.chamada || c.numero_chamada === chObj.chamada)
          if (!matchId && !matchLabel) {
            return false
          }
        }
        // Search text
        if (searchContrato.trim()) {
          const q = searchContrato.toLowerCase()
          const matchNum = c.numero.toLowerCase().includes(q)
          const matchSchool = c.escolas.some((e) => (e.escolaNome || '').toLowerCase().includes(q))
          const chObj = chamadas.find((ch) => ch.id === c.chamada_id)
          const rotuloChamada = chObj?.chamada || c.chamadaNumero || c.numero_chamada || ''
          const matchChamada = rotuloChamada.toLowerCase().includes(q)
          if (!matchNum && !matchSchool && !matchChamada) return false
        }
        return true
      })
      .map((c) => {
        // Calculate delivered/faturado for this contract's participating schools
        // Filtering by period if dates are selected
        const contractSchoolIds = new Set(c.escolas.map((e) => e.escolaId))
        const schoolOrders = orders.filter((o) => {
          if (!contractSchoolIds.has(o.schoolId)) return false
          if (o.status !== 'Entregue') return false
          if (startDate && o.date < startDate) return false
          if (endDate && o.date > endDate) return false
          return true
        })

        const totalEntregue = schoolOrders.reduce((sum, o) => sum + (o.total || 0), 0)
        const valorPactuado = c.totalValue || 0
        const saldoRestante = Math.max(0, valorPactuado - totalEntregue)
        const percentExecucao = valorPactuado > 0 ? (totalEntregue / valorPactuado) * 100 : 0

        const totalEscolas = c.escolas.length

        // Resolver rótulo da chamada vinculada
        const chObj = chamadas.find((ch) => ch.id === c.chamada_id)
        const chamadaIdentificador = chObj?.chamada || c.chamadaNumero || c.numero_chamada || '—'
        const chamadaKey =
          c.chamada_id || (chamadaIdentificador !== '—' ? chamadaIdentificador : '__sem_chamada__')

        return {
          id: c.id,
          numero: c.numero,
          tipo: c.tipo || 'PNAE',
          chamadaId: c.chamada_id || '',
          chamadaKey,
          chamadaNumero: chamadaIdentificador,
          escolaId: c.escolas[0]?.escolaId || '',
          totalEscolas,
          status: c.status,
          valorPactuado,
          totalEntregue,
          saldoRestante,
          percentExecucao: Math.min(100, Math.round(percentExecucao * 10) / 10),
          pedidosEntreguesCount: schoolOrders.length,
        }
      })
  }, [
    contracts,
    orders,
    chamadas,
    filterPrograma,
    filterStatusContrato,
    filterChamada,
    searchContrato,
    startDate,
    endDate,
  ])

  // Totalizadores por Chamada
  const faturamentoChamadaTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        chamadaKey: string
        chamadaNumero: string
        contratosCount: number
        totalEscolas: number
        valorPactuado: number
        totalEntregue: number
        saldoRestante: number
        percentExecucao: number
      }
    >()

    for (const row of faturamentoData) {
      const key = row.chamadaKey
      const existing = map.get(key) || {
        chamadaKey: key,
        chamadaNumero: row.chamadaNumero,
        contratosCount: 0,
        totalEscolas: 0,
        valorPactuado: 0,
        totalEntregue: 0,
        saldoRestante: 0,
        percentExecucao: 0,
      }
      existing.contratosCount += 1
      existing.totalEscolas += row.totalEscolas
      existing.valorPactuado += row.valorPactuado
      existing.totalEntregue += row.totalEntregue
      existing.saldoRestante += row.saldoRestante
      map.set(key, existing)
    }

    return Array.from(map.values()).map((tot) => {
      const pct = tot.valorPactuado > 0 ? (tot.totalEntregue / tot.valorPactuado) * 100 : 0
      return {
        ...tot,
        percentExecucao: Math.min(100, Math.round(pct * 10) / 10),
      }
    })
  }, [faturamentoData])

  const faturamentoTotals = useMemo(() => {
    const pactuado = faturamentoData.reduce((acc, row) => acc + row.valorPactuado, 0)
    const entregue = faturamentoData.reduce((acc, row) => acc + row.totalEntregue, 0)
    const saldo = faturamentoData.reduce((acc, row) => acc + row.saldoRestante, 0)
    const mediaExecucao = pactuado > 0 ? (entregue / pactuado) * 100 : 0
    const totalEscolas = faturamentoData.reduce((acc, row) => acc + row.totalEscolas, 0)

    return {
      pactuado,
      entregue,
      saldo,
      mediaExecucao: Math.min(100, Math.round(mediaExecucao * 10) / 10),
      count: faturamentoData.length,
      totalEscolas,
    }
  }, [faturamentoData])

  /* =========================================================================
   * 2. REPORT: ENTREGAS POR PERÍODO (Pedidos entregues consolidados)
   * ========================================================================= */
  const entregasData = useMemo(() => {
    return orders
      .filter((o) => {
        if (o.status !== 'Entregue') return false
        if (startDate && o.date < startDate) return false
        if (endDate && o.date > endDate) return false
        if (filterEscola !== 'todas' && o.schoolId !== filterEscola) return false
        if (searchPedido.trim()) {
          const q = searchPedido.toLowerCase()
          const matchNum = o.numero.toLowerCase().includes(q)
          const matchSchool = o.schoolName.toLowerCase().includes(q)
          if (!matchNum && !matchSchool) return false
        }
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [orders, startDate, endDate, filterEscola, searchPedido])

  // Consolidação por Escola
  const entregasConsolidadoPorEscola = useMemo(() => {
    const map = new Map<string, { escolaNome: string; pedidosCount: number; totalValor: number }>()

    for (const pedido of entregasData) {
      const existing = map.get(pedido.schoolId) || {
        escolaNome: pedido.schoolName,
        pedidosCount: 0,
        totalValor: 0,
      }
      existing.pedidosCount += 1
      existing.totalValor += pedido.total
      map.set(pedido.schoolId, existing)
    }

    return Array.from(map.entries())
      .map(([escolaId, data]) => ({
        escolaId,
        escolaNome: data.escolaNome,
        pedidosCount: data.pedidosCount,
        totalValor: data.totalValor,
      }))
      .sort((a, b) => b.totalValor - a.totalValor)
  }, [entregasData])

  const entregasTotals = useMemo(() => {
    const totalValor = entregasData.reduce((acc, row) => acc + (row.total || 0), 0)
    const totalItens = entregasData.reduce(
      (acc, row) => acc + row.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
      0,
    )
    return {
      totalValor,
      totalItens,
      totalPedidos: entregasData.length,
      totalEscolas: entregasConsolidadoPorEscola.length,
    }
  }, [entregasData, entregasConsolidadoPorEscola])

  /* =========================================================================
   * 3. REPORT: PRODUTOS ENTREGUES (Quantidade e valor por produto no período)
   * ========================================================================= */
  const produtosEntreguesData = useMemo(() => {
    // Collect all items from Entregue orders in date range
    const relevantOrders = orders.filter((o) => {
      if (o.status !== 'Entregue') return false
      if (startDate && o.date < startDate) return false
      if (endDate && o.date > endDate) return false
      if (filterEscola !== 'todas' && o.schoolId !== filterEscola) return false
      return true
    })

    const productMap = new Map<
      string,
      {
        produtoId: string
        nome: string
        categoria: string
        unidade: string
        quantidadeTotal: number
        valorTotal: number
        pedidosCount: number
      }
    >()

    for (const order of relevantOrders) {
      for (const item of order.items) {
        const prod = products.find((p) => p.id === item.productId)
        const categoria = prod?.category || 'Outros'
        const unidade = prod?.unit || 'Un'
        const nome = item.name || prod?.name || 'Produto'
        const preco = item.price || prod?.price || 0
        const qtd = item.quantity || 0
        const subtotal = preco * qtd

        // Apply category filter
        if (filterCategoria !== 'todas' && !areCategoriesEqual(categoria, filterCategoria)) {
          continue
        }

        // Apply text search
        if (searchProduto.trim() && !nome.toLowerCase().includes(searchProduto.toLowerCase())) {
          continue
        }

        const existing = productMap.get(item.productId) || {
          produtoId: item.productId,
          nome,
          categoria,
          unidade,
          quantidadeTotal: 0,
          valorTotal: 0,
          pedidosCount: 0,
        }

        existing.quantidadeTotal += qtd
        existing.valorTotal += subtotal
        existing.pedidosCount += 1
        productMap.set(item.productId, existing)
      }
    }

    return Array.from(productMap.values()).sort((a, b) => b.valorTotal - a.valorTotal)
  }, [orders, products, startDate, endDate, filterEscola, filterCategoria, searchProduto])

  const produtosTotals = useMemo(() => {
    const totalQtd = produtosEntreguesData.reduce((acc, p) => acc + p.quantidadeTotal, 0)
    const totalValor = produtosEntreguesData.reduce((acc, p) => acc + p.valorTotal, 0)
    return {
      totalQtd,
      totalValor,
      totalProdutos: produtosEntreguesData.length,
    }
  }, [produtosEntreguesData])

  /* =========================================================================
   * EXPORT DISPATCHERS
   * ========================================================================= */
  const getFilterSummaries = (): ReportFilterSummary[] => {
    const list: ReportFilterSummary[] = []
    if (startDate && endDate) {
      list.push({
        label: 'Período',
        value: `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`,
      })
    } else if (startDate) {
      list.push({ label: 'A partir de', value: formatDateBR(startDate) })
    } else if (endDate) {
      list.push({ label: 'Até', value: formatDateBR(endDate) })
    } else {
      list.push({ label: 'Período', value: 'Todo o histórico' })
    }

    if (activeTab === 'faturamento') {
      if (filterChamada !== 'todas') {
        const ch = availableChamadas.find((c) => c.id === filterChamada)
        list.push({ label: 'Chamada', value: ch?.label || filterChamada })
      }
      if (filterPrograma !== 'todos') list.push({ label: 'Programa', value: filterPrograma })
      if (filterStatusContrato !== 'todos')
        list.push({ label: 'Status do Contrato', value: filterStatusContrato })
      if (modoExibicaoChamada === 'somente_totais') {
        list.push({ label: 'Modo de Exibição', value: 'Somente totais de Chamada' })
      } else {
        list.push({ label: 'Modo de Exibição', value: 'Todas as linhas' })
      }
      if (searchContrato.trim())
        list.push({ label: 'Termo de Busca', value: searchContrato.trim() })
    } else if (activeTab === 'entregas') {
      if (filterEscola !== 'todas') {
        const esc = schools.find((s) => s.id === filterEscola)
        list.push({ label: 'Escola', value: esc?.name || 'Selecionada' })
      }
      if (searchPedido.trim()) list.push({ label: 'Termo de Busca', value: searchPedido.trim() })
    } else if (activeTab === 'produtos') {
      if (filterCategoria !== 'todas') list.push({ label: 'Categoria', value: filterCategoria })
      if (filterEscola !== 'todas') {
        const esc = schools.find((s) => s.id === filterEscola)
        list.push({ label: 'Escola', value: esc?.name || 'Selecionada' })
      }
      if (searchProduto.trim()) list.push({ label: 'Termo de Busca', value: searchProduto.trim() })
    }
    return list
  }

  const handleExportExcel = () => {
    try {
      const filters = getFilterSummaries()
      const nowStr = new Date().toISOString().split('T')[0]

      if (activeTab === 'faturamento') {
        const columns: TableExportColumn[] = [
          { header: 'Nº Contrato', key: 'numero', align: 'left', width: 28 },
          { header: 'Chamada', key: 'chamadaNumero', align: 'center', width: 14 },
          { header: 'Programa', key: 'tipo', align: 'center', width: 12 },
          { header: 'Total de Escolas', key: 'totalEscolas', align: 'right', width: 16 },
          { header: 'Status', key: 'status', align: 'center', width: 12 },
          { header: 'Valor Pactuado (R$)', key: 'valorPactuadoStr', align: 'right', width: 20 },
          { header: 'Total Entregue (R$)', key: 'totalEntregueStr', align: 'right', width: 20 },
          { header: 'Saldo Restante (R$)', key: 'saldoRestanteStr', align: 'right', width: 20 },
          { header: '% Execução', key: 'percentExecucaoStr', align: 'right', width: 14 },
        ]

        let rows: any[] = []

        if (modoExibicaoChamada === 'somente_totais') {
          rows = faturamentoChamadaTotals.map((tot) => ({
            numero: `TOTAL Chamada ${tot.chamadaNumero}: ${formatCurrencyBRL(tot.valorPactuado)}`,
            chamadaNumero: tot.chamadaNumero,
            tipo: '—',
            totalEscolas: tot.totalEscolas,
            status: `${tot.contratosCount} contrato(s)`,
            valorPactuadoStr: formatCurrencyBRL(tot.valorPactuado),
            totalEntregueStr: formatCurrencyBRL(tot.totalEntregue),
            saldoRestanteStr: formatCurrencyBRL(tot.saldoRestante),
            percentExecucaoStr: `${tot.percentExecucao.toFixed(1)}%`,
          }))
        } else {
          // Todas as linhas: contratos individuais + linhas de total por chamada
          const contractRows = faturamentoData.map((d) => ({
            numero: d.numero,
            chamadaNumero: d.chamadaNumero,
            tipo: d.tipo,
            totalEscolas: d.totalEscolas,
            status: d.status,
            valorPactuadoStr: formatCurrencyBRL(d.valorPactuado),
            totalEntregueStr: formatCurrencyBRL(d.totalEntregue),
            saldoRestanteStr: formatCurrencyBRL(d.saldoRestante),
            percentExecucaoStr: `${d.percentExecucao.toFixed(1)}%`,
          }))

          const totalChamadaRows = faturamentoChamadaTotals.map((tot) => ({
            numero: `TOTAL Chamada ${tot.chamadaNumero}: ${formatCurrencyBRL(tot.valorPactuado)}`,
            chamadaNumero: tot.chamadaNumero,
            tipo: '—',
            totalEscolas: tot.totalEscolas,
            status: `${tot.contratosCount} contrato(s)`,
            valorPactuadoStr: formatCurrencyBRL(tot.valorPactuado),
            totalEntregueStr: formatCurrencyBRL(tot.totalEntregue),
            saldoRestanteStr: formatCurrencyBRL(tot.saldoRestante),
            percentExecucaoStr: `${tot.percentExecucao.toFixed(1)}%`,
          }))

          rows = [...contractRows, ...totalChamadaRows]
        }

        const footerRows = [
          {
            numero: 'TOTAL CONSOLIDADO',
            chamadaNumero: '',
            tipo: `${faturamentoTotals.count} Contratos`,
            totalEscolas: faturamentoTotals.totalEscolas,
            status: '',
            valorPactuadoStr: formatCurrencyBRL(faturamentoTotals.pactuado),
            totalEntregueStr: formatCurrencyBRL(faturamentoTotals.entregue),
            saldoRestanteStr: formatCurrencyBRL(faturamentoTotals.saldo),
            percentExecucaoStr: `${faturamentoTotals.mediaExecucao.toFixed(1)}%`,
          },
        ]

        exportToExcel({
          title: 'Relatório Contábil — Faturamento por Contrato e Chamada',
          subtitle:
            'Resumo de valores pactuados, faturados e saldos remanescentes por contrato e chamada',
          filename: `relatorio-faturamento-contratos-chamada-${nowStr}`,
          filters,
          columns,
          rows,
          summaryCards: [
            { label: 'Total Pactuado', value: formatCurrencyBRL(faturamentoTotals.pactuado) },
            {
              label: 'Total Entregue / Faturado',
              value: formatCurrencyBRL(faturamentoTotals.entregue),
            },
            { label: 'Saldo Restante', value: formatCurrencyBRL(faturamentoTotals.saldo) },
            { label: 'Média de Execução', value: `${faturamentoTotals.mediaExecucao.toFixed(1)}%` },
          ],
          footerRows,
        })
      } else if (activeTab === 'entregas') {
        const columns: TableExportColumn[] = [
          { header: 'Nº Pedido', key: 'numero', align: 'left', width: 14 },
          { header: 'Data Entrega', key: 'dateStr', align: 'center', width: 14 },
          { header: 'Escola / Destino', key: 'schoolName', align: 'left', width: 30 },
          { header: 'Qtd Itens', key: 'qtdItens', align: 'center', width: 12 },
          { header: 'Valor Total (R$)', key: 'totalStr', align: 'right', width: 18 },
          { header: 'Status', key: 'status', align: 'center', width: 12 },
        ]

        const rows = entregasData.map((d) => ({
          numero: d.numero,
          dateStr: formatDateBR(d.date),
          schoolName: d.schoolName,
          qtdItens: d.items.length,
          totalStr: formatCurrencyBRL(d.total),
          status: d.status,
        }))

        const footerRows = [
          {
            numero: 'TOTAL GERAL',
            dateStr: '',
            schoolName: `${entregasTotals.totalEscolas} Escolas atendidas`,
            qtdItens: entregasTotals.totalItens,
            totalStr: formatCurrencyBRL(entregasTotals.totalValor),
            status: `${entregasTotals.totalPedidos} Pedidos`,
          },
        ]

        exportToExcel({
          title: 'Relatório Contábil — Entregas Realizadas no Período',
          subtitle: 'Relação de pedidos concluídos e faturados para comprovação contábil',
          filename: `relatorio-entregas-periodo-${nowStr}`,
          filters,
          columns,
          rows,
          summaryCards: [
            { label: 'Total de Pedidos', value: String(entregasTotals.totalPedidos) },
            { label: 'Escolas Atendidas', value: String(entregasTotals.totalEscolas) },
            { label: 'Valor Total Entregue', value: formatCurrencyBRL(entregasTotals.totalValor) },
          ],
          footerRows,
        })
      } else if (activeTab === 'produtos') {
        const columns: TableExportColumn[] = [
          { header: 'Produto', key: 'nome', align: 'left', width: 28 },
          { header: 'Categoria', key: 'categoria', align: 'left', width: 16 },
          { header: 'Unidade', key: 'unidade', align: 'center', width: 10 },
          { header: 'Qtd Entregue', key: 'quantidadeTotal', align: 'right', width: 14 },
          { header: 'Nº Entregas', key: 'pedidosCount', align: 'center', width: 12 },
          { header: 'Valor Total (R$)', key: 'valorTotalStr', align: 'right', width: 18 },
        ]

        const rows = produtosEntreguesData.map((d) => ({
          nome: d.nome,
          categoria: d.categoria,
          unidade: d.unidade,
          quantidadeTotal: d.quantidadeTotal,
          pedidosCount: d.pedidosCount,
          valorTotalStr: formatCurrencyBRL(d.valorTotal),
        }))

        const footerRows = [
          {
            nome: 'TOTAL GERAL',
            categoria: `${produtosTotals.totalProdutos} Produtos`,
            unidade: '',
            quantidadeTotal: produtosTotals.totalQtd,
            pedidosCount: '',
            valorTotalStr: formatCurrencyBRL(produtosTotals.totalValor),
          },
        ]

        exportToExcel({
          title: 'Relatório Contábil — Produtos Entregues no Período',
          subtitle: 'Conferência de itens de cardápio, editais PNAE/PAA e faturamento',
          filename: `relatorio-produtos-entregues-${nowStr}`,
          filters,
          columns,
          rows,
          summaryCards: [
            { label: 'Produtos Distintos', value: String(produtosTotals.totalProdutos) },
            { label: 'Qtd Total Distribuída', value: String(produtosTotals.totalQtd) },
            { label: 'Valor Total', value: formatCurrencyBRL(produtosTotals.totalValor) },
          ],
          footerRows,
        })
      }

      toast.success('Arquivo Excel (.xlsx) gerado e baixado com sucesso!')
    } catch (err: any) {
      console.error('Erro ao exportar Excel:', err)
      toast.error('Ocorreu um erro ao gerar o arquivo Excel.')
    }
  }

  const handleExportPdf = () => {
    try {
      const filters = getFilterSummaries()
      const nowStr = new Date().toISOString().split('T')[0]

      if (activeTab === 'faturamento') {
        const columns: TableExportColumn[] = [
          { header: 'Contrato', key: 'numero', align: 'left' },
          { header: 'Chamada', key: 'chamadaNumero', align: 'center' },
          { header: 'Programa', key: 'tipo', align: 'center' },
          { header: 'Total Escolas', key: 'totalEscolas', align: 'right' },
          { header: 'Status', key: 'status', align: 'center' },
          { header: 'Pactuado', key: 'valorPactuadoStr', align: 'right' },
          { header: 'Entregue', key: 'totalEntregueStr', align: 'right' },
          { header: 'Saldo', key: 'saldoRestanteStr', align: 'right' },
          { header: '% Exec.', key: 'percentExecucaoStr', align: 'right' },
        ]

        let rows: any[] = []

        if (modoExibicaoChamada === 'somente_totais') {
          rows = faturamentoChamadaTotals.map((tot) => ({
            numero: `TOTAL Chamada ${tot.chamadaNumero}: ${formatCurrencyBRL(tot.valorPactuado)}`,
            chamadaNumero: tot.chamadaNumero,
            tipo: '—',
            totalEscolas: tot.totalEscolas,
            status: `${tot.contratosCount} contrato(s)`,
            valorPactuadoStr: formatCurrencyBRL(tot.valorPactuado),
            totalEntregueStr: formatCurrencyBRL(tot.totalEntregue),
            saldoRestanteStr: formatCurrencyBRL(tot.saldoRestante),
            percentExecucaoStr: `${tot.percentExecucao.toFixed(1)}%`,
          }))
        } else {
          const contractRows = faturamentoData.map((d) => ({
            numero: d.numero,
            chamadaNumero: d.chamadaNumero,
            tipo: d.tipo,
            totalEscolas: d.totalEscolas,
            status: d.status,
            valorPactuadoStr: formatCurrencyBRL(d.valorPactuado),
            totalEntregueStr: formatCurrencyBRL(d.totalEntregue),
            saldoRestanteStr: formatCurrencyBRL(d.saldoRestante),
            percentExecucaoStr: `${d.percentExecucao.toFixed(1)}%`,
          }))

          const totalChamadaRows = faturamentoChamadaTotals.map((tot) => ({
            numero: `TOTAL Chamada ${tot.chamadaNumero}: ${formatCurrencyBRL(tot.valorPactuado)}`,
            chamadaNumero: tot.chamadaNumero,
            tipo: '—',
            totalEscolas: tot.totalEscolas,
            status: `${tot.contratosCount} contrato(s)`,
            valorPactuadoStr: formatCurrencyBRL(tot.valorPactuado),
            totalEntregueStr: formatCurrencyBRL(tot.totalEntregue),
            saldoRestanteStr: formatCurrencyBRL(tot.saldoRestante),
            percentExecucaoStr: `${tot.percentExecucao.toFixed(1)}%`,
          }))

          rows = [...contractRows, ...totalChamadaRows]
        }

        const footerRows = [
          {
            numero: 'TOTAL CONSOLIDADO',
            chamadaNumero: '',
            tipo: `${faturamentoTotals.count} Contratos`,
            totalEscolas: faturamentoTotals.totalEscolas,
            status: '',
            valorPactuadoStr: formatCurrencyBRL(faturamentoTotals.pactuado),
            totalEntregueStr: formatCurrencyBRL(faturamentoTotals.entregue),
            saldoRestanteStr: formatCurrencyBRL(faturamentoTotals.saldo),
            percentExecucaoStr: `${faturamentoTotals.mediaExecucao.toFixed(1)}%`,
          },
        ]

        exportToPdf({
          title: 'Relatório Contábil — Faturamento por Contrato e Chamada',
          subtitle:
            'Acompanhamento de saldo e execução orçamentária por contrato e chamada pública',
          filename: `relatorio-faturamento-contratos-chamada-${nowStr}`,
          filters,
          columns,
          rows,
          summaryCards: [
            { label: 'Total Pactuado', value: formatCurrencyBRL(faturamentoTotals.pactuado) },
            { label: 'Total Entregue', value: formatCurrencyBRL(faturamentoTotals.entregue) },
            { label: 'Saldo Restante', value: formatCurrencyBRL(faturamentoTotals.saldo) },
            { label: 'Média de Execução', value: `${faturamentoTotals.mediaExecucao.toFixed(1)}%` },
          ],
          footerRows,
        })
      } else if (activeTab === 'entregas') {
        const columns: TableExportColumn[] = [
          { header: 'Nº Pedido', key: 'numero', align: 'left' },
          { header: 'Data Entrega', key: 'dateStr', align: 'center' },
          { header: 'Escola / Destino', key: 'schoolName', align: 'left' },
          { header: 'Itens', key: 'qtdItens', align: 'center' },
          { header: 'Status', key: 'status', align: 'center' },
          { header: 'Valor Total', key: 'totalStr', align: 'right' },
        ]

        const rows = entregasData.map((d) => ({
          numero: d.numero,
          dateStr: formatDateBR(d.date),
          schoolName: d.schoolName,
          qtdItens: d.items.length,
          status: d.status,
          totalStr: formatCurrencyBRL(d.total),
        }))

        const footerRows = [
          {
            numero: 'TOTAL GERAL',
            dateStr: '',
            schoolName: `${entregasTotals.totalEscolas} Escolas atendidas`,
            qtdItens: `${entregasTotals.totalItens} un/kg`,
            status: `${entregasTotals.totalPedidos} Pedidos`,
            totalStr: formatCurrencyBRL(entregasTotals.totalValor),
          },
        ]

        exportToPdf({
          title: 'Relatório Contábil — Entregas Realizadas no Período',
          subtitle: 'Demonstrativo de pedidos entregues para comprovação de recebimento',
          filename: `relatorio-entregas-periodo-${nowStr}`,
          filters,
          columns,
          rows,
          summaryCards: [
            { label: 'Total Pedidos', value: String(entregasTotals.totalPedidos) },
            { label: 'Escolas Atendidas', value: String(entregasTotals.totalEscolas) },
            { label: 'Valor Total', value: formatCurrencyBRL(entregasTotals.totalValor) },
          ],
          footerRows,
        })
      } else if (activeTab === 'produtos') {
        const columns: TableExportColumn[] = [
          { header: 'Produto Agrícola', key: 'nome', align: 'left' },
          { header: 'Categoria', key: 'categoria', align: 'left' },
          { header: 'Unidade', key: 'unidade', align: 'center' },
          { header: 'Qtd Entregue', key: 'quantidadeTotal', align: 'right' },
          { header: 'Nº Entregas', key: 'pedidosCount', align: 'center' },
          { header: 'Valor Total', key: 'valorTotalStr', align: 'right' },
        ]

        const rows = produtosEntreguesData.map((d) => ({
          nome: d.nome,
          categoria: d.categoria,
          unidade: d.unidade,
          quantidadeTotal: d.quantidadeTotal,
          pedidosCount: d.pedidosCount,
          valorTotalStr: formatCurrencyBRL(d.valorTotal),
        }))

        const footerRows = [
          {
            nome: 'TOTAL GERAL',
            categoria: `${produtosTotals.totalProdutos} Produtos`,
            unidade: '',
            quantidadeTotal: produtosTotals.totalQtd,
            pedidosCount: '',
            valorTotalStr: formatCurrencyBRL(produtosTotals.totalValor),
          },
        ]

        exportToPdf({
          title: 'Relatório Contábil — Produtos Entregues no Período',
          subtitle: 'Conferência de itens de cardápio, produtos e faturamento PNAE/PAA',
          filename: `relatorio-produtos-entregues-${nowStr}`,
          filters,
          columns,
          rows,
          summaryCards: [
            { label: 'Produtos', value: String(produtosTotals.totalProdutos) },
            { label: 'Qtd Total', value: String(produtosTotals.totalQtd) },
            { label: 'Valor Total', value: formatCurrencyBRL(produtosTotals.totalValor) },
          ],
          footerRows,
        })
      }

      toast.success('Documento PDF gerado e baixado com sucesso!')
    } catch (err: any) {
      console.error('Erro ao exportar PDF:', err)
      toast.error('Ocorreu um erro ao gerar o arquivo PDF.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileBarChart className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Relatórios Contábeis</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Prestação de contas para programas PNAE, PAA e fechamento contábil da cooperativa com
            exportação em Excel e PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Relatório Mensal — ativo no fechamento do mês (manual, sem job) */}
          <MonthlyReportButton size="sm" variant="default" className="h-9" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshData()}
            disabled={isLoading}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-9 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" />
            Exportar Excel (.xlsx)
          </Button>

          <Button size="sm" onClick={handleExportPdf} className="h-9">
            <FileDown className="h-4 w-4 mr-1.5" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Global Date Filter Card */}
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label
                htmlFor="start-date"
                className="text-xs font-semibold flex items-center gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Data Inicial (De)
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="end-date" className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Data Final (Até)
              </Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Atalhos Rápidos de Período
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickRange('thisMonth')}
                  className="h-8 text-xs"
                >
                  Este Mês
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickRange('lastMonth')}
                  className="h-8 text-xs"
                >
                  Mês Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickRange('thisYear')}
                  className="h-8 text-xs"
                >
                  Ano Vigente
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuickRange('all')}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpar Datas
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs for the 3 Reports */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as any)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto p-1 bg-muted/60">
          <TabsTrigger value="faturamento" className="py-2.5 data-[state=active]:bg-background">
            <TrendingUp className="h-4 w-4 mr-2 text-primary" />
            1. Faturamento por Contrato
          </TabsTrigger>
          <TabsTrigger value="entregas" className="py-2.5 data-[state=active]:bg-background">
            <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
            2. Entregas por Período
          </TabsTrigger>
          <TabsTrigger value="produtos" className="py-2.5 data-[state=active]:bg-background">
            <Package className="h-4 w-4 mr-2 text-primary" />
            3. Produtos Entregues
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------------
         * TAB 1: FATURAMENTO POR CONTRATO
         * --------------------------------------------------------------------- */}
        <TabsContent value="faturamento" className="space-y-4">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Total Pactuado</p>
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <div className="text-xl font-bold mt-1 text-foreground">
                  {formatCurrencyBRL(faturamentoTotals.pactuado)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {faturamentoTotals.count} contratos filtrados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Total Entregue</p>
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyBRL(faturamentoTotals.entregue)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Pedidos entregues no período
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Saldo Restante</p>
                  <Building2 className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                  {formatCurrencyBRL(faturamentoTotals.saldo)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Saldo pendente de execução
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Média de Execução</p>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="text-xl font-bold mt-1 text-foreground">
                  {faturamentoTotals.mediaExecucao.toFixed(1)}%
                </div>
                <div className="mt-2">
                  <Progress value={faturamentoTotals.mediaExecucao} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Subfilters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Filtros do Relatório de Contratos e Chamadas
              </CardTitle>
              <CardDescription>
                Refine por chamada pública, programa governamental, status do contrato, modo de
                exibição ou busca textual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <Label htmlFor="filtro-chamada" className="text-xs">
                    Chamada
                  </Label>
                  <Select value={filterChamada} onValueChange={setFilterChamada}>
                    <SelectTrigger id="filtro-chamada" className="mt-1 h-9 text-xs">
                      <SelectValue placeholder="Todas as chamadas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as chamadas</SelectItem>
                      {availableChamadas.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id}>
                          Chamada {ch.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="filtro-exibicao" className="text-xs">
                    Exibição de Linhas
                  </Label>
                  <Select
                    value={modoExibicaoChamada}
                    onValueChange={(val) =>
                      setModoExibicaoChamada(val as 'todas' | 'somente_totais')
                    }
                  >
                    <SelectTrigger id="filtro-exibicao" className="mt-1 h-9 text-xs">
                      <SelectValue placeholder="Modo de exibição" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as linhas</SelectItem>
                      <SelectItem value="somente_totais">Somente totais de Chamada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="filtro-programa" className="text-xs">
                    Programa Institucional
                  </Label>
                  <Select value={filterPrograma} onValueChange={setFilterPrograma}>
                    <SelectTrigger id="filtro-programa" className="mt-1 h-9 text-xs">
                      <SelectValue placeholder="Selecione o programa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Programas</SelectItem>
                      <SelectItem value="PNAE">PNAE (Alimentação Escolar)</SelectItem>
                      <SelectItem value="PAA">PAA (Aquisição de Alimentos)</SelectItem>
                      <SelectItem value="Municipal">Municipal</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="filtro-status-contrato" className="text-xs">
                    Status do Contrato
                  </Label>
                  <Select value={filterStatusContrato} onValueChange={setFilterStatusContrato}>
                    <SelectTrigger id="filtro-status-contrato" className="mt-1 h-9 text-xs">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Status</SelectItem>
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Encerrado">Encerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="busca-contrato" className="text-xs">
                    Buscar Contrato, Chamada ou Escola
                  </Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="busca-contrato"
                      type="text"
                      placeholder="Ex: C-2026-01, 01/2025..."
                      value={searchContrato}
                      onChange={(e) => setSearchContrato(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Faturamento por Contrato e Chamada</CardTitle>
                  <CardDescription>
                    {modoExibicaoChamada === 'somente_totais'
                      ? `Exibindo ${faturamentoChamadaTotals.length} chamada(s) (modo: somente totais de Chamada).`
                      : `Exibindo ${faturamentoData.length} contrato(s) com linhas de totalização por chamada.`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Modo:{' '}
                    <span className="font-semibold ml-1">
                      {modoExibicaoChamada === 'somente_totais'
                        ? 'Somente totais de Chamada'
                        : 'Todas as linhas'}
                    </span>
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Contrato</TableHead>
                      <TableHead>Chamada</TableHead>
                      <TableHead>Programa</TableHead>
                      <TableHead className="text-right">Total de Escolas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor Pactuado</TableHead>
                      <TableHead className="text-right">Total Entregue</TableHead>
                      <TableHead className="text-right">Saldo Restante</TableHead>
                      <TableHead className="w-[160px] text-right">% Executado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {faturamentoData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                          <AlertCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
                          Nenhum contrato encontrado para os filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {/* Linhas de Contrato Individuais (omitidas se modo "somente_totais") */}
                        {modoExibicaoChamada !== 'somente_totais' &&
                          faturamentoData.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-semibold text-primary">
                                {row.numero}
                              </TableCell>
                              <TableCell>
                                {row.chamadaNumero !== '—' ? (
                                  <Badge
                                    variant="outline"
                                    className="font-medium text-xs border-primary/30 bg-primary/5 text-primary"
                                  >
                                    {row.chamadaNumero}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-normal">
                                  {row.tipo}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {row.totalEscolas}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={row.status === 'Ativo' ? 'default' : 'secondary'}
                                  className={
                                    row.status === 'Ativo'
                                      ? 'bg-primary'
                                      : row.status === 'Encerrado'
                                        ? 'bg-muted-foreground'
                                        : 'bg-amber-600'
                                  }
                                >
                                  {row.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrencyBRL(row.valorPactuado)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                                {formatCurrencyBRL(row.totalEntregue)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-amber-600 dark:text-amber-400">
                                {formatCurrencyBRL(row.saldoRestante)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs font-semibold">
                                    {row.percentExecucao.toFixed(1)}%
                                  </span>
                                  <Progress value={row.percentExecucao} className="w-16 h-2" />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}

                        {/* Linhas de TOTAL POR CHAMADA (destacadas visualmente) */}
                        {faturamentoChamadaTotals.map((tot) => (
                          <TableRow
                            key={`total-chamada-${tot.chamadaKey}`}
                            className="bg-primary/10 hover:bg-primary/15 font-semibold border-t-2 border-primary/20 dark:bg-primary/15 dark:hover:bg-primary/20"
                          >
                            <TableCell className="font-bold text-primary">
                              <div className="flex flex-col">
                                <span>TOTAL Chamada {tot.chamadaNumero}</span>
                                <span className="text-[11px] font-normal text-muted-foreground">
                                  Valor total da chamada na coluna Contrato:{' '}
                                  {formatCurrencyBRL(tot.valorPactuado)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-primary text-primary-foreground font-bold text-xs">
                                {tot.chamadaNumero}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground italic font-normal">
                              {tot.contratosCount} contrato(s)
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {tot.totalEscolas}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="border-primary/40 text-primary text-[11px] font-semibold"
                              >
                                Total Chamada
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {formatCurrencyBRL(tot.valorPactuado)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrencyBRL(tot.totalEntregue)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-amber-600 dark:text-amber-400">
                              {formatCurrencyBRL(tot.saldoRestante)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs font-bold text-primary">
                                  {tot.percentExecucao.toFixed(1)}%
                                </span>
                                <Progress value={tot.percentExecucao} className="w-16 h-2" />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                  {faturamentoData.length > 0 && (
                    <TableFooter className="bg-muted/70 font-semibold">
                      <TableRow>
                        <TableCell colSpan={3}>TOTAL GERAL CONSOLIDADO</TableCell>
                        <TableCell className="text-right font-bold">
                          {faturamentoTotals.totalEscolas}
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrencyBRL(faturamentoTotals.pactuado)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrencyBRL(faturamentoTotals.entregue)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrencyBRL(faturamentoTotals.saldo)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {faturamentoTotals.mediaExecucao.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------------
         * TAB 2: ENTREGAS POR PERÍODO
         * --------------------------------------------------------------------- */}
        <TabsContent value="entregas" className="space-y-4">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Pedidos Entregues</p>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold mt-1 text-foreground">
                  {entregasTotals.totalPedidos}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Concluídos e prontos para faturamento
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Escolas Atendidas</p>
                  <SchoolIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="text-2xl font-bold mt-1 text-foreground">
                  {entregasTotals.totalEscolas}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Instituições com remessas no período
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Valor Total Entregue</p>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyBRL(entregasTotals.totalValor)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Faturamento consolidado das entregas
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Subfilters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Filtros do Relatório de Entregas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Filtrar por Escola</Label>
                  <Select value={filterEscola} onValueChange={setFilterEscola}>
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue placeholder="Todas as Escolas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as Escolas</SelectItem>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Buscar por Número do Pedido</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Ex: ORD-001..."
                      value={searchPedido}
                      onChange={(e) => setSearchPedido(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grid with Consolidated by School + Full Detail Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Consolidated by School */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <SchoolIcon className="h-4 w-4 text-primary" />
                  Consolidado por Escola
                </CardTitle>
                <CardDescription className="text-xs">
                  Ranking de valores entregues por destinatário.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {entregasConsolidadoPorEscola.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Nenhuma entrega no período.
                    </p>
                  ) : (
                    entregasConsolidadoPorEscola.map((esc) => {
                      const share =
                        entregasTotals.totalValor > 0
                          ? (esc.totalValor / entregasTotals.totalValor) * 100
                          : 0
                      return (
                        <div key={esc.escolaId} className="border-b pb-2 last:border-b-0 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className="font-medium text-foreground truncate max-w-[160px]"
                              title={esc.escolaNome}
                            >
                              {esc.escolaNome}
                            </span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCurrencyBRL(esc.totalValor)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{esc.pedidosCount} pedido(s)</span>
                            <span>{share.toFixed(1)}% do total</span>
                          </div>
                          <Progress value={share} className="h-1.5" />
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Detailed Table */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Detalhamento de Pedidos Entregues
                </CardTitle>
                <CardDescription className="text-xs">
                  {entregasData.length} pedido(s) com status Entregue no intervalo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Pedido</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Escola</TableHead>
                        <TableHead className="text-center">Itens</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entregasData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Nenhum pedido entregue encontrado no período.
                          </TableCell>
                        </TableRow>
                      ) : (
                        entregasData.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-semibold text-primary">
                              {order.numero}
                            </TableCell>
                            <TableCell className="text-xs">{formatDateBR(order.date)}</TableCell>
                            <TableCell className="font-medium text-xs">
                              {order.schoolName}
                            </TableCell>
                            <TableCell className="text-center text-xs">
                              <Badge variant="outline" className="font-normal text-[11px]">
                                {order.items.length} item(s)
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                              {formatCurrencyBRL(order.total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                    {entregasData.length > 0 && (
                      <TableFooter className="bg-muted/70 font-semibold">
                        <TableRow>
                          <TableCell colSpan={3}>TOTAL GERAL</TableCell>
                          <TableCell className="text-center">
                            {entregasTotals.totalItens} un/kg
                          </TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                            {formatCurrencyBRL(entregasTotals.totalValor)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------------
         * TAB 3: PRODUTOS ENTREGUES
         * --------------------------------------------------------------------- */}
        <TabsContent value="produtos" className="space-y-4">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Produtos Distintos</p>
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="text-2xl font-bold mt-1 text-foreground">
                  {produtosTotals.totalProdutos}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Variedades agrícolas entregues
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Volume Distribuído</p>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="text-2xl font-bold mt-1 text-foreground">
                  {produtosTotals.totalQtd.toLocaleString('pt-BR')}{' '}
                  <span className="text-sm font-normal text-muted-foreground">un/kg</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Quantidade total fornecida
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Valor Total dos Produtos
                  </p>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyBRL(produtosTotals.totalValor)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Faturamento por itens no período
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Subfilters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Filtros do Relatório de Produtos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Categoria de Produto</Label>
                  <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue placeholder="Todas as Categorias" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as Categorias</SelectItem>
                      {availableCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Escola Destinatária</Label>
                  <Select value={filterEscola} onValueChange={setFilterEscola}>
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue placeholder="Todas as Escolas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as Escolas</SelectItem>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Buscar Produto</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Ex: Alface, Banana..."
                      value={searchProduto}
                      onChange={(e) => setSearchProduto(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Products Data Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Consolidado por Produto Agrícola</CardTitle>
              <CardDescription>
                Ordenado por valor faturado decrescente para conferência de cardápios e editais.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-center">Unidade</TableHead>
                      <TableHead className="text-right">Qtd Entregue</TableHead>
                      <TableHead className="text-center">Frequência</TableHead>
                      <TableHead className="text-right">Preço Médio Calc.</TableHead>
                      <TableHead className="text-right">Valor Total Faturado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {produtosEntreguesData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                          <AlertCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
                          Nenhum produto entregue no período e filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      produtosEntreguesData.map((prod) => {
                        const precoMedio =
                          prod.quantidadeTotal > 0 ? prod.valorTotal / prod.quantidadeTotal : 0
                        return (
                          <TableRow key={prod.produtoId}>
                            <TableCell className="font-semibold text-foreground">
                              {prod.nome}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs font-normal">
                                {prod.categoria}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {prod.unidade}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {prod.quantidadeTotal.toLocaleString('pt-BR')}
                            </TableCell>
                            <TableCell className="text-center text-xs">
                              <Badge variant="secondary" className="font-normal text-[11px]">
                                {prod.pedidosCount} remessa(s)
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {formatCurrencyBRL(precoMedio)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCurrencyBRL(prod.valorTotal)}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                  {produtosEntreguesData.length > 0 && (
                    <TableFooter className="bg-muted/70 font-semibold">
                      <TableRow>
                        <TableCell colSpan={3}>TOTAL GERAL</TableCell>
                        <TableCell className="text-right">
                          {produtosTotals.totalQtd.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell colSpan={2}></TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrencyBRL(produtosTotals.totalValor)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
