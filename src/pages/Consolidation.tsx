import { useState, useMemo, useEffect } from 'react'
import { useApp } from '@/context/app-context'
import { rotasService } from '@/services/rotas'
import type { ParadaRotaRecord, School } from '@/lib/types'
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
  Route,
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

/**
 * Abreviação inteligente de nomes de escolas em português para cabeçalhos verticais compactos.
 * Preserva nomes próprios e trunca com reticências se ainda exceder o limite razoável.
 */
export function abreviarNomeEscola(nome: string, maxLength = 26): string {
  if (!nome) return ''
  let s = nome.trim()

  // Substituições de prefixos institucionais comuns
  const regras: [RegExp, string][] = [
    [/\bEscola\s+Municipal\s+de\s+Educa[çc][ãa]o\s+Infantil\b/gi, 'EMEI'],
    [/\bEscola\s+Municipal\s+de\s+Educa[çc][ãa]o\s+B[áa]sica\b/gi, 'EMEB'],
    [/\bEscola\s+Municipal\s+de\s+Ensino\s+Fundamental\b/gi, 'EMEF'],
    [/\bEscola\s+Estadual\s+de\s+Ensino\s+Fundamental\b/gi, 'EEEF'],
    [/\bEscola\s+Estadual\s+de\s+Ensino\s+M[ée]dio\b/gi, 'EEEM'],
    [/\bCentro\s+Municipal\s+de\s+Educa[çc][ãa]o\s+Infantil\b/gi, 'CMEI'],
    [/\bCentro\s+de\s+Educa[çc][ãa]o\s+Infantil\b/gi, 'CEI'],
    [/\bCentro\s+de\s+Educa[çc][ãa]o\b/gi, 'C. Educ.'],
    [/\bEscola\s+Municipal\b/gi, 'E.M.'],
    [/\bEscola\s+Estadual\b/gi, 'E.E.'],
    [/\bCol[ée]gio\s+Estadual\b/gi, 'C.E.'],
    [/\bCol[ée]gio\s+Municipal\b/gi, 'C.M.'],
    [/\bCol[ée]gio\b/gi, 'Col.'],
    [/\bCreche\s+Municipal\b/gi, 'Cr. Mun.'],
    [/\bCreche\b/gi, 'Cr.'],
    [/\bInstituto\b/gi, 'Inst.'],
    [/\bProfessora\b/gi, 'Profª.'],
    [/\bProfessor\b/gi, 'Prof.'],
    [/\bDoutora\b/gi, 'Dra.'],
    [/\bDoutor\b/gi, 'Dr.'],
    [/\bVereador\b/gi, 'Ver.'],
    [/\bDeputado\b/gi, 'Dep.'],
  ]

  for (const [padrao, subst] of regras) {
    s = s.replace(padrao, subst)
  }

  // Limpa espaços duplos
  s = s.replace(/\s+/g, ' ').trim()

  if (s.length > maxLength) {
    return s.slice(0, maxLength - 1).trim() + '…'
  }
  return s
}

export default function Consolidation() {
  const {
    products,
    schools,
    orders,
    chamadas,
    ciclos,
    activeCiclo,
    contractItems,
    contracts,
    rotas,
    paradasRota,
  } = useApp()

  const [selectedCicloId, setSelectedCicloId] = useState<string>(activeCiclo?.id || 'todos')
  const [selectedChamadaId, setSelectedChamadaId] = useState<string>(
    activeCiclo?.chamada_id || (chamadas[0]?.id ?? 'todas'),
  )
  const [tabAtiva, setTabAtiva] = useState<'produto' | 'escola'>('produto')
  const [filtroEscolaModo, setFiltroEscolaModo] = useState<'todas' | 'rota'>('todas')
  const [selectedRotaId, setSelectedRotaId] = useState<string>('')
  const [liveParadas, setLiveParadas] = useState<ParadaRotaRecord[]>([])
  const [todasParadasMap, setTodasParadasMap] = useState<Record<string, ParadaRotaRecord[]>>({})
  const [somenteColunaTotal, setSomenteColunaTotal] = useState(false)
  const [totaisPorRotaAtivo, setTotaisPorRotaAtivo] = useState(false)
  const [ocultarVazios, setOcultarVazios] = useState(true)
  const [modoExibicao, setModoExibicao] = useState<ModoExibicao>('ambos')
  const [filtroTexto, setFiltroTexto] = useState('')

  // Resolver chamada efetiva selecionada no relatório
  const effectiveChamadaId = useMemo(() => {
    if (selectedChamadaId !== 'todas') return selectedChamadaId
    if (selectedCicloId !== 'todos') {
      const c = ciclos.find((ci) => ci.id === selectedCicloId)
      if (c?.chamada_id) return c.chamada_id
    }
    if (activeCiclo?.chamada_id) return activeCiclo.chamada_id
    return chamadas[0]?.id || ''
  }, [selectedChamadaId, selectedCicloId, ciclos, activeCiclo, chamadas])

  // Rotas disponíveis SOMENTE da chamada selecionada no relatório
  const rotasDaChamada = useMemo(() => {
    if (!effectiveChamadaId) {
      return rotas.filter((r) => r.ativa !== false)
    }
    const contratosDaChamadaIds = new Set(
      contracts.filter((c) => c.chamada_id === effectiveChamadaId).map((c) => c.id),
    )
    return rotas
      .filter((r) => {
        if (r.ativa === false) return false
        if (r.chamada_id && r.chamada_id === effectiveChamadaId) return true
        if (r.contrato_id && contratosDaChamadaIds.has(r.contrato_id)) return true
        return false
      })
      .sort(
        (a, b) =>
          (Number(a.ordem) || 0) - (Number(b.ordem) || 0) ||
          (a.nome || '').localeCompare(b.nome || ''),
      )
  }, [rotas, effectiveChamadaId, contracts])

  // Garantir seleção de rota válida quando o modo "Por rota" estiver ativo
  useEffect(() => {
    if (filtroEscolaModo === 'rota') {
      if (rotasDaChamada.length > 0) {
        const rotaValida = rotasDaChamada.find((r) => r.id === selectedRotaId)
        if (!rotaValida) {
          setSelectedRotaId(rotasDaChamada[0].id)
        }
      } else {
        setSelectedRotaId('')
      }
    }
  }, [filtroEscolaModo, rotasDaChamada, selectedRotaId])

  // Buscar paradas atualizadas em tempo real da rota selecionada
  useEffect(() => {
    if (!selectedRotaId || selectedRotaId === '__vazio__') {
      setLiveParadas([])
      return
    }
    let isMounted = true
    rotasService
      .getParadas(selectedRotaId)
      .then((paradas) => {
        if (isMounted && paradas && paradas.length > 0) {
          setLiveParadas(paradas)
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar paradas da rota no relatório:', err)
      })
    return () => {
      isMounted = false
    }
  }, [selectedRotaId])

  // Buscar paradas de todas as rotas da chamada para alimentar os subtotais por rota com dados reais
  useEffect(() => {
    if (rotasDaChamada.length === 0) {
      setTodasParadasMap({})
      return
    }
    let isMounted = true
    // Buscar em paralelo as paradas de cada rota da chamada
    Promise.all(
      rotasDaChamada.map(async (r) => {
        // Se o contexto já tiver paradas dessa rota, podemos usar como fallback,
        // mas buscar via rotasService garante paradas atualizadas e completas
        try {
          const paradas = await rotasService.getParadas(r.id)
          return { rotaId: r.id, paradas: paradas || [] }
        } catch (err) {
          console.warn(`Erro ao carregar paradas da rota ${r.id}:`, err)
          const fallback = paradasRota.filter(
            (p) => p.rota_id === r.id || (p as any).rota_logistica_id === r.id,
          )
          return { rotaId: r.id, paradas: fallback }
        }
      }),
    ).then((results) => {
      if (!isMounted) return
      const map: Record<string, ParadaRotaRecord[]> = {}
      for (const res of results) {
        map[res.rotaId] = res.paradas
      }
      setTodasParadasMap(map)
    })

    return () => {
      isMounted = false
    }
  }, [rotasDaChamada, paradasRota])

  // Paradas ordenadas da rota selecionada (prioriza liveParadas, fallback para paradasRota do contexto)
  const paradasDaRota = useMemo(() => {
    if (!selectedRotaId || selectedRotaId === '__vazio__') return []
    const list =
      liveParadas.length > 0
        ? liveParadas
        : paradasRota.filter(
            (p) => p.rota_id === selectedRotaId || (p as any).rota_logistica_id === selectedRotaId,
          )
    return [...list].sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
  }, [selectedRotaId, liveParadas, paradasRota])

  // Mapa escolaId -> ordem da parada na rota
  const escolaOrdemParadaMap = useMemo(() => {
    const map = new Map<string, number>()
    paradasDaRota.forEach((p, idx) => {
      map.set(p.escola_id, p.ordem || idx + 1)
    })
    return map
  }, [paradasDaRota])

  const selectedRotaObj = useMemo(() => {
    return (
      rotasDaChamada.find((r) => r.id === selectedRotaId) ||
      rotas.find((r) => r.id === selectedRotaId)
    )
  }, [rotasDaChamada, rotas, selectedRotaId])

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

  // Escolas pertencentes à rota selecionada NA SEQUÊNCIA DAS PARADAS
  const escolasDaRotaOrdenadas = useMemo(() => {
    if (tabAtiva !== 'produto' || filtroEscolaModo !== 'rota' || !selectedRotaId) {
      return null
    }
    const result: School[] = []
    const seen = new Set<string>()
    for (const p of paradasDaRota) {
      if (!seen.has(p.escola_id)) {
        seen.add(p.escola_id)
        const sch = schools.find((s) => s.id === p.escola_id)
        if (sch) {
          result.push(sch)
        }
      }
    }
    return result
  }, [tabAtiva, filtroEscolaModo, selectedRotaId, paradasDaRota, schools])

  // Escolas exibidas: quando por rota, segue estritamente a sequência de paradas da rota
  const escolasExibidas = useMemo(() => {
    const baseList = escolasDaRotaOrdenadas !== null ? escolasDaRotaOrdenadas : schools

    return baseList.filter((s) => {
      if (filtroTexto.trim()) {
        const match = s.name.toLowerCase().includes(filtroTexto.toLowerCase())
        if (!match) return false
      }
      if (!ocultarVazios) return true
      const tot = totaisPorEscola[s.id]
      return tot && (tot.totalQtd > 0 || tot.totalValor > 0)
    })
  }, [escolasDaRotaOrdenadas, schools, totaisPorEscola, ocultarVazios, filtroTexto])

  // Totais de produto restritos às escolas da rota exibida
  const totaisPorProdutoNaRota = useMemo(() => {
    const res: Record<string, { totalQtd: number; totalValor: number }> = {}
    for (const prod of products) {
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
  }, [products, escolasExibidas, matriz])

  // Produtos exibidos com filtro de busca e toggle de ocultar vazios
  const produtosExibidos = useMemo(() => {
    const isModoRota =
      tabAtiva === 'produto' && filtroEscolaModo === 'rota' && Boolean(selectedRotaId)

    return products.filter((p) => {
      if (filtroTexto.trim()) {
        const match = p.name.toLowerCase().includes(filtroTexto.toLowerCase())
        if (!match) return false
      }
      if (!ocultarVazios) return true
      const tot = isModoRota ? totaisPorProdutoNaRota[p.id] : totaisPorProduto[p.id]
      return tot && (tot.totalQtd > 0 || tot.totalValor > 0)
    })
  }, [
    products,
    totaisPorProduto,
    totaisPorProdutoNaRota,
    ocultarVazios,
    filtroTexto,
    tabAtiva,
    filtroEscolaModo,
    selectedRotaId,
  ])

  // Total Geral da Consolidação (considera os itens exibidos)
  const totalGeral = useMemo(() => {
    let qtd = 0
    let valor = 0
    if (tabAtiva === 'produto') {
      const isModoRota = filtroEscolaModo === 'rota' && Boolean(selectedRotaId)
      for (const prod of produtosExibidos) {
        if (somenteColunaTotal && !isModoRota) {
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
    filtroEscolaModo,
    selectedRotaId,
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

  // Mapa de todas as paradas por rota para as rotas da chamada
  // Permite calcular os totais por rota na ordem das paradas de cada rota
  const rotasComParadas = useMemo(() => {
    return rotasDaChamada.map((r) => {
      // Paradas da rota: se for a selecionada e tiver liveParadas, usa liveParadas, senão paradasRota do contexto
      const rawParadas =
        r.id === selectedRotaId && liveParadas.length > 0
          ? liveParadas
          : paradasRota.filter((p) => p.rota_id === r.id || (p as any).rota_logistica_id === r.id)
      const sortedParadas = [...rawParadas].sort(
        (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0),
      )
      // Escolas únicas na ordem das paradas
      const seen = new Set<string>()
      const escolaIdsNaOrdem: string[] = []
      for (const p of sortedParadas) {
        if (!seen.has(p.escola_id)) {
          seen.add(p.escola_id)
          escolaIdsNaOrdem.push(p.escola_id)
        }
      }
      return {
        rota: r,
        escolaIds: escolaIdsNaOrdem,
      }
    })
  }, [rotasDaChamada, selectedRotaId, liveParadas, paradasRota])

  // Mapa de subtotais por produto por rota: rotaId -> Map<produtoId, { qtd, valor }>
  const subtotalPorProdutoERota = useMemo(() => {
    const map = new Map<string, Map<string, { qtd: number; valor: number }>>()
    for (const { rota, escolaIds } of rotasComParadas) {
      const prodMap = new Map<string, { qtd: number; valor: number }>()
      for (const prod of produtosExibidos) {
        let q = 0
        let v = 0
        for (const schId of escolaIds) {
          const cell = matriz.get(prod.id)?.get(schId)
          if (cell) {
            q += cell.qtd
            v += cell.valor
          }
        }
        prodMap.set(prod.id, { qtd: q, valor: v })
      }
      map.set(rota.id, prodMap)
    }
    return map
  }, [rotasComParadas, produtosExibidos, matriz])

  // Subtotais consolidados por rota (soma de todos os produtos para cada rota)
  const totaisPorRotaCalculados = useMemo(() => {
    return rotasComParadas.map(({ rota, escolaIds }) => {
      let rotaQtd = 0
      let rotaValor = 0
      const prodMap = subtotalPorProdutoERota.get(rota.id)
      if (prodMap) {
        for (const cell of prodMap.values()) {
          rotaQtd += cell.qtd
          rotaValor += cell.valor
        }
      }
      return {
        rota,
        qtd: rotaQtd,
        valor: rotaValor,
        numEscolas: escolaIds.length,
      }
    })
  }, [rotasComParadas, subtotalPorProdutoERota])

  // Helper para renderizar célula na interface
  // showUnit=false por padrão nas células de escola da aba Por Produto (unidade já está em Produto)
  const renderCellContent = (
    qtd: number,
    valor: number,
    unit?: string,
    isTotal = false,
    showUnit = false,
  ) => {
    if (qtd <= 0 && valor <= 0 && !isTotal) {
      return <span className="text-muted-foreground/30 font-mono">-</span>
    }

    const unitStr = showUnit && unit ? ` ${unit}` : ''

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

  const chamadaSelecionadaNome =
    selectedChamadaId === 'todas'
      ? 'Todas as Chamadas'
      : chamadas.find((ch) => ch.id === selectedChamadaId)?.chamada || 'Chamada Selecionada'

  // ==========================================
  // EXPORTAÇÃO XLSX (Planilha Real)
  // ==========================================
  const exportarXLSX = () => {
    try {
      const wb = XLSX.utils.book_new()
      const dataRows: any[][] = []

      const isModoRota =
        tabAtiva === 'produto' && filtroEscolaModo === 'rota' && Boolean(selectedRotaObj)
      const rotaInfo = isModoRota
        ? `Rota: ${selectedRotaObj?.nome} (Sequência das Paradas)`
        : 'Escolas: Todas as Escolas'

      // Título e Metadados
      dataRows.push(['CONSOLIDAÇÃO FINAL — MATRIZ DE PEDIDOS PARA LOGÍSTICA'])
      dataRows.push([
        `Aba: ${tabAtiva === 'produto' ? 'Por Produto (Produto × Escola)' : 'Por Escola (Escola × Produto)'}`,
      ])
      dataRows.push([
        `Ciclo: ${cicloSelecionadoNome}`,
        `Chamada: ${chamadaSelecionadaNome}`,
        rotaInfo,
        `Modo: ${modoExibicao === 'qtd' ? 'Quantidade' : modoExibicao === 'valor' ? 'Valor (R$)' : 'Ambos (Qtd + R$)'}`,
        `Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      ])
      dataRows.push([]) // Linha em branco

      if (tabAtiva === 'produto') {
        const isTotaisPorRotaModo = somenteColunaTotal && totaisPorRotaAtivo

        // Headers: Total à esquerda junto de produto (Produto, Total, Unidade, Preço Unitário)
        const headers = ['Produto', 'Total', 'Unidade', 'Preço Unitário (R$)']
        if (!somenteColunaTotal) {
          headers.push(
            ...escolasExibidas.map((e, idx) => {
              const paradaNum = escolaOrdemParadaMap.get(e.id) || idx + 1
              return isModoRota ? `${paradaNum}ª Parada - ${e.name}` : e.name
            }),
          )
        } else if (isTotaisPorRotaModo) {
          // No modo Somente coluna de Total com Totais por rota ativado:
          // colunas de subtotais por rota e última coluna Total Geral
          headers.push(...rotasDaChamada.map((r) => `Rota: ${r.nome}`))
          headers.push('Total Geral')
        }
        dataRows.push(headers)

        // Linhas de dados
        for (const prod of produtosExibidos) {
          const unitPrice = productPriceMap.get(prod.id) || Number(prod.price) || 0

          let rowQtd = 0
          let rowValor = 0
          const schoolCells: any[] = []

          if (!somenteColunaTotal) {
            for (const sch of escolasExibidas) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              schoolCells.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            if (isModoRota) {
              const tot = totaisPorProdutoNaRota[prod.id] || { totalQtd: 0, totalValor: 0 }
              rowQtd = tot.totalQtd
              rowValor = tot.totalValor
            } else {
              const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
              rowQtd = tot.totalQtd
              rowValor = tot.totalValor
            }

            if (isTotaisPorRotaModo) {
              for (const r of rotasDaChamada) {
                const sub = subtotalPorProdutoERota.get(r.id)?.get(prod.id) || { qtd: 0, valor: 0 }
                schoolCells.push(getCellExportText(sub.qtd, sub.valor, prod.unit, true))
              }
              // Última coluna: Total Geral do produto
              schoolCells.push(getCellExportText(rowQtd, rowValor, prod.unit, true))
            }
          }

          const row: any[] = [
            prod.name,
            getCellExportText(rowQtd, rowValor, prod.unit, true),
            prod.unit,
            unitPrice,
            ...schoolCells,
          ]
          dataRows.push(row)
        }

        // Linha Total Geral
        const footer: any[] = [
          'TOTAL GERAL',
          getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true),
          '',
          '',
        ]
        if (!somenteColunaTotal) {
          for (const sch of escolasExibidas) {
            const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, undefined, true))
          }
        } else if (isTotaisPorRotaModo) {
          for (const r of rotasDaChamada) {
            const rotaCalc = totaisPorRotaCalculados.find((t) => t.rota.id === r.id)
            const q = rotaCalc ? rotaCalc.qtd : 0
            const v = rotaCalc ? rotaCalc.valor : 0
            footer.push(getCellExportText(q, v, undefined, true))
          }
          // Total Geral final
          footer.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        }
        dataRows.push(footer)
      } else {
        // Aba Por Escola: Total à esquerda junto de Escola (Escola, Total, Aba)
        const headers = ['Escola', 'Total', 'Aba']
        if (!somenteColunaTotal) {
          headers.push(...produtosExibidos.map((p) => `${p.name} (${p.unit})`))
        }
        dataRows.push(headers)

        for (const sch of escolasExibidas) {
          let rowQtd = 0
          let rowValor = 0
          const prodCells: any[] = []

          if (!somenteColunaTotal) {
            for (const prod of produtosExibidos) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              prodCells.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          const row: any[] = [
            sch.name,
            getCellExportText(rowQtd, rowValor, undefined, true),
            sch.route || '-',
            ...prodCells,
          ]
          dataRows.push(row)
        }

        // Linha Total Geral
        const footer: any[] = [
          'TOTAL GERAL',
          getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true),
          '',
        ]
        if (!somenteColunaTotal) {
          for (const prod of produtosExibidos) {
            const totCol = totaisColunaPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, prod.unit, true))
          }
        }
        dataRows.push(footer)
      }

      const ws = XLSX.utils.aoa_to_sheet(dataRows)
      XLSX.utils.book_append_sheet(wb, ws, 'Consolidação Final')

      const dateStr = new Date().toISOString().split('T')[0]
      const rotaSlug = isModoRota ? `-${selectedRotaObj?.nome?.replace(/\s+/g, '_')}` : ''
      const filename = `consolidacao-final-${tabAtiva}${rotaSlug}-${dateStr}.xlsx`
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
      const isModoRota =
        tabAtiva === 'produto' && filtroEscolaModo === 'rota' && Boolean(selectedRotaObj)

      if (tabAtiva === 'produto') {
        const isTotaisPorRotaModo = somenteColunaTotal && totaisPorRotaAtivo

        const headers = ['Produto', 'Total', 'Unidade', 'Preço Unitário (R$)']
        if (!somenteColunaTotal) {
          headers.push(
            ...escolasExibidas.map((e, idx) => {
              const paradaNum = escolaOrdemParadaMap.get(e.id) || idx + 1
              return isModoRota ? `${paradaNum}ª Parada - ${e.name}` : e.name
            }),
          )
        } else if (isTotaisPorRotaModo) {
          headers.push(...rotasDaChamada.map((r) => `Rota: ${r.nome}`))
          headers.push('Total Geral')
        }
        rows.push(headers)

        for (const prod of produtosExibidos) {
          const unitPrice = productPriceMap.get(prod.id) || Number(prod.price) || 0

          let rowQtd = 0
          let rowValor = 0
          const schoolCells: string[] = []

          if (!somenteColunaTotal) {
            for (const sch of escolasExibidas) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              schoolCells.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            if (isModoRota) {
              const tot = totaisPorProdutoNaRota[prod.id] || { totalQtd: 0, totalValor: 0 }
              rowQtd = tot.totalQtd
              rowValor = tot.totalValor
            } else {
              const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
              rowQtd = tot.totalQtd
              rowValor = tot.totalValor
            }

            if (isTotaisPorRotaModo) {
              for (const r of rotasDaChamada) {
                const sub = subtotalPorProdutoERota.get(r.id)?.get(prod.id) || { qtd: 0, valor: 0 }
                schoolCells.push(getCellExportText(sub.qtd, sub.valor, prod.unit, true))
              }
              schoolCells.push(getCellExportText(rowQtd, rowValor, prod.unit, true))
            }
          }

          const row: string[] = [
            prod.name,
            getCellExportText(rowQtd, rowValor, prod.unit, true),
            prod.unit,
            unitPrice.toFixed(2),
            ...schoolCells,
          ]
          rows.push(row)
        }

        const footer: string[] = [
          'TOTAL GERAL',
          getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true),
          '',
          '',
        ]
        if (!somenteColunaTotal) {
          for (const sch of escolasExibidas) {
            const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, undefined, true))
          }
        } else if (isTotaisPorRotaModo) {
          for (const r of rotasDaChamada) {
            const rotaCalc = totaisPorRotaCalculados.find((t) => t.rota.id === r.id)
            const q = rotaCalc ? rotaCalc.qtd : 0
            const v = rotaCalc ? rotaCalc.valor : 0
            footer.push(getCellExportText(q, v, undefined, true))
          }
          footer.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        }
        rows.push(footer)
      } else {
        const headers = ['Escola', 'Total', 'Aba']
        if (!somenteColunaTotal) {
          headers.push(...produtosExibidos.map((p) => `${p.name} (${p.unit})`))
        }
        rows.push(headers)

        for (const sch of escolasExibidas) {
          let rowQtd = 0
          let rowValor = 0
          const prodCells: string[] = []

          if (!somenteColunaTotal) {
            for (const prod of produtosExibidos) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              prodCells.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          const row: string[] = [
            sch.name,
            getCellExportText(rowQtd, rowValor, undefined, true),
            sch.route || '-',
            ...prodCells,
          ]
          rows.push(row)
        }

        const footer: string[] = [
          'TOTAL GERAL',
          getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true),
          '',
        ]
        if (!somenteColunaTotal) {
          for (const prod of produtosExibidos) {
            const totCol = totaisColunaPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            footer.push(getCellExportText(totCol.totalQtd, totCol.totalValor, prod.unit, true))
          }
        }
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
      const rotaSlug = isModoRota ? `-${selectedRotaObj?.nome?.replace(/\s+/g, '_')}` : ''
      a.href = url
      a.download = `consolidacao-final-${tabAtiva}${rotaSlug}-${dateStr}.csv`
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
      const isModoRota =
        tabAtiva === 'produto' && filtroEscolaModo === 'rota' && Boolean(selectedRotaObj)

      const isTotaisPorRotaModo = tabAtiva === 'produto' && somenteColunaTotal && totaisPorRotaAtivo

      const colsCount =
        tabAtiva === 'produto'
          ? somenteColunaTotal
            ? isTotaisPorRotaModo
              ? rotasDaChamada.length + 5 // Produto, Total, Un., Preço + rotas + Total Geral
              : 4
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
      const subAba =
        tabAtiva === 'produto'
          ? isModoRota
            ? `Por Produto • Rota: ${selectedRotaObj?.nome} (Sequência das Paradas)`
            : 'Por Produto • Matriz de pedidos para logística'
          : 'Por Escola • Matriz de pedidos para logística'
      doc.text(subAba, 14, 16)

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

      const rotaInfoPdf = isModoRota ? `   |   Rota: ${selectedRotaObj?.nome} (Paradas)` : ''
      const filtrosTexto = `Ciclo: ${cicloSelecionadoNome}   |   Chamada: ${chamadaSelecionadaNome}${rotaInfoPdf}   |   Modo: ${modoTexto}   |   Total Geral: ${formatNumber(totalGeral.qtd)} un/kg — ${formatBRL(totalGeral.valor)}`
      doc.text(filtrosTexto, 17, currentY + 5.5)

      currentY += 13

      // Montar tabela para autoTable
      let head: string[][] = []
      let body: string[][] = []
      let foot: string[][] = []

      if (tabAtiva === 'produto') {
        const headerRow = ['Produto', 'Total', 'Un.', 'Preço']
        if (!somenteColunaTotal) {
          headerRow.push(
            ...escolasExibidas.map((e, idx) => {
              const paradaNum = escolaOrdemParadaMap.get(e.id) || idx + 1
              return isModoRota ? `${paradaNum}ª ${e.name}` : e.name
            }),
          )
        } else if (isTotaisPorRotaModo) {
          headerRow.push(...rotasDaChamada.map((r) => r.nome))
          headerRow.push('Total Geral')
        }
        head = [headerRow]

        for (const prod of produtosExibidos) {
          const unitPrice = productPriceMap.get(prod.id) || Number(prod.price) || 0

          let rowQtd = 0
          let rowValor = 0
          const schoolCells: string[] = []

          if (!somenteColunaTotal) {
            for (const sch of escolasExibidas) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              schoolCells.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            if (isModoRota) {
              const tot = totaisPorProdutoNaRota[prod.id] || { totalQtd: 0, totalValor: 0 }
              rowQtd = tot.totalQtd
              rowValor = tot.totalValor
            } else {
              const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
              rowQtd = tot.totalQtd
              rowValor = tot.totalValor
            }

            if (isTotaisPorRotaModo) {
              for (const r of rotasDaChamada) {
                const sub = subtotalPorProdutoERota.get(r.id)?.get(prod.id) || { qtd: 0, valor: 0 }
                schoolCells.push(getCellExportText(sub.qtd, sub.valor, prod.unit, true))
              }
              schoolCells.push(getCellExportText(rowQtd, rowValor, prod.unit, true))
            }
          }

          const row: string[] = [
            prod.name,
            getCellExportText(rowQtd, rowValor, prod.unit, true),
            prod.unit,
            formatBRL(unitPrice),
            ...schoolCells,
          ]
          body.push(row)
        }

        const footerRow: string[] = [
          'TOTAL GERAL',
          getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true),
          '',
          '',
        ]
        if (!somenteColunaTotal) {
          for (const sch of escolasExibidas) {
            const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            footerRow.push(getCellExportText(totCol.totalQtd, totCol.totalValor, undefined, true))
          }
        } else if (isTotaisPorRotaModo) {
          for (const r of rotasDaChamada) {
            const rotaCalc = totaisPorRotaCalculados.find((t) => t.rota.id === r.id)
            const q = rotaCalc ? rotaCalc.qtd : 0
            const v = rotaCalc ? rotaCalc.valor : 0
            footerRow.push(getCellExportText(q, v, undefined, true))
          }
          footerRow.push(getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true))
        }
        foot = [footerRow]
      } else {
        const headerRow = ['Escola', 'Total', 'Aba']
        if (!somenteColunaTotal) {
          headerRow.push(...produtosExibidos.map((p) => `${p.name} (${p.unit})`))
        }
        head = [headerRow]

        for (const sch of escolasExibidas) {
          let rowQtd = 0
          let rowValor = 0
          const prodCells: string[] = []

          if (!somenteColunaTotal) {
            for (const prod of produtosExibidos) {
              const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
              rowQtd += cell.qtd
              rowValor += cell.valor
              prodCells.push(getCellExportText(cell.qtd, cell.valor, prod.unit))
            }
          } else {
            const tot = totaisPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
            rowQtd = tot.totalQtd
            rowValor = tot.totalValor
          }

          const row: string[] = [
            sch.name,
            getCellExportText(rowQtd, rowValor, undefined, true),
            sch.route || '-',
            ...prodCells,
          ]
          body.push(row)
        }

        const footerRow: string[] = [
          'TOTAL GERAL',
          getCellExportText(totalGeral.qtd, totalGeral.valor, undefined, true),
          '',
        ]
        if (!somenteColunaTotal) {
          for (const prod of produtosExibidos) {
            const totCol = totaisColunaPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
            footerRow.push(getCellExportText(totCol.totalQtd, totCol.totalValor, prod.unit, true))
          }
        }
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
      const rotaSlug = isModoRota ? `-${selectedRotaObj?.nome?.replace(/\s+/g, '_')}` : ''
      const filename = `consolidacao-final-${tabAtiva}${rotaSlug}-${dateStr}.pdf`
      doc.save(filename)
      toast.success('Documento PDF exportado com sucesso!')
    } catch (err) {
      console.error('Erro ao exportar PDF:', err)
      toast.error('Falha ao exportar documento PDF.')
    }
  }

  const isModoRotaAtivo =
    tabAtiva === 'produto' && filtroEscolaModo === 'rota' && Boolean(selectedRotaId)

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
        onValueChange={(v) => {
          setTabAtiva(v as 'produto' | 'escola')
        }}
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
                    onCheckedChange={(checked) => {
                      setSomenteColunaTotal(checked)
                      if (!checked) {
                        setTotaisPorRotaAtivo(false)
                      }
                    }}
                  />
                  <Label
                    htmlFor="somente-coluna-total"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Somente coluna de Total
                  </Label>
                </div>

                {/* Opção "Totais por rota" visível no modo somente coluna de total */}
                {somenteColunaTotal && tabAtiva === 'produto' && (
                  <div className="flex items-center space-x-2 pl-3 border-l border-primary/30 animate-in fade-in duration-150">
                    <Switch
                      id="totais-por-rota"
                      checked={totaisPorRotaAtivo}
                      onCheckedChange={setTotaisPorRotaAtivo}
                    />
                    <Label
                      htmlFor="totais-por-rota"
                      className="text-xs font-medium text-primary cursor-pointer flex items-center gap-1.5"
                    >
                      <Route className="h-3.5 w-3.5" />
                      Totais por rota
                    </Label>
                  </div>
                )}

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

              {/* Seletor do Modo Por Rota (aba Por Produto) */}
              {tabAtiva === 'produto' && (
                <div className="border-t sm:border-t-0 sm:border-l sm:pl-6 pt-3 sm:pt-0 flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Route className="h-3.5 w-3.5 text-primary" /> Filtro de Escolas:
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={filtroEscolaModo}
                      onValueChange={(v: 'todas' | 'rota') => {
                        setFiltroEscolaModo(v)
                        if (v === 'rota' && !selectedRotaId && rotasDaChamada.length > 0) {
                          setSelectedRotaId(rotasDaChamada[0].id)
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as escolas</SelectItem>
                        <SelectItem value="rota">Por Rota</SelectItem>
                      </SelectContent>
                    </Select>

                    {filtroEscolaModo === 'rota' && (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                        <Select value={selectedRotaId} onValueChange={setSelectedRotaId}>
                          <SelectTrigger className="h-8 min-w-[170px] max-w-[230px] text-xs font-medium border-primary/40">
                            <SelectValue placeholder="Selecione a rota..." />
                          </SelectTrigger>
                          <SelectContent>
                            {rotasDaChamada.length === 0 ? (
                              <SelectItem value="__vazio__" disabled>
                                Nenhuma rota disponível
                              </SelectItem>
                            ) : (
                              rotasDaChamada.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.nome}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Ações da Direita: Ciclo, Chamada, Busca e Botão Exportar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select
                  value={selectedCicloId}
                  onValueChange={(val) => {
                    setSelectedCicloId(val)
                    if (val !== 'todos') {
                      const c = ciclos.find((ci) => ci.id === val)
                      if (c?.chamada_id) {
                        setSelectedChamadaId(c.chamada_id)
                      }
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue placeholder="Ciclo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Ciclos</SelectItem>
                    {ciclos.map((c) => {
                      const ch =
                        c.expand?.chamada_id || chamadas.find((item) => item.id === c.chamada_id)
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} {ch ? `[${ch.chamada}]` : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <Select
                  value={selectedChamadaId}
                  onValueChange={(val) => {
                    setSelectedChamadaId(val)
                  }}
                >
                  <SelectTrigger className="h-9 w-36 text-xs">
                    <SelectValue placeholder="Chamada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Chamadas</SelectItem>
                    {chamadas.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.chamada}
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
                        {isModoRotaAtivo
                          ? `Matriz da Rota ${selectedRotaObj?.nome || ''}`
                          : 'Matriz e cruzamento formatado'}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportarPDF} className="gap-2 cursor-pointer py-2">
                    <FileText className="h-4 w-4 text-rose-600" />
                    <div className="flex flex-col">
                      <span className="font-medium text-xs">Documento PDF (.pdf)</span>
                      <span className="text-[10px] text-muted-foreground">
                        {isModoRotaAtivo
                          ? `Relatório da Rota ${selectedRotaObj?.nome || ''}`
                          : 'Relatório para impressão/logística'}
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

          {/* Banner Informativo quando modo Por Rota estiver ativo */}
          {isModoRotaAtivo && selectedRotaObj && (
            <div className="flex items-center justify-between flex-wrap gap-2 bg-primary/5 border border-primary/25 rounded-md px-3.5 py-2 text-xs text-foreground">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Modo <strong>Por rota</strong> ativo:{' '}
                  <span className="text-primary font-semibold">{selectedRotaObj.nome}</span> (
                  {escolasExibidas.length} escola(s) apresentadas na sequência oficial das paradas
                  da rota).
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                Sequência logística das paradas
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela da Matriz */}
      <div className="rounded-lg border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <Table className="relative w-full border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-30">
              {tabAtiva === 'produto' ? (
                // CABEÇALHO DA ABA POR PRODUTO: Total posicionado à esquerda ao lado de Produto (Unidade e Preço Unit. removidos da tela)
                <TableRow className="hover:bg-transparent">
                  {/* Coluna 1: Produto (Fixa no topo E fixa à esquerda) */}
                  <TableHead className="min-w-[180px] max-w-[240px] sticky left-0 top-0 z-40 bg-slate-100 dark:bg-slate-900 font-semibold text-foreground border-r border-b shadow-[1px_1px_0_0_rgba(0,0,0,0.08)] align-bottom pb-3">
                    Produto
                  </TableHead>
                  {/* Coluna 2: Total (Fixa no topo E fixa à esquerda) */}
                  <TableHead className="text-center font-bold text-primary min-w-[110px] sticky left-[180px] sm:left-[220px] top-0 z-40 bg-primary/10 dark:bg-primary/20 backdrop-blur border-r border-b shadow-[2px_1px_0_0_rgba(0,0,0,0.08)] align-bottom pb-3">
                    Total
                  </TableHead>
                  {/* Colunas de Destino/Escola: Fixas no topo */}
                  {!somenteColunaTotal &&
                    escolasExibidas.map((sch, idx) => {
                      const paradaNum = escolaOrdemParadaMap.get(sch.id) || idx + 1
                      const isEvenCol = idx % 2 === 1
                      const nomeAbreviado = abreviarNomeEscola(sch.name)
                      const tooltipCompleto = `${isModoRotaAtivo ? `Parada #${paradaNum} — ` : ''}${sch.name}${sch.route ? ` (${sch.route})` : ''}`

                      return (
                        <TableHead
                          key={sch.id}
                          className={`text-center w-[46px] min-w-[44px] max-w-[56px] text-xs font-semibold text-foreground p-1 border-r border-b border-border/40 align-bottom sticky top-0 z-30 backdrop-blur ${
                            isEvenCol
                              ? 'bg-muted/90 dark:bg-muted/70'
                              : 'bg-slate-50/95 dark:bg-slate-900/95'
                          }`}
                          title={tooltipCompleto}
                          aria-label={tooltipCompleto}
                        >
                          <div className="h-48 flex flex-col items-center justify-between pb-1.5 pt-1 gap-1">
                            {/* Nível 1: Badge #N da parada HORIZONTAL no topo */}
                            <div className="h-5 flex items-center justify-center shrink-0">
                              {isModoRotaAtivo ? (
                                <span
                                  className="inline-flex items-center justify-center bg-primary text-primary-foreground font-mono text-[9px] font-bold rounded px-1.5 py-0.5 shadow-xs"
                                  title={`Parada #${paradaNum} na sequência oficial da rota`}
                                >
                                  #{paradaNum}
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono text-muted-foreground/60">
                                  —
                                </span>
                              )}
                            </div>

                            {/* Nível 2: Nome da escola ABREVIADO na VERTICAL */}
                            <div
                              className="text-[11px] font-medium leading-tight text-foreground/90 whitespace-nowrap max-h-40 overflow-hidden text-ellipsis select-none tracking-tight"
                              style={{
                                writingMode: 'vertical-rl',
                                transform: 'rotate(180deg)',
                              }}
                            >
                              {nomeAbreviado}
                            </div>
                          </div>
                        </TableHead>
                      )
                    })}

                  {/* No modo Somente coluna de Total com Totais por rota ativado: colunas de subtotais por rota + coluna Total Geral */}
                  {somenteColunaTotal &&
                    totaisPorRotaAtivo &&
                    rotasDaChamada.map((r, idx) => {
                      const isEvenCol = idx % 2 === 1
                      const nomeAbreviado = abreviarNomeEscola(r.nome)
                      const tooltipCompleto = `Rota: ${r.nome}`

                      return (
                        <TableHead
                          key={r.id}
                          className={`text-center w-[46px] min-w-[44px] max-w-[56px] text-xs font-semibold text-foreground p-1 border-r border-b border-border/40 align-bottom sticky top-0 z-30 backdrop-blur ${
                            isEvenCol
                              ? 'bg-muted/90 dark:bg-muted/70'
                              : 'bg-slate-50/95 dark:bg-slate-900/95'
                          }`}
                          title={tooltipCompleto}
                          aria-label={tooltipCompleto}
                        >
                          <div className="h-48 flex flex-col items-center justify-between pb-1.5 pt-1 gap-1">
                            {/* Nível 1: Badge #N da rota HORIZONTAL no topo */}
                            <div className="h-5 flex items-center justify-center shrink-0">
                              <span
                                className="inline-flex items-center justify-center bg-primary/20 text-primary font-mono text-[9px] font-bold rounded px-1.5 py-0.5 shadow-xs"
                                title={`Rota #${idx + 1}`}
                              >
                                #{idx + 1}
                              </span>
                            </div>

                            {/* Nível 2: Nome da rota na VERTICAL */}
                            <div
                              className="text-[11px] font-medium leading-tight text-foreground/90 whitespace-nowrap max-h-40 overflow-hidden text-ellipsis select-none tracking-tight"
                              style={{
                                writingMode: 'vertical-rl',
                                transform: 'rotate(180deg)',
                              }}
                            >
                              {nomeAbreviado}
                            </div>
                          </div>
                        </TableHead>
                      )
                    })}

                  {/* Coluna final "Total Geral" no modo Totais por rota */}
                  {somenteColunaTotal && totaisPorRotaAtivo && (
                    <TableHead
                      className="text-center font-bold text-primary w-[56px] min-w-[50px] max-w-[64px] text-xs p-1 border-r border-b border-border/40 align-bottom sticky top-0 z-30 bg-primary/10 dark:bg-primary/20 backdrop-blur"
                      title="Total Geral Consolidado"
                      aria-label="Total Geral Consolidado"
                    >
                      <div className="h-48 flex flex-col items-center justify-between pb-1.5 pt-1 gap-1">
                        <div className="h-5 flex items-center justify-center shrink-0">
                          <span className="inline-flex items-center justify-center bg-primary text-primary-foreground font-mono text-[9px] font-bold rounded px-1.5 py-0.5 shadow-xs">
                            ∑
                          </span>
                        </div>
                        <div
                          className="text-[11px] font-bold leading-tight text-primary whitespace-nowrap max-h-40 overflow-hidden text-ellipsis select-none tracking-tight uppercase"
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                          }}
                        >
                          Total Geral
                        </div>
                      </div>
                    </TableHead>
                  )}
                </TableRow>
              ) : (
                // CABEÇALHO DA ABA POR ESCOLA: Total posicionado à esquerda ao lado de Escola
                <TableRow className="hover:bg-transparent">
                  {/* Coluna 1: Escola (Fixa no topo E fixa à esquerda) */}
                  <TableHead className="min-w-[200px] max-w-[260px] sticky left-0 top-0 z-40 bg-slate-100 dark:bg-slate-900 font-semibold text-foreground border-r border-b shadow-[1px_1px_0_0_rgba(0,0,0,0.08)] align-bottom pb-3">
                    Escola
                  </TableHead>
                  {/* Coluna 2: Total (Fixa no topo E fixa à esquerda) */}
                  <TableHead className="text-center font-bold text-primary min-w-[110px] sticky left-[200px] sm:left-[240px] top-0 z-40 bg-primary/10 dark:bg-primary/20 backdrop-blur border-r border-b shadow-[2px_1px_0_0_rgba(0,0,0,0.08)] align-bottom pb-3">
                    Total
                  </TableHead>
                  <TableHead className="w-20 text-center font-semibold text-foreground border-r border-b sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur align-bottom pb-3">
                    Aba
                  </TableHead>
                  {!somenteColunaTotal &&
                    produtosExibidos.map((prod, idx) => {
                      const isEvenCol = idx % 2 === 1
                      return (
                        <TableHead
                          key={prod.id}
                          className={`text-center w-[46px] min-w-[44px] max-w-[56px] text-xs font-semibold text-foreground p-1 border-r border-b border-border/40 align-bottom sticky top-0 z-30 backdrop-blur ${
                            isEvenCol
                              ? 'bg-muted/90 dark:bg-muted/70'
                              : 'bg-slate-50/95 dark:bg-slate-900/95'
                          }`}
                          title={`${prod.name} (${prod.unit}) · ${formatBRL(productPriceMap.get(prod.id) || Number(prod.price) || 0)}`}
                        >
                          <div className="h-48 flex flex-col items-center justify-between pb-1.5 pt-1 gap-1">
                            <span className="text-[9px] font-mono text-muted-foreground uppercase shrink-0 font-bold">
                              {prod.unit}
                            </span>
                            <div
                              className="text-[11px] font-medium leading-tight text-foreground/90 whitespace-nowrap max-h-40 overflow-hidden text-ellipsis select-none"
                              style={{
                                writingMode: 'vertical-rl',
                                transform: 'rotate(180deg)',
                              }}
                            >
                              {prod.name}
                            </div>
                          </div>
                        </TableHead>
                      )
                    })}
                </TableRow>
              )}
            </TableHeader>

            <TableBody>
              {tabAtiva === 'produto' ? (
                // CORPO DA MATRIZ POR PRODUTO
                produtosExibidos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={
                        somenteColunaTotal
                          ? totaisPorRotaAtivo
                            ? rotasDaChamada.length + 3
                            : 2
                          : escolasExibidas.length + 2
                      }
                      className="text-center py-12 text-muted-foreground"
                    >
                      {isModoRotaAtivo
                        ? 'Nenhum produto com demanda registrado para esta rota.'
                        : 'Nenhum produto com demanda registrado para este filtro.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  produtosExibidos.map((prod) => {
                    let rowQtd = 0
                    let rowValor = 0

                    if (!somenteColunaTotal) {
                      for (const sch of escolasExibidas) {
                        const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
                        rowQtd += cell.qtd
                        rowValor += cell.valor
                      }
                    } else {
                      if (isModoRotaAtivo) {
                        const tot = totaisPorProdutoNaRota[prod.id] || {
                          totalQtd: 0,
                          totalValor: 0,
                        }
                        rowQtd = tot.totalQtd
                        rowValor = tot.totalValor
                      } else {
                        const tot = totaisPorProduto[prod.id] || { totalQtd: 0, totalValor: 0 }
                        rowQtd = tot.totalQtd
                        rowValor = tot.totalValor
                      }
                    }

                    return (
                      <TableRow key={prod.id} className="hover:bg-muted/40 transition-colors">
                        {/* Coluna 1: Produto (Fixa horizontalmente à esquerda) */}
                        <TableCell className="font-medium sticky left-0 bg-background z-20 border-r border-b py-2.5 shadow-[1px_0_0_0_rgba(0,0,0,0.06)]">
                          <span className="font-semibold text-xs sm:text-sm">{prod.name}</span>
                          <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">
                            ({prod.unit})
                          </span>
                        </TableCell>

                        {/* Coluna 2: Total (Fixa horizontalmente à esquerda ao lado de Produto) */}
                        <TableCell className="text-center font-bold font-mono bg-primary/5 text-primary sticky left-[180px] sm:left-[220px] z-20 border-r border-b py-2 shadow-[2px_0_0_0_rgba(0,0,0,0.06)] backdrop-blur">
                          {renderCellContent(rowQtd, rowValor, prod.unit, true, false)}
                        </TableCell>

                        {/* Colunas de Destino/Escola: SEM unidade do produto (já exibida em Produto) */}
                        {!somenteColunaTotal &&
                          escolasExibidas.map((sch, idx) => {
                            const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
                            const isEvenCol = idx % 2 === 1
                            const zebraBg = isEvenCol
                              ? 'bg-muted/30 dark:bg-muted/15'
                              : 'bg-transparent'
                            const activeBg =
                              cell.qtd > 0
                                ? isEvenCol
                                  ? 'bg-primary/[0.06] hover:bg-primary/[0.12]'
                                  : 'bg-primary/[0.04] hover:bg-primary/[0.10]'
                                : zebraBg

                            return (
                              <TableCell
                                key={sch.id}
                                className={`text-center text-xs px-1 py-1.5 border-r border-b border-border/30 transition-colors ${activeBg}`}
                              >
                                {renderCellContent(cell.qtd, cell.valor, prod.unit, false, false)}
                              </TableCell>
                            )
                          })}

                        {/* Colunas de Subtotal por Rota no modo Somente coluna de Total + Totais por rota */}
                        {somenteColunaTotal &&
                          totaisPorRotaAtivo &&
                          rotasDaChamada.map((r, idx) => {
                            const sub = subtotalPorProdutoERota.get(r.id)?.get(prod.id) || {
                              qtd: 0,
                              valor: 0,
                            }
                            const isEvenCol = idx % 2 === 1
                            const zebraBg = isEvenCol
                              ? 'bg-muted/30 dark:bg-muted/15'
                              : 'bg-transparent'
                            const activeBg =
                              sub.qtd > 0
                                ? isEvenCol
                                  ? 'bg-primary/[0.06] hover:bg-primary/[0.12]'
                                  : 'bg-primary/[0.04] hover:bg-primary/[0.10]'
                                : zebraBg

                            return (
                              <TableCell
                                key={r.id}
                                className={`text-center text-xs px-1 py-1.5 border-r border-b border-border/30 transition-colors ${activeBg}`}
                              >
                                {renderCellContent(sub.qtd, sub.valor, prod.unit, true, false)}
                              </TableCell>
                            )
                          })}

                        {/* Coluna final Total Geral no modo Somente coluna de Total + Totais por rota */}
                        {somenteColunaTotal && totaisPorRotaAtivo && (
                          <TableCell className="text-center font-bold font-mono bg-primary/10 text-primary border-r border-b py-2 backdrop-blur">
                            {renderCellContent(rowQtd, rowValor, prod.unit, true, false)}
                          </TableCell>
                        )}
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
                      <TableCell className="font-medium sticky left-0 bg-background z-20 border-r border-b py-2.5 shadow-[1px_0_0_0_rgba(0,0,0,0.06)]">
                        <span className="font-semibold text-xs sm:text-sm">{sch.name}</span>
                      </TableCell>
                      <TableCell className="text-center font-bold font-mono bg-primary/5 text-primary sticky left-[200px] sm:left-[240px] z-20 border-r border-b py-2 shadow-[2px_0_0_0_rgba(0,0,0,0.06)] backdrop-blur">
                        {renderCellContent(rowQtd, rowValor, undefined, true, false)}
                      </TableCell>
                      <TableCell className="text-xs text-center border-r border-b py-2">
                        <span className="text-muted-foreground text-[11px]">
                          {sch.route || '-'}
                        </span>
                      </TableCell>

                      {!somenteColunaTotal &&
                        produtosExibidos.map((prod, idx) => {
                          const cell = matriz.get(prod.id)?.get(sch.id) || { qtd: 0, valor: 0 }
                          const isEvenCol = idx % 2 === 1
                          const zebraBg = isEvenCol
                            ? 'bg-muted/30 dark:bg-muted/15'
                            : 'bg-transparent'
                          const activeBg =
                            cell.qtd > 0
                              ? isEvenCol
                                ? 'bg-primary/[0.06] hover:bg-primary/[0.12]'
                                : 'bg-primary/[0.04] hover:bg-primary/[0.10]'
                              : zebraBg

                          return (
                            <TableCell
                              key={prod.id}
                              className={`text-center text-xs px-1 py-1.5 border-r border-b border-border/30 transition-colors ${activeBg}`}
                            >
                              {renderCellContent(cell.qtd, cell.valor, prod.unit, false, false)}
                            </TableCell>
                          )
                        })}
                    </TableRow>
                  )
                })
              )}

              {/* LINHA DE TOTAL GERAL */}
              {tabAtiva === 'produto' && produtosExibidos.length > 0 && (
                <TableRow className="bg-slate-50 dark:bg-slate-900/80 font-bold border-t-2">
                  <TableCell className="sticky left-0 bg-slate-100 dark:bg-slate-900 z-20 border-r border-b font-bold shadow-[1px_0_0_0_rgba(0,0,0,0.06)]">
                    Total Geral
                  </TableCell>
                  <TableCell className="text-center font-extrabold font-mono bg-primary/10 text-primary sticky left-[180px] sm:left-[220px] z-20 border-r border-b py-2.5 shadow-[2px_0_0_0_rgba(0,0,0,0.06)] backdrop-blur">
                    {renderCellContent(totalGeral.qtd, totalGeral.valor, undefined, true, false)}
                  </TableCell>

                  {!somenteColunaTotal &&
                    escolasExibidas.map((sch, idx) => {
                      const totCol = totaisColunaPorEscola[sch.id] || { totalQtd: 0, totalValor: 0 }
                      const isEvenCol = idx % 2 === 1
                      return (
                        <TableCell
                          key={sch.id}
                          className={`text-center text-xs py-2.5 border-r border-b border-border/30 ${
                            isEvenCol ? 'bg-muted/30 dark:bg-muted/15' : 'bg-transparent'
                          }`}
                        >
                          {renderCellContent(
                            totCol.totalQtd,
                            totCol.totalValor,
                            undefined,
                            true,
                            false,
                          )}
                        </TableCell>
                      )
                    })}

                  {/* Colunas de subtotais por rota na linha de Total Geral */}
                  {somenteColunaTotal &&
                    totaisPorRotaAtivo &&
                    rotasDaChamada.map((r, idx) => {
                      const rotaCalc = totaisPorRotaCalculados.find((t) => t.rota.id === r.id)
                      const isEvenCol = idx % 2 === 1
                      return (
                        <TableCell
                          key={r.id}
                          className={`text-center text-xs py-2.5 border-r border-b border-border/30 ${
                            isEvenCol ? 'bg-muted/30 dark:bg-muted/15' : 'bg-transparent'
                          }`}
                        >
                          {renderCellContent(
                            rotaCalc ? rotaCalc.qtd : 0,
                            rotaCalc ? rotaCalc.valor : 0,
                            undefined,
                            true,
                            false,
                          )}
                        </TableCell>
                      )
                    })}

                  {/* Coluna final Total Geral na linha de Total Geral */}
                  {somenteColunaTotal && totaisPorRotaAtivo && (
                    <TableCell className="text-center font-extrabold font-mono bg-primary/15 text-primary border-r border-b py-2.5 backdrop-blur">
                      {renderCellContent(totalGeral.qtd, totalGeral.valor, undefined, true, false)}
                    </TableCell>
                  )}
                </TableRow>
              )}

              {tabAtiva === 'escola' && escolasExibidas.length > 0 && (
                <TableRow className="bg-slate-50 dark:bg-slate-900/80 font-bold border-t-2">
                  <TableCell className="sticky left-0 bg-slate-100 dark:bg-slate-900 z-20 border-r border-b font-bold shadow-[1px_0_0_0_rgba(0,0,0,0.06)]">
                    Total Geral
                  </TableCell>
                  <TableCell className="text-center font-extrabold font-mono bg-primary/10 text-primary sticky left-[200px] sm:left-[240px] z-20 border-r border-b py-2.5 shadow-[2px_0_0_0_rgba(0,0,0,0.06)] backdrop-blur">
                    {renderCellContent(totalGeral.qtd, totalGeral.valor, undefined, true, false)}
                  </TableCell>
                  <TableCell className="text-center border-r border-b">-</TableCell>

                  {!somenteColunaTotal &&
                    produtosExibidos.map((prod, idx) => {
                      const totCol = totaisColunaPorProduto[prod.id] || {
                        totalQtd: 0,
                        totalValor: 0,
                      }
                      const isEvenCol = idx % 2 === 1
                      return (
                        <TableCell
                          key={prod.id}
                          className={`text-center text-xs py-2.5 border-r border-b border-border/30 ${
                            isEvenCol ? 'bg-muted/30 dark:bg-muted/15' : 'bg-transparent'
                          }`}
                        >
                          {renderCellContent(
                            totCol.totalQtd,
                            totCol.totalValor,
                            prod.unit,
                            true,
                            false,
                          )}
                        </TableCell>
                      )
                    })}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
