import React, { useState } from 'react'
import {
  FileText,
  FileSpreadsheet,
  FileDown,
  CalendarCheck,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Package,
  Building2,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/context/app-context'
import { getMonthlyClosingStatus } from '@/lib/monthlyClosing'
import {
  exportToExcel,
  exportToPdf,
  formatCurrencyBRL,
  formatDateBR,
  type TableExportColumn,
} from '@/lib/exportUtils'
import { toast } from 'sonner'

interface MonthlyReportButtonProps {
  className?: string
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'default' | 'sm' | 'lg'
}

export function MonthlyReportButton({
  className,
  variant = 'default',
  size = 'default',
}: MonthlyReportButtonProps) {
  const { contracts, orders, schools, products } = useApp()
  const [modalOpen, setModalOpen] = useState(false)

  const closingStatus = getMonthlyClosingStatus()
  const { isClosingPeriod, closingMonthName, startDateStr, endDateStr, message } = closingStatus

  // Dados filtrados exclusivamente pelo mês de fechamento
  const monthlyOrders = orders.filter((o) => {
    if (o.status !== 'Entregue') return false
    if (startDateStr && o.date < startDateStr) return false
    if (endDateStr && o.date > endDateStr) return false
    return true
  })

  const totalFaturado = monthlyOrders.reduce((sum, o) => sum + (o.total || 0), 0)
  const totalEntregas = monthlyOrders.length
  const escolasAtendidas = new Set(monthlyOrders.map((o) => o.schoolId)).size

  const totalItens = monthlyOrders.reduce(
    (sum, o) => sum + o.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0),
    0,
  )

  // Exportação em Excel do Fechamento Mensal
  const handleExportExcel = () => {
    try {
      const nowStr = new Date().toISOString().split('T')[0]
      const columns: TableExportColumn[] = [
        { header: 'Nº Pedido', key: 'numero', align: 'left', width: 14 },
        { header: 'Data Entrega', key: 'dateStr', align: 'center', width: 14 },
        { header: 'Instituição / Escola', key: 'schoolName', align: 'left', width: 30 },
        { header: 'Qtd Itens', key: 'qtdItens', align: 'center', width: 12 },
        { header: 'Valor Total (R$)', key: 'totalStr', align: 'right', width: 18 },
        { header: 'Status', key: 'status', align: 'center', width: 12 },
      ]

      const rows = monthlyOrders.map((d) => ({
        numero: d.numero,
        dateStr: formatDateBR(d.date),
        schoolName: d.schoolName,
        qtdItens: d.items.length,
        totalStr: formatCurrencyBRL(d.total),
        status: d.status,
      }))

      const footerRows = [
        {
          numero: 'TOTAL CONSOLIDADO DO MÊS',
          dateStr: '',
          schoolName: `${escolasAtendidas} Escolas atendidas`,
          qtdItens: totalItens,
          totalStr: formatCurrencyBRL(totalFaturado),
          status: `${totalEntregas} Pedidos`,
        },
      ]

      exportToExcel({
        title: `Relatório Mensal de Fechamento Contábil — ${closingMonthName}`,
        subtitle:
          'Gerado sob demanda no fechamento do mês (sem automação/job agendado) — CoopGestão',
        filename: `fechamento-mensal-${nowStr}`,
        filters: [
          { label: 'Competência / Mês', value: closingMonthName },
          {
            label: 'Período Contábil',
            value: `${formatDateBR(startDateStr)} a ${formatDateBR(endDateStr)}`,
          },
          { label: 'Tipo de Geração', value: 'Manual sob demanda (Fechamento do Mês)' },
        ],
        columns,
        rows,
        summaryCards: [
          { label: 'Competência', value: closingMonthName },
          { label: 'Faturamento Total', value: formatCurrencyBRL(totalFaturado) },
          { label: 'Entregas Realizadas', value: String(totalEntregas) },
          { label: 'Escolas Atendidas', value: String(escolasAtendidas) },
        ],
        footerRows,
      })

      toast.success('Relatório mensal gerado e exportado em Excel!')
    } catch (err: any) {
      console.error('Erro ao gerar relatório mensal Excel:', err)
      toast.error('Erro ao gerar relatório mensal.')
    }
  }

  // Exportação em PDF do Fechamento Mensal
  const handleExportPdf = () => {
    try {
      const nowStr = new Date().toISOString().split('T')[0]
      const columns: TableExportColumn[] = [
        { header: 'Nº Pedido', key: 'numero', align: 'left' },
        { header: 'Data', key: 'dateStr', align: 'center' },
        { header: 'Instituição / Destino', key: 'schoolName', align: 'left' },
        { header: 'Qtd Itens', key: 'qtdItens', align: 'center' },
        { header: 'Status', key: 'status', align: 'center' },
        { header: 'Valor Total', key: 'totalStr', align: 'right' },
      ]

      const rows = monthlyOrders.map((d) => ({
        numero: d.numero,
        dateStr: formatDateBR(d.date),
        schoolName: d.schoolName,
        qtdItens: d.items.length,
        status: d.status,
        totalStr: formatCurrencyBRL(d.total),
      }))

      const footerRows = [
        {
          numero: 'TOTAL CONSOLIDADO',
          dateStr: '',
          schoolName: `${escolasAtendidas} Escolas`,
          qtdItens: `${totalItens} un/kg`,
          status: `${totalEntregas} Pedidos`,
          totalStr: formatCurrencyBRL(totalFaturado),
        },
      ]

      exportToPdf({
        title: `Relatório Mensal de Fechamento — ${closingMonthName}`,
        subtitle: 'Demonstrativo contábil emitido sob demanda no fechamento do mês (PNAE/PAA)',
        filename: `fechamento-mensal-${nowStr}`,
        filters: [
          { label: 'Competência', value: closingMonthName },
          {
            label: 'Período',
            value: `${formatDateBR(startDateStr)} a ${formatDateBR(endDateStr)}`,
          },
          { label: 'Disponibilidade', value: 'Manual no Fechamento' },
        ],
        columns,
        rows,
        summaryCards: [
          { label: 'Competência', value: closingMonthName },
          { label: 'Faturamento do Mês', value: formatCurrencyBRL(totalFaturado) },
          { label: 'Total de Entregas', value: String(totalEntregas) },
          { label: 'Escolas Atendidas', value: String(escolasAtendidas) },
        ],
        footerRows,
      })

      toast.success('Relatório mensal gerado e exportado em PDF!')
    } catch (err: any) {
      console.error('Erro ao gerar relatório mensal PDF:', err)
      toast.error('Erro ao gerar relatório mensal.')
    }
  }

  // Render do botão com Tooltip quando desabilitado
  const renderTrigger = () => {
    if (!isClosingPeriod) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <span className="inline-block cursor-not-allowed">
                <Button
                  variant={variant}
                  size={size}
                  disabled
                  className={`opacity-60 pointer-events-none gap-2 ${className || ''}`}
                >
                  <Lock className="h-4 w-4" />
                  Relatório Mensal
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs p-3">
              <div className="space-y-1">
                <p className="font-semibold text-amber-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Disponível no Fechamento do Mês
                </p>
                <p>{message}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return (
      <Button
        variant={variant}
        size={size}
        onClick={() => setModalOpen(true)}
        className={`gap-2 ${className || ''}`}
      >
        <CalendarCheck className="h-4 w-4 text-emerald-500" />
        Relatório Mensal ({closingMonthName})
      </Button>
    )
  }

  return (
    <>
      {renderTrigger()}

      {/* Modal com o resumo e botões de exportação sob demanda */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary mb-1">
              <CalendarCheck className="h-5 w-5 text-emerald-600" />
              <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 text-xs">
                Fechamento do Mês Ativo
              </Badge>
            </div>
            <DialogTitle className="text-xl font-bold">
              Relatório Mensal — {closingMonthName}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {message}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-muted/40 p-3 rounded-lg border">
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>Faturamento</span>
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="text-lg font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyBRL(totalFaturado)}
                </div>
                <span className="text-[10px] text-muted-foreground">entregas faturadas</span>
              </div>

              <div className="bg-muted/40 p-3 rounded-lg border">
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>Entregas</span>
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="text-lg font-bold mt-1 text-foreground">{totalEntregas}</div>
                <span className="text-[10px] text-muted-foreground">pedidos concluídos</span>
              </div>

              <div className="bg-muted/40 p-3 rounded-lg border col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>Escolas</span>
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="text-lg font-bold mt-1 text-foreground">{escolasAtendidas}</div>
                <span className="text-[10px] text-muted-foreground">destinos atendidos</span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/20 p-3 rounded border space-y-1">
              <p>
                <strong>Período consolidado:</strong> {formatDateBR(startDateStr)} até{' '}
                {formatDateBR(endDateStr)}.
              </p>
              <p>
                <strong>Regra operacional:</strong> Relatório gerado exclusivamente por clique
                manual do usuário (sem envio nem cron job automático).
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportExcel}
              className="gap-2 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Exportar Excel (.xlsx)
            </Button>
            <Button type="button" onClick={handleExportPdf} className="gap-2">
              <FileDown className="h-4 w-4" />
              Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
