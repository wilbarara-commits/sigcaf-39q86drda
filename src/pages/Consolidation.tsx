import { useState, useMemo } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Download,
  Calendar,
  Search,
  FileSpreadsheet,
  FileText,
  FileCode,
  Layers,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable, { applyPlugin } from 'jspdf-autotable'
import { toast } from 'sonner'

try {
  if (typeof applyPlugin === 'function') {
    applyPlugin(jsPDF)
  }
} catch {
  // Ignora se já inicializado
}

function runAutoTable(doc: jsPDF, options: any): void {
  const docAny = doc as any
  if (typeof autoTable === 'function') {
    autoTable(doc, options)
    return
  }
  if ((autoTable as any)?.default && typeof (autoTable as any).default === 'function') {
    ;(autoTable as any).default(doc, options)
    return
  }
  if (typeof docAny.autoTable === 'function') {
    docAny.autoTable(options)
    return
  }
  throw new Error('Falha ao executar autoTable do jsPDF')
}

type ModoExibicao = 'qtd' | 'valor' | 'ambos'

interface CellData {
  qtd: number
  valor: number
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function formatNumber(value: number): string {
  return (value || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 2,
  })
}

export default function Consolidation() {
  const { products, schools, orders, ciclos, activeCiclo, contractItems } = useApp()

  const [selectedCicloId, setSelectedCicloId] = useState<string>(activeCiclo?.id || 'todos')
  const [tabAtiva, setTabAtiva] = useState<'produto' | 'escola'>('produto')
  const [somenteColunaTotal, setSomenteColunaTotal] = useState(false)
  const [ocultarVazios, setOcultarVazios] = useState(true)
  const [modoExibicao, setModoExibicao] = useState<ModoExibicao>('ambos')
  const [filtroTexto, setFiltroTexto] = useState('')

  // Mapa de preços prioritários dos produtos (preço do item do pedido ou do contrato ou do catálogo)
  const productPriceMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of products) {
      map.set(p.id, Number(p.price) || 0)
    }
    if (contractItems && contractItems.length > 0) {
      for (const ci of contractItems) {
        if (ci.produto_id && Number(ci.preco) > 0) {
          map.set(ci.produto_id, Number(ci.preco))
        }
      }
    }
    return map
  }, [products, contractItems])

  // Filtrar pedidos pelo ciclo selecionado e não cancelados
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'Cancelado') return false
      if (selectedCicloId !== 'todos' && o.cicloId && o.cicloId !== selectedCicloId) return false
      return true
    })
  }, [orders, selectedCicloId])

  // Matriz de dados agregada: Map<produtoId, Map<schoolId, CellData>>
  const matriz = useMemo(() => {
    const data = new Map<string, Map<string, CellData>>()

    for (const order of filteredOrders) {
      for (const item of order.items) {
        if (!data.has(item.productId)) {
          data.set(item.productId, new Map<string, CellData>())
        }
        const schoolMap = data.get(item.productId)!
        const current = schoolMap.get(order.schoolId) || { qtd: 0, valor: 0 }
        const itemQtd = Number(item.quantity) || 0
        const itemPreco =
          Number(item.price) > 0 ? Number(item.price) : productPriceMap.get(item.productId) || 0
        const itemValor = itemQtd * itemPreco

        schoolMap.set(order.schoolId, {
          qtd: current.qtd + itemQtd,
          valor: current.valor + itemValor,
        })
      }
    }

    return data
  }, [filteredOrders, productPriceMap])

  // Totais agregados por produto
  const totaisPorProduto = useMemo(() => {
    const res: Record<string, { totalQtd: number; totalValor: number }> = {}
    for (const prod of products) {
      const schoolMap = matriz.get(prod.id)
      let totalQtd = 0
      let totalValor = 0
      if (schoolMap) {
        for (const cell of schoolMap.values()) {
          totalQtd += cell.qtd
          totalValor += cell.valor
        }
      }
      res[prod.id] = { totalQtd, totalValor }
    }
    return res
  }, [products, matriz])

  // Totais agregados por escola
  const totaisPorEscola = useMemo(() => {
    const res: Record<string, { totalQtd: number; totalValor: number }> = {}
    for (const sch of schools) {
      let totalQtd = 0
      let totalValor = 0
      for (const prod of products) {
        const cell = matriz.get(prod.id)?.get(sch.id)
        if (cell) {
          totalQtd += cell.qtd
          totalValor += cell.valor
        }
      }
      res[sch.id] = { totalQtd, totalValor }
    }
    return res
  }, [schools, products, matriz])

  // Escolas exibidas com filtro de busca e toggle de ocultar vazios
  const escolasExibidas = useMemo(() => {
    return schools.filter((s) => {
      if (filtroTexto.trim()) {
        const match = s.name.toLowerCase().includes(filtroTexto.toLowerCase())
        if (!match) return false
      }
      if (!ocultarVazios) return true
      const tot = totaisPorEscola[s.id]
      return tot && (tot.totalQtd > 0 || tot.totalValor > 0)
    })
  }, [schools, totaisPorEscola, ocultarVazios, filtroTexto])

  // Produtos exibidos com filtro de busca e toggle de ocultar vazios
  const produtosExibidos = useMemo(() => {
    return products.filter((p) => {
      if (filtroTexto.trim()) {
        const match = p.name.toLowerCase().includes(filtroTexto.toLowerCase())
        if (!match) return false
      }
      if (!ocultarVazios) return true
      const tot = totaisPorProduto[p.id]
      return tot && (tot.totalQtd > 0 || tot.totalValor > 0)
    })
  }, [products, totaisPorProduto, ocultarVazios, filtroTexto])

  // Total Geral da Consolidação (considera os itens exibidos)
  const totalGeral = useMemo(() => {
    let qtd = 0
    let valor = 0
    if (tabAtiva === 'produto') {
      for (const prod of produtosExibidos) {
        if (somenteColunaTotal) {
          const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
          qtd += tot.totalQtd
          valor += tot.totalValor
        } else {
          for (const sch of escolasExibidas) {
            const cell = matriz.get(prod.id)?.get(sch.id)
            if (cell) {
              qtd += cell.qtd
              valor += cell.valor
            }
          }
        }
      }
    } else {
      for (const sch of escolasExibidas) {
        if (somenteColunaTotal) {
          const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
          qtd += tot.totalQtd
          valor += tot.totalValor
        } else {
          for (const prod of produtosExibidos) {
            const cell = matriz.get(prod.id)?.get(sch.id)
            if (cell) {
              qtd += cell.qtd
              valor += cell.valor
            }
          }
        }
      }
    }
    return { qtd, valor }
  }, [
    tabAtiva,
    produtosExibidos,
    escolasExibidas,
    matriz,
    totaisPorProduto,
    totaisPorEscola,
    somenteColunaTotal,
  ])

  // Totais verticais por coluna (para o rodapé da tabela)
  const totaisColunaPorEscola = useMemo(() => {
    const res: Record<string, { totalQtd: number; totalValor: number }> = {}
    for (const sch of escolasExibidas) {
      let q = 0
      let v = 0
      for (const prod of produtosExibidos) {
        const cell = matriz.get(prod.id)?.get(sch.id)
        if (cell) {
          q += cell.qtd
          v += cell.valor
        }
      }
      res[sch.id] = { totalQtd: q, totalValor: v }
    }
    return res
  }, [escolasExibidas, produtosExibidos, matriz])

  const totaisColunaPorProduto = useMemo(() => {
    const res: Record<string, { totalQtd: number; totalValor: number }> = {}
    for (const prod of produtosExibidos) {
      let q = 0
      let v = 0
      for (const sch of escolasExibidas) {
        const cell = matriz.get(prod.id)?.get(sch.id)
        if (cell) {
          q += cell.qtd
          v += cell.valor
        }
      }
      res[prod.id] = { totalQtd: q, totalValor: v }
    }
    return res
  }, [produtosExibidos, escolasExibidas, matriz])

  // Helper para renderizar célula na interface
  const renderCellContent = (qtd: number, valor: number, unit?: string, isTotal = false) => {
    if (qtd <= 0 && valor <= 0 && !isTotal) {
      return <span className="text-muted-foreground/30 font-mono">-</span>
    }

    const unitStr = unit ? ` ${unit}` : ''

    if (modoExibicao === 'qtd') {
      return (
        <span className="font-mono font-semibold text-primary">
          {formatNumber(qtd)}
          {unitStr}
        </span>
      )
    }

    if (modoExibicao === 'valor') {
      return <span className="font-mono font-semibold text-foreground">{formatBRL(valor)}</span>
    }

    // Ambos
    return (
      <div className="flex flex-col items-center justify-center leading-tight py-0.5">
        <span className="font-mono font-semibold text-primary text-xs">
          {formatNumber(qtd)}
          {unitStr}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{formatBRL(valor)}</span>
      </div>
    )
  }

  // Helper de texto de célula para XLSX/CSV/PDF
  const getCellExportText = (
    qtd: number,
    valor: number,
    unit?: string,
    isTotal = false,
  ): string => {
    if (qtd <= 0 && valor <= 0 && !isTotal) {
      return '-'
    }
    const unitStr = unit ? ` ${unit}` : ''
    if (modoExibicao === 'qtd') {
      return `${formatNumber(qtd)}${unitStr}`
    }
    if (modoExibicao === 'valor') {
      return formatBRL(valor)
    }
    return `${formatNumber(qtd)}${unitStr} · ${formatBRL(valor)}`
  }

  const cicloSelecionadoNome =
    selectedCicloId === 'todos'
      ? 'Todos os Ciclos'
      : ciclos.find((c) => c.id === selectedCicloId)?.nome || 'Ciclo Selecionado'

  // ==========================================
  // EXPORTAÇÃO XLSX (Planilha Real)
  // ==========================================
  const exportarXLSX = () => {
    try {
      const wb = XLSX.utils.book_new()
      const dataRows: any[][] = []

      // Título e Metadados
      dataRows.push(['CONSOLIDAÇÃO FINAL — MATRIZ DE PEDIDOS PARA LOGÍSTICA'])
      dataRows.push([
        `Aba: ${tabAtiva === 'produto' ? 'Por Produto (Produto × Escola)' : 'Por Escola (Escola × Produto)'}`,
      ])
      dataRows.push([
        `Ciclo: ${cicloSelecionadoNome}`,
        `Modo: ${modoExibicao === 'qtd' ? 'Quantidade' : modoExibicao === 'valor' ? 'Valor (R$)' : 'Ambos (Qtd + R$)'}`,
        `Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      ])
      dataRows.push([]) // Linha em branco

      if (tabAtiva === 'produto') {
        // Headers
        const headers = ['Produto', 'Unidade', 'Preço Unitário (R$)']
        if (!somenteColunaTotal) {
          headers.push(...escolasExibidas.map((e) => e.name))
        }
        headers.push('Total')
        dataRows.push(headers)

        // Linhas de dados
        for (const prod of produtosExibidos) {
          const unitPrice = productPriceMap.get(prod.id) || Number(prod.price) || 0
          const row: any[] = [prod.name, prod.unit, unitPrice]

          let rowQtd = 0
          let rowValor = 0

          if (!somenteColunaTotal) {
            for (const sch of escolasExibidas) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              row.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          row.push(getCellExportText(rowQtd, rowValor, prod.unit, true))
          dataRows.push(row)
        }

        // Linha Total Geral
        const footer: any[] = ['TOTAL GERAL', '', '']
        if (!somenteColunaTotal) {
          for (const sch of escolasExibidas) {
            const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, undefined, true))
          }
        }
        footer.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        dataRows.push(footer)
      } else {
        // Aba Por Escola
        const headers = ['Escola', 'Aba']
        if (!somenteColunaTotal) {
          headers.push(...produtosExibidos.map((p) => `${p.name} (${p.unit})`))
        }
        headers.push('Total')
        dataRows.push(headers)

        for (const sch of escolasExibidas) {
          const row: any[] = [sch.name, sch.route || '-']
          let rowQtd = 0
          let rowValor = 0

          if (!somenteColunaTotal) {
            for (const prod of produtosExibidos) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              row.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          row.push(getCellExportText(rowQtd, rowValor, undefined, true))
          dataRows.push(row)
        }

        // Linha Total Geral
        const footer: any[] = ['TOTAL GERAL', '']
        if (!somenteColunaTotal) {
          for (const prod of produtosExibidos) {
            const totCol = totaisColunaPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, prod.unit, true))
          }
        }
        footer.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        dataRows.push(footer)
      }

      const ws = XLSX.utils.aoa_to_sheet(dataRows)
      XLSX.utils.book_append_sheet(wb, ws, 'Consolidação Final')

      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `consolidacao-final-${tabAtiva}-${dateStr}.xlsx`
      XLSX.writeFile(wb, filename)
      toast.success('Planilha Excel (.xlsx) exportada com sucesso!')
    } catch (err) {
      console.error('Erro ao exportar XLSX:', err)
      toast.error('Falha ao exportar planilha Excel.')
    }
  }

  // ==========================================
  // EXPORTAÇÃO CSV
  // ==========================================
  const exportarCSV = () => {
    try {
      const rows: string[][] = []

      if (tabAtiva === 'produto') {
        const headers = ['Produto', 'Unidade', 'Preço Unitário (R$)']
        if (!somenteColunaTotal) {
          headers.push(...escolasExibidas.map((e) => e.name))
        }
        headers.push('Total')
        rows.push(headers)

        for (const prod of produtosExibidos) {
          const unitPrice = productPriceMap.get(prod.id) || Number(prod.price) || 0
          const row: string[] = [prod.name, prod.unit, unitPrice.toFixed(2)]

          let rowQtd = 0
          let rowValor = 0

          if (!somenteColunaTotal) {
            for (const sch of escolasExibidas) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              row.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          row.push(getCellExportText(rowQtd, rowValor, prod.unit, true))
          rows.push(row)
        }

        const footer: string[] = ['TOTAL GERAL', '', '']
        if (!somenteColunaTotal) {
          for (const sch of escolasExibidas) {
            const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, undefined, true))
          }
        }
        footer.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        rows.push(footer)
      } else {
        const headers = ['Escola', 'Aba']
        if (!somenteColunaTotal) {
          headers.push(...produtosExibidos.map((p) => `${p.name} (${p.unit})`))
        }
        headers.push('Total')
        rows.push(headers)

        for (const sch of escolasExibidas) {
          const row: string[] = [sch.name, sch.route || '-']
          let rowQtd = 0
          let rowValor = 0

          if (!somenteColunaTotal) {
            for (const prod of produtosExibidos) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              row.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          row.push(getCellExportText(rowQtd, rowValor, undefined, true))
          rows.push(row)
        }

        const footer: string[] = ['TOTAL GERAL', '']
        if (!somenteColunaTotal) {
          for (const prod of produtosExibidos) {
            const totCol = totaisColunaPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, prod.unit, true))
          }
        }
        footer.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        rows.push(footer)
      }

      // Converte para formato CSV delimitado por ponto e vírgula com BOM para compatibilidade com Excel
      const csvContent =
        '\uFEFF' +
        rows
          .map((row) =>
            row
              .map((val) => {
                const s = String(val ?? '')
                if (s.includes(';') || s.includes('"') || s.includes('\n')) {
                  return `"${s.replace(/"/g, '""')}"`
                }
                return s
              })
              .join(';'),
          )
          .join('\r\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().split('T')[0]
      a.href = url
      a.download = `consolidacao-final-${tabAtiva}-${dateStr}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Arquivo CSV exportado com sucesso!')
    } catch (err) {
      console.error('Erro ao exportar CSV:', err)
      toast.error('Falha ao exportar arquivo CSV.')
    }
  }

  // ==========================================
  // EXPORTAÇÃO PDF (Formatado e Limpo)
  // ==========================================
  const exportarPDF = () => {
    try {
      const colsCount =
        tabAtiva === 'produto'
          ? somenteColunaTotal
            ? 4
            : escolasExibidas.length + 4
          : somenteColunaTotal
            ? 3
            : produtosExibidos.length + 3

      const isLandscape = colsCount > 4
      const doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()

      // Cabeçalho da Cooperativa
      doc.setFillColor(31, 77, 28)
      doc.rect(0, 0, pageWidth, 20, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('Consolidação Final', 14, 10)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(
        `Aba: ${tabAtiva === 'produto' ? 'Por Produto' : 'Por Escola'} • Matriz de pedidos para logística`,
        14,
        16,
      )

      const now = new Date()
      const dataEmissao = `Emissão: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      doc.setFontSize(8)
      doc.text(dataEmissao, pageWidth - 14, 13, { align: 'right' })

      // Bloco de Informações / Filtros
      let currentY = 27
      const modoTexto =
        modoExibicao === 'qtd'
          ? 'Quantidade'
          : modoExibicao === 'valor'
            ? 'Valor (R$)'
            : 'Ambos (Quantidade e Valor)'

      doc.setTextColor(51, 65, 85)
      doc.setFontSize(8)
      doc.setFillColor(241, 245, 249)
      doc.roundedRect(14, currentY, pageWidth - 28, 9, 1.5, 1.5, 'F')

      const filtrosTexto = `Ciclo: ${cicloSelecionadoNome}   |   Modo de exibição: ${modoTexto}   |   Total Geral: ${formatNumber(totalGeral.qtd)} un/kg — ${formatBRL(totalGeral.valor)}`
      doc.text(filtrosTexto, 17, currentY + 5.5)

      currentY += 13

      // Montar tabela para autoTable
      let head: string[][] = []
      let body: string[][] = []
      let foot: string[][] = []

      if (tabAtiva === 'produto') {
        const headerRow = ['Produto', 'Un.', 'Preço']
        if (!somenteColunaTotal) {
          headerRow.push(...escolasExibidas.map((e) => e.name))
        }
        headerRow.push('Total')
        head = [headerRow]

        for (const prod of produtosExibidos) {
          const unitPrice = productPriceMap.get(prod.id) || Number(prod.price) || 0
          const row: string[] = [prod.name, prod.unit, formatBRL(unitPrice)]

          let rowQtd = 0
          let rowValor = 0

          if (!somenteColunaTotal) {
            for (const sch of escolasExibidas) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              row.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          row.push(getCellExportText(rowQtd, rowValor, prod.unit, true))
          body.push(row)
        }

        const footerRow: string[] = ['TOTAL GERAL', '', '']
        if (!somenteColunaTotal) {
          for (const sch of escolasExibidas) {
            const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            footerRow.push(getCellExportText(totCol.totalQtd, totCol.totalValor, undefined, true))
          }
        }
        footerRow.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        foot = [footerRow]
      } else {
        const headerRow = ['Escola', 'Aba']
        if (!somenteColunaTotal) {
          headerRow.push(...produtosExibidos.map((p) => `${p.name} (${p.unit})`))
        }
        headerRow.push('Total')
        head = [headerRow]

        for (const sch of escolasExibidas) {
          const row: string[] = [sch.name, sch.route || '-']
          let rowQtd = 0
          let rowValor = 0

          if (!somenteColunaTotal) {
            for (const prod of produtosExibidos) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              row.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          row.push(getCellExportText(rowQtd, rowValor, undefined, true))
          body.push(row)
        }

        const footerRow: string[] = ['TOTAL GERAL', '']
        if (!somenteColunaTotal) {
          for (const prod of produtosExibidos) {
            const totCol = totaisColunaPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            footerRow.push(getCellExportText(totCol.totalQtd, totCol.totalValor, prod.unit, true))
          }
        }
        footerRow.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        foot = [footerRow]
      }

      runAutoTable(doc, {
        startY: currentY,
        head,
        body,
        foot,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: colsCount > 10 ? 6 : colsCount > 6 ? 7 : 8,
          cellPadding: 2,
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [31, 77, 28],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          halign: 'center',
          lineWidth: 0.25,
          lineColor: [203, 213, 225],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 14, right: 14, bottom: 16 },
        didDrawPage: (data: any) => {
          const str = `Página ${data.pageNumber}`
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(148, 163, 184)
          doc.text('Gestão Cooperativa Agrícola • Logística de Distribuição', 14, pageHeight - 7)
          doc.text(str, pageWidth - 14, pageHeight - 7, { align: 'right' })
        },
      })

      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `consolidacao-final-${tabAtiva}-${dateStr}.pdf`
      doc.save(filename)
      toast.success('Documento PDF exportado com sucesso!')
    } catch (err) {
      console.error('Erro ao exportar PDF:', err)
      toast.error('Falha ao exportar documento PDF.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consolidação Final</h1>
          <p className="text-muted-foreground text-sm">Matriz de pedidos para logística.</p>
        </div>
      </div>

      {/* Abas Superiores Por Produto / Por Escola */}
      <Tabs
        value={tabAtiva}
        onValueChange={(v) => setTabAtiva(v as 'produto' | 'escola')}
        className="w-full"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="bg-muted/80 p-1">
            <TabsTrigger value="produto" className="text-sm px-4">
              Por Produto
            </TabsTrigger>
            <TabsTrigger value="escola" className="text-sm px-4">
              Por Escola
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* Painel de Controles e Filtros */}
      <Card className="border border-border/60 shadow-xs">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Toggles da Esquerda: Somente coluna de Total, Ocultar vazios, Mostrar Valores */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="somente-coluna-total"
                    checked={somenteColunaTotal}
                    onCheckedChange={setSomenteColunaTotal}
                  />
                  <Label
                    htmlFor="somente-coluna-total"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Somente coluna de Total
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="ocultar-vazios"
                    checked={ocultarVazios}
                    onCheckedChange={setOcultarVazios}
                  />
                  <Label htmlFor="ocultar-vazios" className="text-xs font-medium cursor-pointer">
                    Ocultar linhas/colunas vazias
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="mostrar-valores"
                    checked={modoExibicao !== 'qtd'}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setModoExibicao('ambos')
                      } else {
                        setModoExibicao('qtd')
                      }
                    }}
                  />
                  <Label htmlFor="mostrar-valores" className="text-xs font-medium cursor-pointer">
                    Mostrar valores
                  </Label>
                </div>
              </div>

              {/* Seletor específico de modo quando valores estão ativos ou para alternar explicitamente */}
              <div className="border-t sm:border-t-0 sm:border-l sm:pl-6 pt-3 sm:pt-0 flex flex-col gap-1.5">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Modo de Exibição da Matriz:
                </Label>
                <Select
                  value={modoExibicao}
                  onValueChange={(v) => setModoExibicao(v as ModoExibicao)}
                >
                  <SelectTrigger className="h-8 w-44 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qtd">Quantidade</SelectItem>
                    <SelectItem value="valor">Valor (R$)</SelectItem>
                    <SelectItem value="ambos">Ambos (Qtd + R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ações da Direita: Ciclo, Busca e Botão Exportar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={selectedCicloId} onValueChange={setSelectedCicloId}>
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue placeholder="Ciclo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Ciclos</SelectItem>
                    {ciclos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder={
                    tabAtiva === 'produto'
                      ? 'Filtrar produtos/escolas...'
                      : 'Filtrar escolas/produtos...'
                  }
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  className="h-9 pl-8 w-44 text-xs"
                />
              </div>

              {/* Botão de Exportação com Menu Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-9 gap-2 bg-[#1b643a] hover:bg-[#15502e] text-white">
                    <Download className="h-4 w-4" />
                    <span>Exportar</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={exportarXLSX} className="gap-2 cursor-pointer py-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <div className="flex flex-col">
                      <span className="font-medium text-xs">Planilha Excel (.xlsx)</span>
                      <span className="text-[10px] text-muted-foreground">
                        Matriz e cruzamento formatado
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportarPDF} className="gap-2 cursor-pointer py-2">
                    <FileText className="h-4 w-4 text-rose-600" />
                    <div className="flex flex-col">
                      <span className="font-medium text-xs">Documento PDF (.pdf)</span>
                      <span className="text-[10px] text-muted-foreground">
                        Relatório para impressão/logística
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportarCSV} className="gap-2 cursor-pointer py-2">
                    <FileCode className="h-4 w-4 text-sky-600" />
                    <div className="flex flex-col">
                      <span className="font-medium text-xs">
                        Texto Separado por Vírgulas (.csv)
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Dados tabulares para importação
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela da Matriz */}
      <div className="rounded-lg border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <Table className="relative w-full border-collapse">
            <TableHeader className="sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur z-20 border-b">
              {tabAtiva === 'produto' ? (
                // CABEÇALHO DA ABA POR PRODUTO
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[200px] sticky left-0 bg-slate-50 dark:bg-slate-900 z-30 font-semibold text-foreground border-r shadow-xs">
                    Produto
                  </TableHead>
                  <TableHead className="w-20 text-center font-semibold text-foreground">
                    Unidade
                  </TableHead>
                  <TableHead className="w-28 text-right font-semibold text-foreground border-r">
                    Preço Unit.
                  </TableHead>
                  {!somenteColunaTotal &&
                    escolasExibidas.map((sch) => (
                      <TableHead
                        key={sch.id}
                        className="text-center min-w-[130px] max-w-[180px] text-xs font-semibold text-foreground px-3"
                        title={sch.name}
                      >
                        <div className="truncate">{sch.name}</div>
                        {sch.route && (
                          <div className="text-[10px] text-muted-foreground font-normal truncate">
                            {sch.route}
                          </div>
                        )}
                      </TableHead>
                    ))}
                  <TableHead className="text-center font-bold text-primary min-w-[120px] bg-primary/5 border-l">
                    Total
                  </TableHead>
                </TableRow>
              ) : (
                // CABEÇALHO DA ABA POR ESCOLA
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[220px] sticky left-0 bg-slate-50 dark:bg-slate-900 z-30 font-semibold text-foreground border-r shadow-xs">
                    Escola
                  </TableHead>
                  <TableHead className="w-28 text-center font-semibold text-foreground border-r">
                    Aba
                  </TableHead>
                  {!somenteColunaTotal &&
                    produtosExibidos.map((prod) => (
                      <TableHead
                        key={prod.id}
                        className="text-center min-w-[130px] max-w-[180px] text-xs font-semibold text-foreground px-3"
                        title={`${prod.name} (${prod.unit})`}
                      >
                        <div className="truncate">{prod.name}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {prod.unit} ·{' '}
                          {formatBRL(productPriceMap.get(prod.id) || Number(prod.price) || 0)}
                        </div>
                      </TableHead>
                    ))}
                  <TableHead className="text-center font-bold text-primary min-w-[120px] bg-primary/5 border-l">
                    Total
                  </TableHead>
                </TableRow>
              )}
            </TableHeader>

            <TableBody>
              {tabAtiva === 'produto' ? (
                // CORPO DA MATRIZ POR PRODUTO
                produtosExibidos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={somenteColunaTotal ? 4 : escolasExibidas.length + 4}
                      className="text-center py-12 text-muted-foreground"
                    >
                      Nenhum produto com demanda registrado para este filtro.
                    </TableCell>
                  </TableRow>
                ) : (
                  produtosExibidos.map((prod) => {
                    const unitPrice = productPriceMap.get(prod.id) || Number(prod.price) || 0

                    let rowQtd = 0
                    let rowValor = 0

                    if (!somenteColunaTotal) {
                      for (const sch of escolasExibidas) {
                        const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
                        rowQtd += cell.qtd
                        rowValor += cell.valor
                      }
                    } else {
                      const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
                      rowQtd = tot.totalQtd
                      rowValor = tot.totalValor
                    }

                    return (
                      <TableRow key={prod.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="font-medium sticky left-0 bg-background z-10 border-r py-3">
                          <span className="font-semibold text-sm">{prod.name}</span>
                        </TableCell>
                        <TableCell className="text-xs text-center text-muted-foreground">
                          {prod.unit}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono border-r">
                          {formatBRL(unitPrice)}
                        </TableCell>

                        {!somenteColunaTotal &&
                          escolasExibidas.map((sch) => {
                            const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
                            return (
                              <TableCell
                                key={sch.id}
                                className={`text-center text-xs px-2 py-2 ${
                                  cell.qtd > 0 ? 'bg-primary/[0.03] hover:bg-primary/[0.08]' : ''
                                }`}
                              >
                                {renderCellContent(cell.qtd, cell.valor, prod.unit)}
                              </TableCell>
                            )
                          })}

                        <TableCell className="text-center font-bold font-mono bg-primary/5 text-primary border-l py-2">
                          {renderCellContent(rowQtd, rowValor, prod.unit, true)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )
              ) : // CORPO DA MATRIZ POR ESCOLA
              escolasExibidas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={somenteColunaTotal ? 3 : produtosExibidos.length + 3}
                    className="text-center py-12 text-muted-foreground"
                  >
                    Nenhuma escola com demanda registrada para este filtro.
                  </TableCell>
                </TableRow>
              ) : (
                escolasExibidas.map((sch) => {
                  let rowQtd = 0
                  let rowValor = 0

                  if (!somenteColunaTotal) {
                    for (const prod of produtosExibidos) {
                      const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
                      rowQtd += cell.qtd
                      rowValor += cell.valor
                    }
                  } else {
                    const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
                    rowQtd = tot.totalQtd
                    rowValor = tot.totalValor
                  }

                  return (
                    <TableRow key={sch.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium sticky left-0 bg-background z-10 border-r py-3">
                        <span className="font-semibold text-sm">{sch.name}</span>
                      </TableCell>
                      <TableCell className="text-xs text-center border-r">
                        <span className="text-muted-foreground text-[11px]">
                          {sch.route || '-'}
                        </span>
                      </TableCell>

                      {!somenteColunaTotal &&
                        produtosExibidos.map((prod) => {
                          const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
                          return (
                            <TableCell
                              key={prod.id}
                              className={`text-center text-xs px-2 py-2 ${
                                cell.qtd > 0 ? 'bg-primary/[0.03] hover:bg-primary/[0.08]' : ''
                              }`}
                            >
                              {renderCellContent(cell.qtd, cell.valor, prod.unit)}
                            </TableCell>
                          )
                        })}

                      <TableCell className="text-center font-bold font-mono bg-primary/5 text-primary border-l py-2">
                        {renderCellContent(rowQtd, rowValor, undefined, true)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}

              {/* LINHA DE TOTAL GERAL */}
              {tabAtiva === 'produto' && produtosExibidos.length > 0 && (
                <TableRow className="bg-slate-50 dark:bg-slate-900/80 font-bold border-t-2">
                  <TableCell className="sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r font-bold">
                    Total Geral
                  </TableCell>
                  <TableCell className="text-center">-</TableCell>
                  <TableCell className="text-right border-r">-</TableCell>

                  {!somenteColunaTotal &&
                    escolasExibidas.map((sch) => {
                      const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
                      return (
                        <TableCell key={sch.id} className="text-center text-xs py-2.5">
                          {renderCellContent(totCol.totalQtd, totCol.totalValor, undefined, true)}
                        </TableCell>
                      )
                    })}

                  <TableCell className="text-center font-extrabold font-mono bg-primary/10 text-primary border-l py-2.5">
                    {renderCellContent(totalGeral.qtd, totalGeral.valor, undefined, true)}
                  </TableCell>
                </TableRow>
              )}

              {tabAtiva === 'escola' && escolasExibidas.length > 0 && (
                <TableRow className="bg-slate-50 dark:bg-slate-900/80 font-bold border-t-2">
                  <TableCell className="sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r font-bold">
                    Total Geral
                  </TableCell>
                  <TableCell className="text-center border-r">-</TableCell>

                  {!somenteColunaTotal &&
                    produtosExibidos.map((prod) => {
                      const totCol = totaisColunaPorProduto[prod.id] || {
                        totalQtd: 0,
                        totalValor: 0,
                      }
                      return (
                        <TableCell key={prod.id} className="text-center text-xs py-2.5">
                          {renderCellContent(totCol.totalQtd, totCol.totalValor, prod.unit, true)}
                        </TableCell>
                      )
                    })}

                  <TableCell className="text-center font-extrabold font-mono bg-primary/10 text-primary border-l py-2.5">
                    {renderCellContent(totalGeral.qtd, totalGeral.valor, undefined, true)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
