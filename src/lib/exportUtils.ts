import jsPDF from 'jspdf'
import autoTable, { applyPlugin } from 'jspdf-autotable'
import * as XLSX from 'xlsx'

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

export interface ReportFilterSummary {
  label: string
  value: string
}

export interface TableExportColumn {
  header: string
  key: string
  align?: 'left' | 'center' | 'right'
  width?: number
}

export interface ExportReportOptions {
  title: string
  subtitle?: string
  filename: string
  filters: ReportFilterSummary[]
  columns: TableExportColumn[]
  rows: Record<string, any>[]
  summaryCards?: Array<{ label: string; value: string }>
  footerRows?: Record<string, any>[]
}

/**
 * Format currency to Brazilian Real format
 */
export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

/**
 * Format date ISO string (YYYY-MM-DD or full timestamp) to Brazilian date DD/MM/YYYY
 */
export function formatDateBR(dateStr?: string): string {
  if (!dateStr) return '-'
  try {
    const raw = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0]
    const [year, month, day] = raw.split('-')
    if (!year || !month || !day) return dateStr
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
  } catch {
    return dateStr
  }
}

/**
 * Export real Excel (.xlsx) using SheetJS
 */
export function exportToExcel(options: ExportReportOptions): void {
  const { title, subtitle, filename, filters, columns, rows, summaryCards, footerRows } = options

  const wb = XLSX.utils.book_new()

  // Build 2D array for the worksheet
  const wsData: any[][] = []

  // Header branding & title
  wsData.push(['CooperGestão — Cooperativa Agrícola Familiar'])
  wsData.push([title.toUpperCase()])
  if (subtitle) {
    wsData.push([subtitle])
  }
  wsData.push([]) // blank row

  // Metadata: generation time and filters
  const now = new Date()
  const genDateStr = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  wsData.push(['Data de Geração:', genDateStr])

  if (filters.length > 0) {
    wsData.push(['Filtros aplicados:'])
    for (const f of filters) {
      wsData.push([`  • ${f.label}:`, f.value])
    }
  }
  wsData.push([]) // blank row

  // Summary Metrics (if provided)
  if (summaryCards && summaryCards.length > 0) {
    wsData.push(['RESUMO EXECUTIVO'])
    const metricsRow1: string[] = []
    const metricsRow2: string[] = []
    summaryCards.forEach((card) => {
      metricsRow1.push(card.label)
      metricsRow2.push(card.value)
    })
    wsData.push(metricsRow1)
    wsData.push(metricsRow2)
    wsData.push([]) // blank row
  }

  // Table Column Headers
  const tableHeaders = columns.map((col) => col.header)
  wsData.push(tableHeaders)

  // Table Body Rows
  for (const row of rows) {
    const rowValues = columns.map((col) => {
      const val = row[col.key]
      return val !== undefined && val !== null ? val : ''
    })
    wsData.push(rowValues)
  }

  // Footer/Totalizer Rows
  if (footerRows && footerRows.length > 0) {
    for (const fRow of footerRows) {
      const fRowValues = columns.map((col) => {
        const val = fRow[col.key]
        return val !== undefined && val !== null ? val : ''
      })
      wsData.push(fRowValues)
    }
  }

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Configure column widths
  const colWidths = columns.map((col) => ({
    wch: Math.max(col.header.length + 4, col.width || 16),
  }))
  ws['!cols'] = colWidths

  // Append sheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório Contábil')

  // Generate and download XLSX file
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(wb, safeFilename)
}

/**
 * Export real PDF using jsPDF and jspdf-autotable
 */
export function exportToPdf(options: ExportReportOptions): void {
  const { title, subtitle, filename, filters, columns, rows, summaryCards, footerRows } = options

  // Orientation: landscape if more than 5 columns for great readability
  const isLandscape = columns.length > 5
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Primary Theme Colors (Forest green matching CooperGestão theme)
  const primaryColor = [31, 77, 28] as const // #1F4D1C
  const primaryLightColor = [240, 248, 240] as const
  const textDark = [30, 41, 59] as const // Slate 800
  const textMuted = [100, 116, 139] as const // Slate 500

  // 1. Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.rect(0, 0, pageWidth, 24, 'F')

  // Header Title
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('CooperGestão — Cooperativa Agrícola Familiar', 14, 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Prestação de Contas • PNAE / PAA / Institucional', 14, 18)

  const now = new Date()
  const genDateStr = `Emissão: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  doc.setFontSize(8)
  doc.text(genDateStr, pageWidth - 14, 15, { align: 'right' })

  // 2. Report Title & Subtitle
  let currentY = 33
  doc.setTextColor(textDark[0], textDark[1], textDark[2])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(title, 14, currentY)

  currentY += 5
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text(subtitle, 14, currentY)
    currentY += 6
  }

  // 3. Filters Box
  if (filters.length > 0) {
    const filterTexts = filters.map((f) => `${f.label}: ${f.value}`).join('   |   ')
    doc.setFontSize(8)
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.setFillColor(primaryLightColor[0], primaryLightColor[1], primaryLightColor[2])
    doc.roundedRect(14, currentY, pageWidth - 28, 8, 1.5, 1.5, 'F')
    doc.text(`Filtros: ${filterTexts}`, 17, currentY + 5.5)
    currentY += 12
  } else {
    currentY += 4
  }

  // 4. Summary Executive Cards
  if (summaryCards && summaryCards.length > 0) {
    const cardGap = 4
    const totalGap = cardGap * (summaryCards.length - 1)
    const availableWidth = pageWidth - 28 - totalGap
    const cardWidth = availableWidth / summaryCards.length
    const cardHeight = 15

    summaryCards.forEach((card, idx) => {
      const cardX = 14 + idx * (cardWidth + cardGap)
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(card.label.toUpperCase(), cardX + 3.5, currentY + 5.5)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.text(card.value, cardX + 3.5, currentY + 11.5)
    })

    currentY += cardHeight + 6
  }

  // 5. Build Table Data for autoTable
  const head = [columns.map((c) => c.header)]
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key]
      return val !== undefined && val !== null ? String(val) : ''
    }),
  )

  const foot =
    footerRows && footerRows.length > 0
      ? footerRows.map((fRow) =>
          columns.map((c) => {
            const val = fRow[c.key]
            return val !== undefined && val !== null ? String(val) : ''
          }),
        )
      : undefined

  // Column styles mapping
  const columnStyles: Record<number, any> = {}
  columns.forEach((col, idx) => {
    columnStyles[idx] = {
      halign: col.align || 'left',
    }
  })

  runAutoTable(doc, {
    startY: currentY,
    head,
    body,
    foot,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [31, 77, 28],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineWidth: 0.3,
      lineColor: [203, 213, 225],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    margin: { left: 14, right: 14, bottom: 18 },
    didDrawPage: (data) => {
      // Footer page numbering & attribution
      const str = `Página ${data.pageNumber}`
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(
        'CooperGestão • Cooperativa Agrícola Familiar — Relatório Contábil PNAE/PAA',
        14,
        pageHeight - 8,
      )
      doc.text(str, pageWidth - 14, pageHeight - 8, { align: 'right' })
    },
  })

  // Download directly
  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  doc.save(safeFilename)
}
