import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import type {
  Product,
  School,
  Contract,
  Order,
  Atesto,
  AtestoRecord,
  CicloRecord,
  RotaRecord,
  RotaLogisticaRecord,
  ParadaRotaRecord,
  DespachoRecord,
  ContratoEscolaRecord,
  ContratoItemRecord,
  PedidoValidacao,
  ConfiguracoesRecord,
} from '@/lib/types'
import { configuracoesService } from '@/services/configuracoes'
import { produtosService } from '@/services/produtos'
import { escolasService } from '@/services/escolas'
import { contratosService } from '@/services/contratos'
import { pedidosService } from '@/services/pedidos'
import { atestosService } from '@/services/atestos'
import { ciclosService } from '@/services/ciclos'
import { rotasService } from '@/services/rotas'
import { rotasLogisticasService } from '@/services/rotas-logisticas'
import { toast } from 'sonner'
import useRealtime from '@/hooks/use-realtime'
import { validateOrder } from '@/lib/orderValidation'

export interface CreateOrderData {
  schoolId: string
  date: string
  cicloId?: string
  origem?: 'excel' | 'whatsapp' | 'manual'
  rotaId?: string
  rotaLogisticaId?: string
  items: Array<{
    productId: string
    quantity: number
  }>
}

interface AppState {
  products: Product[]
  schools: School[]
  contracts: Contract[]
  contractSchools: ContratoEscolaRecord[]
  contractItems: ContratoItemRecord[]
  orders: Order[]
  atestos: Atesto[]
  ciclos: CicloRecord[]
  activeCiclo: CicloRecord | null
  rotas: RotaRecord[]
  rotasLogisticas: RotaLogisticaRecord[]
  paradasRota: ParadaRotaRecord[]
  despachos: DespachoRecord[]
  config: ConfiguracoesRecord | null
  logoUrl: string
  isLoading: boolean
  error: string | null
  refreshData: () => Promise<void>
  addOrder: (orderData: CreateOrderData) => Promise<boolean>
  generateAtesto: (
    orderId: string,
    pdfBlob?: Blob,
    customNumero?: string,
  ) => Promise<AtestoRecord | null>
  confirmAtesto: (atestoId: string) => Promise<boolean>
  updateOrderStatus: (
    id: string,
    status: Order['status'],
    options?: {
      cancelamento_motivo?: string
      motivo_cancelamento?: string
      entregue_em?: string
      entregue_por?: string
      cancelado_em?: string
      rota_logistica_id?: string
    },
  ) => Promise<boolean>
  confirmarEntregaPedido: (id: string, userId?: string) => Promise<boolean>
  cancelarPedido: (id: string, motivo: string, isEmRota?: boolean) => Promise<boolean>
  despacharRotaInteira: (
    rotaLogisticaId: string,
    contratoId: string,
    userId?: string,
  ) => Promise<boolean>
  confirmarEntregaRotaInteira: (rotaLogisticaId: string, userId?: string) => Promise<boolean>
  marcarNaoEntreguePedido: (
    pedidoId: string,
    motivoLogistico: string,
    userId?: string,
  ) => Promise<boolean>
  criarRotaLogistica: (data: {
    contrato_id: string
    nome: string
    ordem?: number
    ativa?: boolean
  }) => Promise<RotaLogisticaRecord | null>
  atualizarRotaLogistica: (
    id: string,
    data: {
      nome?: string
      ordem?: number
      ativa?: boolean
    },
  ) => Promise<RotaLogisticaRecord | null>
  excluirRotaLogistica: (id: string) => Promise<boolean>
  sincronizarEscolasRotaLogistica: (
    contratoId: string,
    rotaLogisticaId: string,
    escolaIds: string[],
    pedidoIds?: string[],
  ) => Promise<boolean>
  atribuirPedidosARotaLogistica: (pedidoIds: string[], rotaLogisticaId: string) => Promise<boolean>
  salvarSequenciamentoParadas: (
    rotaLogisticaId: string,
    paradas: Array<{ escola_id: string; ordem: number }>,
  ) => Promise<boolean>
  updateCicloStatus: (
    cicloId: string,
    status: 'coletando' | 'correcao' | 'fechado',
  ) => Promise<boolean>
  createCiclo: (data: {
    nome: string
    data_inicio: string
    data_fim: string
    status: 'coletando' | 'correcao' | 'fechado'
  }) => Promise<CicloRecord | null>
}

const AppContext = createContext<AppState | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractSchools, setContractSchools] = useState<ContratoEscolaRecord[]>([])
  const [contractItems, setContractItems] = useState<ContratoItemRecord[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [atestos, setAtestos] = useState<Atesto[]>([])
  const [ciclos, setCiclos] = useState<CicloRecord[]>([])
  const [activeCiclo, setActiveCiclo] = useState<CicloRecord | null>(null)
  const [rotas, setRotas] = useState<RotaRecord[]>([])
  const [rotasLogisticas, setRotasLogisticas] = useState<RotaLogisticaRecord[]>([])
  const [paradasRota, setParadasRota] = useState<ParadaRotaRecord[]>([])
  const [despachos, setDespachos] = useState<DespachoRecord[]>([])
  const [config, setConfig] = useState<ConfiguracoesRecord | null>(null)
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadAllData = useCallback(async () => {
    try {
      setError(null)
      const [
        rawProds,
        rawSchools,
        rawContratos,
        rawContratoEscolas,
        rawContratoItens,
        rawPedidos,
        rawPedidoItens,
        rawAtestos,
        rawCiclos,
        rawRotas,
        rawRotasLogisticas,
        rawParadasRota,
        rawDespachos,
        rawConfig,
      ] = await Promise.all([
        produtosService.getAll(),
        escolasService.getAll(),
        contratosService.getAll(),
        contratosService.getEscolas(),
        contratosService.getAllItems(),
        pedidosService.getAll(),
        pedidosService.getAllItems(),
        atestosService.getAll(),
        ciclosService.getAll(),
        rotasService.getAll(),
        rotasLogisticasService.getAll(),
        rotasLogisticasService.getParadas(),
        rotasLogisticasService.getDespachos(),
        configuracoesService.get(),
      ])

      setConfig(rawConfig)
      const computedLogo = configuracoesService.getLogoUrl(rawConfig)
      setLogoUrl(computedLogo)

      // Atualizar dinamicamente o favicon e título se houver logotipo/config
      if (typeof document !== 'undefined') {
        if (computedLogo) {
          let linkIcon = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null
          if (!linkIcon) {
            linkIcon = document.createElement('link')
            linkIcon.rel = 'icon'
            document.head.appendChild(linkIcon)
          }
          linkIcon.href = computedLogo

          let appleIcon = document.querySelector(
            "link[rel='apple-touch-icon']",
          ) as HTMLLinkElement | null
          if (!appleIcon) {
            appleIcon = document.createElement('link')
            appleIcon.rel = 'apple-touch-icon'
            document.head.appendChild(appleIcon)
          }
          appleIcon.href = computedLogo
        }

        if (rawConfig?.sigla || rawConfig?.nome_cooperativa) {
          const nomeApp = rawConfig.sigla || rawConfig.nome_cooperativa
          document.title = `${nomeApp} — Gestão Cooperativa`
        }
      }

      setCiclos(rawCiclos)
      const currentActive = rawCiclos.find((c) => c.status !== 'fechado') || rawCiclos[0] || null
      setActiveCiclo(currentActive)
      setRotas(rawRotas)
      setRotasLogisticas(rawRotasLogisticas)
      setParadasRota(rawParadasRota)
      setDespachos(rawDespachos)
      setContractSchools(rawContratoEscolas)
      setContractItems(rawContratoItens)

      // Map produtos
      const mappedProds: Product[] = rawProds.map((p) => ({
        id: p.id,
        name: p.nome,
        category: p.categoria,
        stock: Number(p.estoque) || 0,
        unit: p.unidade,
        price: Number(p.preco_unitario) || 0,
        disponibilidade: p.disponibilidade || 'normal',
        apelidos: p.apelidos || '',
      }))
      setProducts(mappedProds)

      // Map escolas
      const mappedSchools: School[] = rawSchools.map((s) => ({
        id: s.id,
        name: s.nome,
        address: s.endereco || '',
        contact: s.telefone || '',
        route: '',
        email: s.email || '',
        tipo: s.tipo || '',
        alunos: s.alunos !== undefined && s.alunos !== null ? Number(s.alunos) : undefined,
        bairro: s.bairro || '',
        contatoResponsavel: s.contato || '',
      }))
      setSchools(mappedSchools)

      // Mapa escola -> parada_rota mais recente para derivar a Rota Logística da Escola
      // O roteamento e despacho operam sobre ESCOLAS: pedidos herdam a rota da escola.
      const escolaParadaMap = new Map<string, ParadaRotaRecord>()
      for (const p of rawParadasRota) {
        if (!escolaParadaMap.has(p.escola_id)) {
          escolaParadaMap.set(p.escola_id, p)
        }
      }

      // Map pedidos with items, rota, ciclo and validation
      const mappedOrders: Order[] = rawPedidos.map((ped) => {
        const schoolObj = mappedSchools.find((s) => s.id === ped.escola_id)
        const schoolName =
          ped.expand?.escola_id?.nome || schoolObj?.name || 'Escola não identificada'

        const rotaObj = rawRotas.find((r) => r.id === ped.rota_id)
        const rotaNome = ped.expand?.rota_id?.nome || rotaObj?.nome

        // Derivar Rota Logística prioritariamente da ESCOLA (paradas_rota) e fallback para ped.rota_logistica_id
        const paradaEscola = escolaParadaMap.get(ped.escola_id)
        const effectiveRotaLogisticaId = paradaEscola?.rota_logistica_id || ped.rota_logistica_id
        const rotaLogObj = rawRotasLogisticas.find((r) => r.id === effectiveRotaLogisticaId)
        const rotaLogisticaNome = rotaLogObj?.nome || ped.expand?.rota_logistica_id?.nome

        const pItens = rawPedidoItens.filter((pi) => pi.pedido_id === ped.id)
        let total = 0
        const items = pItens.map((pi) => {
          const prod = mappedProds.find((p) => p.id === pi.produto_id)
          const prodName = pi.expand?.produto_id?.nome || prod?.name || 'Produto'
          const preco = Number(pi.preco_unitario) || prod?.price || 0
          const qtd = Number(pi.quantidade) || 0
          total += preco * qtd
          return {
            id: pi.id,
            productId: pi.produto_id,
            name: prodName,
            quantity: qtd,
            price: preco,
          }
        })

        // Validacao default se nao existir
        const rawValidacao = (ped.validacao as PedidoValidacao) || {
          status: 'validado',
          motivo: 'Registrado no sistema',
        }

        const entreguePorNome =
          ped.expand?.entregue_por?.nome ||
          ped.expand?.entregue_por?.name ||
          ped.expand?.entregue_por?.email ||
          ''

        const motivoCancel = ped.motivo_cancelamento || ped.cancelamento_motivo

        return {
          id: ped.id,
          numero: ped.numero,
          schoolId: ped.escola_id,
          schoolName,
          schoolAlunos: schoolObj?.alunos,
          cicloId: ped.ciclo_id,
          origem: ped.origem || 'manual',
          rotaId: ped.rota_id,
          rotaNome,
          rotaLogisticaId: effectiveRotaLogisticaId,
          rotaLogisticaNome,
          validacao: rawValidacao,
          date:
            ped.data_prevista ||
            ped.created?.split('T')[0] ||
            new Date().toISOString().split('T')[0],
          status: ped.status,
          entregue_em: ped.entregue_em,
          entregue_por: ped.entregue_por,
          entreguePorNome,
          cancelamento_motivo: motivoCancel,
          motivo_cancelamento: motivoCancel,
          cancelado_em: ped.cancelado_em,
          total: Math.round(total * 100) / 100,
          items,
        }
      })
      setOrders(mappedOrders)

      // Map contratos with N:N escolas and balance calculation
      const mappedContracts: Contract[] = rawContratos.map((c) => {
        const links = rawContratoEscolas.filter((ce) => ce.contrato_id === c.id)
        const linkedSchools = links.map((ce) => {
          const sch = mappedSchools.find((s) => s.id === ce.escola_id)
          const rt = rawRotas.find((r) => r.id === ce.rota_id)
          // Rota da planilha: ce.rota guarda o nome texto livre da planilha.
          // Se ce.rota for um ID de 15 caracteres alfanuméricos, descartar porque é ID corrompido, não nome.
          const ceRotaRaw = ce.rota?.trim()
          const ceRotaTexto = ceRotaRaw && !/^[a-z0-9]{15}$/.test(ceRotaRaw) ? ceRotaRaw : undefined

          const rotaPlanilhaNome = ceRotaTexto || ce.expand?.rota_id?.nome || rt?.nome || 'Sem Rota'

          // Rota logística da cooperativa associada a esta escola
          const paradaEscola = rawParadasRota.find((p) => p.escola_id === ce.escola_id)
          const rotaLogId = ce.rota_logistica_id || paradaEscola?.rota_logistica_id
          const rotaLogObj = rawRotasLogisticas.find((r) => r.id === rotaLogId)
          const rotaLogisticaNome = ce.expand?.rota_logistica_id?.nome || rotaLogObj?.nome

          return {
            id: ce.id,
            contratoId: ce.contrato_id,
            escolaId: ce.escola_id,
            rotaId: ce.rota_id,
            rotaPlanilha: rotaPlanilhaNome,
            rotaLogisticaId: rotaLogId,
            rotaLogisticaNome: rotaLogisticaNome,
            escolaNome: ce.expand?.escola_id?.nome || sch?.name || 'Escola',
            escolaEndereco: ce.expand?.escola_id?.endereco || sch?.address || '',
            escolaTelefone: ce.expand?.escola_id?.telefone || sch?.contact || '',
            escolaEmail: ce.expand?.escola_id?.email || sch?.email || '',
            escolaBairro: ce.expand?.escola_id?.bairro || sch?.bairro || '',
            escolaContato: ce.expand?.escola_id?.contato || sch?.contatoResponsavel || '',
            escolaTipo: ce.expand?.escola_id?.tipo || sch?.tipo || '',
            escolaAlunos: ce.expand?.escola_id?.alunos ?? sch?.alunos,
            rotaNome: rotaPlanilhaNome,
          }
        })

        const totalValue = Number(c.valor_total) || 0

        // Consumed value from orders of all participating schools
        const participatingSchoolIds = new Set(linkedSchools.map((l) => l.escolaId))
        const contractOrders = mappedOrders.filter(
          (o) => participatingSchoolIds.has(o.schoolId) && o.status !== 'Cancelado',
        )
        const consumed = contractOrders.reduce((acc, o) => acc + o.total, 0)
        const balance = Math.max(0, totalValue - consumed)

        return {
          id: c.id,
          numero: c.numero,
          numero_chamada: c.numero_chamada || '',
          tipo: c.tipo || 'PNAE',
          modalidade_pedido: c.modalidade_pedido || 'individualizado',
          num_rotas_logisticas:
            c.num_rotas_logisticas !== undefined && c.num_rotas_logisticas !== null
              ? Number(c.num_rotas_logisticas)
              : undefined,
          totalValue,
          balance,
          status: c.status,
          escolas: linkedSchools,
        }
      })
      setContracts(mappedContracts)

      // Map atestos
      const mappedAtestos: Atesto[] = rawAtestos.map((a) => {
        const relatedOrder = mappedOrders.find((o) => o.id === a.pedido_id)
        const schoolName =
          a.expand?.pedido_id?.expand?.escola_id?.nome || relatedOrder?.schoolName || 'Escola'

        return {
          id: a.id,
          numero: a.numero,
          orderId: a.pedido_id,
          orderNumber: a.expand?.pedido_id?.numero || relatedOrder?.numero || a.pedido_id,
          schoolName,
          date:
            a.data_emissao || a.created?.split('T')[0] || new Date().toISOString().split('T')[0],
          status: a.status,
          signatureFile: a.assinatura_file,
          arquivo: a.arquivo,
        }
      })
      setAtestos(mappedAtestos)
    } catch (err: any) {
      console.error('Erro ao carregar dados do PocketBase:', err)
      setError('Erro ao carregar dados do banco de dados.')
      toast.error('Erro ao conectar ao banco de dados.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Realtime granular subscriptions
  useRealtime<any>('pedidos', (e) => {
    if (e.action === 'delete') {
      setOrders((prev) => prev.filter((o) => o.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const rec = e.record
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === rec.id)
        const schoolObj = schools.find((s) => s.id === rec.escola_id)
        const schoolName = rec.expand?.escola_id?.nome || schoolObj?.name || 'Escola'
        const paradaEscola = paradasRota.find((p) => p.escola_id === rec.escola_id)
        const effectiveRotaLogisticaId = paradaEscola?.rota_logistica_id || rec.rota_logistica_id
        const rotaLogObj = rotasLogisticas.find((r) => r.id === effectiveRotaLogisticaId)
        const rotaLogisticaNome = rotaLogObj?.nome || rec.expand?.rota_logistica_id?.nome
        const rotaObj = rotas.find((r) => r.id === rec.rota_id)
        const rotaNome = rec.expand?.rota_id?.nome || rotaObj?.nome

        if (idx !== -1) {
          const existing = prev[idx]
          const updated: Order = {
            ...existing,
            numero: rec.numero || existing.numero,
            schoolId: rec.escola_id || existing.schoolId,
            schoolName: schoolName || existing.schoolName,
            cicloId: rec.ciclo_id || existing.cicloId,
            origem: rec.origem || existing.origem,
            rotaId: rec.rota_id || existing.rotaId,
            rotaNome: rotaNome || existing.rotaNome,
            rotaLogisticaId: effectiveRotaLogisticaId || existing.rotaLogisticaId,
            rotaLogisticaNome: rotaLogisticaNome || existing.rotaLogisticaNome,
            date: rec.data_prevista || existing.date,
            status: rec.status || existing.status,
            entregue_em: rec.entregue_em ?? existing.entregue_em,
            entregue_por: rec.entregue_por ?? existing.entregue_por,
            cancelamento_motivo:
              rec.motivo_cancelamento || rec.cancelamento_motivo || existing.cancelamento_motivo,
            motivo_cancelamento:
              rec.motivo_cancelamento || rec.cancelamento_motivo || existing.motivo_cancelamento,
            cancelado_em: rec.cancelado_em ?? existing.cancelado_em,
            validacao: rec.validacao || existing.validacao,
          }
          const copy = [...prev]
          copy[idx] = updated
          return copy
        }

        // Se houver um pedido temporário com mesmo número ou mesma escola no mesmo ciclo, substitui
        const tempIdx = prev.findIndex(
          (o) =>
            o.id.startsWith('temp-') &&
            ((rec.numero && o.numero === rec.numero) ||
              (o.schoolId === rec.escola_id && o.cicloId === rec.ciclo_id)),
        )

        // Novo pedido via SSE
        const newOrder: Order = {
          id: rec.id,
          numero: rec.numero || 'ORD-NEW',
          schoolId: rec.escola_id,
          schoolName,
          schoolAlunos: schoolObj?.alunos,
          cicloId: rec.ciclo_id,
          origem: rec.origem || 'manual',
          rotaId: rec.rota_id,
          rotaNome,
          rotaLogisticaId: effectiveRotaLogisticaId,
          rotaLogisticaNome,
          validacao: (rec.validacao as PedidoValidacao) || {
            status: 'validado',
            motivo: 'Registrado',
          },
          date:
            rec.data_prevista ||
            rec.created?.split('T')[0] ||
            new Date().toISOString().split('T')[0],
          status: rec.status || 'Pendente',
          entregue_em: rec.entregue_em,
          entregue_por: rec.entregue_por,
          entreguePorNome: '',
          cancelamento_motivo: rec.motivo_cancelamento || rec.cancelamento_motivo,
          motivo_cancelamento: rec.motivo_cancelamento || rec.cancelamento_motivo,
          cancelado_em: rec.cancelado_em,
          total: tempIdx !== -1 ? prev[tempIdx].total : 0,
          items: tempIdx !== -1 ? prev[tempIdx].items : [],
        }

        if (tempIdx !== -1) {
          const copy = [...prev]
          copy[tempIdx] = newOrder
          return copy
        }

        return [newOrder, ...prev]
      })
    }
  })

  useRealtime<any>('rotas_logisticas', (e) => {
    if (e.action === 'delete') {
      setRotasLogisticas((prev) => prev.filter((r) => r.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const rec = e.record as RotaLogisticaRecord
      setRotasLogisticas((prev) => {
        const existingIdx = prev.findIndex((r) => r.id === rec.id)
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = { ...copy[existingIdx], ...rec }
          return copy.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        }

        // Se houver um registro temporário otimista com mesmo contrato e nome correspondente, substitui
        const cleanNome = (rec.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
        const tempIdx = prev.findIndex(
          (r) =>
            r.id.startsWith('temp-') &&
            r.contrato_id === rec.contrato_id &&
            (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === cleanNome,
        )

        if (tempIdx !== -1) {
          const copy = [...prev]
          copy[tempIdx] = rec
          return copy.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        }

        return [...prev, rec].sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      })
    }
  })

  useRealtime<any>('paradas_rota', (e) => {
    if (e.action === 'delete') {
      setParadasRota((prev) => prev.filter((p) => p.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const rec = e.record as ParadaRotaRecord
      setParadasRota((prev) => {
        const existingIdx = prev.findIndex((p) => p.id === rec.id)
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = { ...copy[existingIdx], ...rec }
          return copy.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        }

        // Se houver parada temporária para a mesma rota e mesma escola, substitui
        const tempIdx = prev.findIndex(
          (p) =>
            p.id.startsWith('temp-') &&
            p.rota_logistica_id === rec.rota_logistica_id &&
            p.escola_id === rec.escola_id,
        )
        if (tempIdx !== -1) {
          const copy = [...prev]
          copy[tempIdx] = rec
          return copy.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        }

        return [...prev, rec].sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      })
    }
  })

  useRealtime<any>('despachos', (e) => {
    if (e.action === 'delete') {
      setDespachos((prev) => prev.filter((d) => d.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const rec = e.record as DespachoRecord
      setDespachos((prev) => {
        const existingIdx = prev.findIndex((d) => d.id === rec.id)
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = { ...copy[existingIdx], ...rec }
          return copy
        }

        // Checar temporário otimista
        const tempIdx = prev.findIndex(
          (d) =>
            d.id.startsWith('temp-') &&
            d.contrato_id === rec.contrato_id &&
            d.rota_logistica_id === rec.rota_logistica_id,
        )
        if (tempIdx !== -1) {
          const copy = [...prev]
          copy[tempIdx] = rec
          return copy
        }

        return [rec, ...prev]
      })
    }
  })

  useRealtime<any>('produtos', (e) => {
    if (e.action === 'delete') {
      setProducts((prev) => prev.filter((p) => p.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const p = e.record
      setProducts((prev) => {
        const existingIdx = prev.findIndex((prod) => prod.id === p.id)
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = {
            ...copy[existingIdx],
            name: p.nome !== undefined ? p.nome : copy[existingIdx].name,
            category: p.categoria !== undefined ? p.categoria : copy[existingIdx].category,
            stock: p.estoque !== undefined ? Number(p.estoque) : copy[existingIdx].stock,
            unit: p.unidade !== undefined ? p.unidade : copy[existingIdx].unit,
            price:
              p.preco_unitario !== undefined ? Number(p.preco_unitario) : copy[existingIdx].price,
            disponibilidade:
              p.disponibilidade !== undefined
                ? p.disponibilidade
                : copy[existingIdx].disponibilidade,
          }
          return copy
        }

        const item: Product = {
          id: p.id,
          name: p.nome,
          category: p.categoria,
          stock: Number(p.estoque) || 0,
          unit: p.unidade,
          price: Number(p.preco_unitario) || 0,
          disponibilidade: p.disponibilidade || 'normal',
        }
        return [...prev, item]
      })
    }
  })

  useRealtime<any>('escolas', (e) => {
    if (e.action === 'delete') {
      setSchools((prev) => prev.filter((s) => s.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const s = e.record
      setSchools((prev) => {
        const existingIdx = prev.findIndex((sch) => sch.id === s.id)
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = {
            ...copy[existingIdx],
            name: s.nome !== undefined ? s.nome : copy[existingIdx].name,
            address: s.endereco !== undefined ? s.endereco : copy[existingIdx].address,
            contact: s.telefone !== undefined ? s.telefone : copy[existingIdx].contact,
            route: '',
            email: s.email !== undefined ? s.email : copy[existingIdx].email,
            tipo: s.tipo !== undefined ? s.tipo : copy[existingIdx].tipo,
            alunos:
              s.alunos !== undefined && s.alunos !== null
                ? Number(s.alunos)
                : copy[existingIdx].alunos,
          }
          return copy
        }

        const mapped: School = {
          id: s.id,
          name: s.nome,
          address: s.endereco || '',
          contact: s.telefone || '',
          route: '',
          email: s.email || '',
          tipo: s.tipo || '',
          alunos: s.alunos !== undefined && s.alunos !== null ? Number(s.alunos) : undefined,
          bairro: s.bairro || '',
          contatoResponsavel: s.contato || '',
        }
        return [...prev, mapped]
      })
    }
  })

  useRealtime<any>('atestos', (e) => {
    if (e.action === 'delete') {
      setAtestos((prev) => prev.filter((a) => a.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      setAtestos((prev) => {
        const rec = e.record
        const relatedOrder = orders.find((o) => o.id === rec.pedido_id)
        const schoolName = relatedOrder?.schoolName || 'Escola'
        const mapped: Atesto = {
          id: rec.id,
          numero: rec.numero,
          orderId: rec.pedido_id,
          orderNumber: relatedOrder?.numero || rec.pedido_id,
          schoolName,
          date:
            rec.data_emissao ||
            rec.created?.split('T')[0] ||
            new Date().toISOString().split('T')[0],
          status: rec.status,
          signatureFile: rec.assinatura_file,
          arquivo: rec.arquivo,
        }
        const idx = prev.findIndex((a) => a.id === rec.id)
        if (idx !== -1) {
          const copy = [...prev]
          copy[idx] = mapped
          return copy
        }

        // Substituir temporário se houver
        const tempIdx = prev.findIndex(
          (a) => a.id.startsWith('temp-') && a.orderId === rec.pedido_id,
        )
        if (tempIdx !== -1) {
          const copy = [...prev]
          copy[tempIdx] = mapped
          return copy
        }

        return [mapped, ...prev]
      })
    }
  })

  useRealtime<any>('ciclos', (e) => {
    if (e.action === 'delete') {
      setCiclos((prev) => prev.filter((c) => c.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const rec = e.record as CicloRecord
      setCiclos((prev) => {
        const existingIdx = prev.findIndex((c) => c.id === rec.id)
        let updated: CicloRecord[]
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = { ...copy[existingIdx], ...rec }
          updated = copy
        } else {
          // Substituir se houver temporário com mesmo nome
          const tempIdx = prev.findIndex((c) => c.id.startsWith('temp-') && c.nome === rec.nome)
          if (tempIdx !== -1) {
            const copy = [...prev]
            copy[tempIdx] = rec
            updated = copy
          } else {
            updated = [...prev, rec]
          }
        }

        setActiveCiclo((current) => {
          if (
            current?.id === rec.id ||
            (current?.id.startsWith('temp-') && current?.nome === rec.nome)
          ) {
            return { ...current, ...rec }
          }
          return current
        })
        return updated
      })
    }
  })

  useRealtime<any>('contrato_escolas', async (_e) => {
    // Quando houver criação, alteração ou exclusão de vínculo escola↔contrato,
    // recarregar vínculos e contratos para manter o estado global e a tela /escolas sincronizados
    try {
      const [updatedContratoEscolas, rawContratos, rawRotas, rawParadasRota, rawRotasLogisticas] =
        await Promise.all([
          contratosService.getEscolas(),
          contratosService.getAll(),
          rotasService.getAll(),
          rotasLogisticasService.getParadas(),
          rotasLogisticasService.getAll(),
        ])

      setContractSchools(updatedContratoEscolas)
      setRotas(rawRotas)
      setParadasRota(rawParadasRota)
      setRotasLogisticas(rawRotasLogisticas)

      setContracts((prevContracts) => {
        return (rawContratos.length > 0 ? rawContratos : prevContracts).map((c) => {
          const links = updatedContratoEscolas.filter((ce) => ce.contrato_id === c.id)
          const linkedSchools = links.map((ce) => {
            const sch = schools.find((s) => s.id === ce.escola_id)
            const rt = rawRotas.find((r) => r.id === ce.rota_id)
            const ceRotaRaw = ce.rota?.trim()
            const ceRotaTexto =
              ceRotaRaw && !/^[a-z0-9]{15}$/.test(ceRotaRaw) ? ceRotaRaw : undefined

            const rotaPlanilhaNome =
              ceRotaTexto || ce.expand?.rota_id?.nome || rt?.nome || 'Sem Rota'

            const paradaEscola = rawParadasRota.find((p) => p.escola_id === ce.escola_id)
            const rotaLogId = ce.rota_logistica_id || paradaEscola?.rota_logistica_id
            const rotaLogObj = rawRotasLogisticas.find((r) => r.id === rotaLogId)
            const rotaLogisticaNome = ce.expand?.rota_logistica_id?.nome || rotaLogObj?.nome

            return {
              id: ce.id,
              contratoId: ce.contrato_id,
              escolaId: ce.escola_id,
              rotaId: ce.rota_id,
              rotaPlanilha: rotaPlanilhaNome,
              rotaLogisticaId: rotaLogId,
              rotaLogisticaNome: rotaLogisticaNome,
              escolaNome: ce.expand?.escola_id?.nome || sch?.name || 'Escola',
              escolaEndereco: ce.expand?.escola_id?.endereco || sch?.address || '',
              escolaTelefone: ce.expand?.escola_id?.telefone || sch?.contact || '',
              escolaEmail: ce.expand?.escola_id?.email || sch?.email || '',
              escolaBairro: ce.expand?.escola_id?.bairro || sch?.bairro || '',
              escolaContato: ce.expand?.escola_id?.contato || sch?.contatoResponsavel || '',
              escolaTipo: ce.expand?.escola_id?.tipo || sch?.tipo || '',
              escolaAlunos: ce.expand?.escola_id?.alunos ?? sch?.alunos,
              rotaNome: rotaPlanilhaNome,
            }
          })

          const totalValue = Number(c.valor_total) || 0
          const participatingSchoolIds = new Set(linkedSchools.map((l) => l.escolaId))
          const contractOrders = orders.filter(
            (o) => participatingSchoolIds.has(o.schoolId) && o.status !== 'Cancelado',
          )
          const consumed = contractOrders.reduce((acc, o) => acc + o.total, 0)
          const balance = Math.max(0, totalValue - consumed)

          return {
            id: c.id,
            numero: c.numero,
            numero_chamada: c.numero_chamada || '',
            tipo: c.tipo || 'PNAE',
            modalidade_pedido: c.modalidade_pedido || 'individualizado',
            num_rotas_logisticas:
              c.num_rotas_logisticas !== undefined && c.num_rotas_logisticas !== null
                ? Number(c.num_rotas_logisticas)
                : undefined,
            totalValue,
            balance,
            status: c.status,
            escolas: linkedSchools,
          }
        })
      })
    } catch (err) {
      console.error('Erro na sincronização realtime de contrato_escolas:', err)
    }
  })

  const addOrder = async (orderData: CreateOrderData): Promise<boolean> => {
    // Validação estrita: não permitir pedidos com zero itens ou itens com quantidade <= 0
    const rawItems = orderData.items || []
    const validRawItems = rawItems.filter(
      (it) =>
        it.productId && typeof it.quantity === 'number' && !isNaN(it.quantity) && it.quantity > 0,
    )

    if (validRawItems.length === 0) {
      toast.error(
        'Não é possível criar pedido sem itens válidos ou com quantidade zero. Adicione pelo menos 1 item com quantidade maior que zero.',
      )
      return false
    }

    const orderCount = orders.length + 1
    const numero = `ORD-${String(orderCount).padStart(3, '0')}`

    const formattedItens = validRawItems.map((it) => {
      const prod = products.find((p) => p.id === it.productId)
      return {
        id: it.productId,
        productId: it.productId,
        name: prod?.name || 'Produto',
        quantidade: it.quantity,
        preco_unitario: prod?.price || 0,
        price: prod?.price || 0,
      }
    })

    // Validation
    const cicloStatus = activeCiclo?.status || 'coletando'
    const validationResult = validateOrder({
      items: formattedItens.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantidade,
        price: i.preco_unitario,
      })),
      allProducts: products,
      cicloStatus,
    })

    // Find route if not provided
    let rotaId = orderData.rotaId
    if (!rotaId) {
      const ce = contractSchools.find((c) => c.escola_id === orderData.schoolId && c.rota_id)
      if (ce) {
        rotaId = ce.rota_id
      }
    }

    const datePrevista = orderData.date.includes('T')
      ? orderData.date
      : `${orderData.date} 12:00:00.000Z`

    // Herança automática da Rota Logística da Escola
    let rotaLogisticaIdFinal = orderData.rotaLogisticaId
    if (!rotaLogisticaIdFinal) {
      const paradaDaEscola = paradasRota.find((p) => p.escola_id === orderData.schoolId)
      if (paradaDaEscola) {
        rotaLogisticaIdFinal = paradaDaEscola.rota_logistica_id
      }
    }

    const tempId = `temp-${Date.now()}`
    const schoolObj = schools.find((s) => s.id === orderData.schoolId)
    const schoolName = schoolObj?.name || 'Escola'
    const rotaLogObj = rotasLogisticas.find((r) => r.id === rotaLogisticaIdFinal)
    const rotaLogisticaNome = rotaLogObj?.nome
    const rotaObj = rotas.find((r) => r.id === rotaId)
    const rotaNome = rotaObj?.nome

    let total = 0
    formattedItens.forEach((it) => {
      total += it.preco_unitario * it.quantidade
    })

    // Optimistic Update local imediato
    const optimisticOrder: Order = {
      id: tempId,
      numero,
      schoolId: orderData.schoolId,
      schoolName,
      schoolAlunos: schoolObj?.alunos,
      cicloId: orderData.cicloId || activeCiclo?.id,
      origem: orderData.origem || 'manual',
      rotaId,
      rotaNome,
      rotaLogisticaId: rotaLogisticaIdFinal,
      rotaLogisticaNome,
      validacao: validationResult,
      date: datePrevista.split(' ')[0],
      status: 'Pendente',
      total: Math.round(total * 100) / 100,
      items: formattedItens.map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.name,
        quantity: it.quantidade,
        price: it.preco_unitario,
      })),
    }

    setOrders((prev) => [optimisticOrder, ...prev])

    try {
      const created = await pedidosService.create({
        numero,
        escola_id: orderData.schoolId,
        ciclo_id: orderData.cicloId || activeCiclo?.id,
        origem: orderData.origem || 'manual',
        rota_id: rotaId,
        rota_logistica_id: rotaLogisticaIdFinal,
        validacao: validationResult,
        data_prevista: datePrevista,
        status: 'Pendente',
        itens: formattedItens.map((i) => ({
          produto_id: i.productId,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        })),
      })

      // Substituir o pedido temporário pelo definitivo (com proteção contra evento SSE já ter inserido)
      setOrders((prev) => {
        const alreadyHasCreated = prev.some((o) => o.id === created.id)
        if (alreadyHasCreated) {
          return prev.filter((o) => o.id !== tempId)
        }
        return prev.map((o) =>
          o.id === tempId ? { ...o, id: created.id, numero: created.numero } : o,
        )
      })

      if (validationResult.status === 'invalido') {
        toast.warning(`Pedido cadastrado com pendência de validação: ${validationResult.motivo}`)
      } else {
        toast.success('Pedido registrado com sucesso!')
      }

      return true
    } catch (err: any) {
      console.error('Erro ao criar pedido:', err)
      // Rollback do optimistic update
      setOrders((prev) => prev.filter((o) => o.id !== tempId))
      toast.error('Falha ao salvar pedido no banco.')
      return false
    }
  }

  const updateOrderStatus = async (
    id: string,
    status: Order['status'],
    options?: {
      cancelamento_motivo?: string
      motivo_cancelamento?: string
      entregue_em?: string
      entregue_por?: string
      cancelado_em?: string
      rota_logistica_id?: string
    },
  ): Promise<boolean> => {
    const targetOrder = orders.find((o) => o.id === id)
    if (!targetOrder) {
      toast.error('Pedido não encontrado.')
      return false
    }

    // Regra: Pedido Cancelado não pode voltar
    if (targetOrder.status === 'Cancelado') {
      toast.error('Pedidos cancelados não podem ter seu status alterado.')
      return false
    }

    // Se a transição for para Entregue, chamar método especializado com baixa de estoque
    if (status === 'Entregue') {
      return await confirmarEntregaPedido(id, options?.entregue_por)
    }

    // Se a transição for para Cancelado, motivo é obrigatório
    if (status === 'Cancelado') {
      const motivo = (options?.motivo_cancelamento || options?.cancelamento_motivo)?.trim()
      if (!motivo) {
        toast.error('Motivo do cancelamento é obrigatório.')
        return false
      }
      const isEmRota = targetOrder.status === 'Em Rota'
      return await cancelarPedido(id, motivo, isEmRota)
    }

    // Optimistic update local imediato
    const prevOrders = [...orders]
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status,
              entregue_em: options?.entregue_em ?? o.entregue_em,
              entregue_por: options?.entregue_por ?? o.entregue_por,
              cancelamento_motivo: options?.cancelamento_motivo ?? o.cancelamento_motivo,
              motivo_cancelamento: options?.motivo_cancelamento ?? o.motivo_cancelamento,
              cancelado_em: options?.cancelado_em ?? o.cancelado_em,
              rotaLogisticaId: options?.rota_logistica_id ?? o.rotaLogisticaId,
            }
          : o,
      ),
    )

    try {
      const updated = await pedidosService.updateStatus(id, status, options)
      // Ajusta com dados retornados pelo servidor
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                status: updated.status,
                entregue_em: updated.entregue_em,
                entregue_por: updated.entregue_por,
                cancelamento_motivo: updated.cancelamento_motivo || updated.motivo_cancelamento,
                motivo_cancelamento: updated.motivo_cancelamento || updated.cancelamento_motivo,
                cancelado_em: updated.cancelado_em,
              }
            : o,
        ),
      )
      toast.success(`Status do pedido atualizado para "${status}".`)
      return true
    } catch (err: any) {
      console.error('Erro ao atualizar status do pedido:', err)
      // Rollback do optimistic update
      setOrders(prevOrders)
      toast.error('Falha ao atualizar status.')
      return false
    }
  }

  const confirmarEntregaPedido = async (id: string, userId?: string): Promise<boolean> => {
    const targetOrder = orders.find((o) => o.id === id)
    if (!targetOrder) {
      toast.error('Pedido não encontrado.')
      return false
    }

    if (targetOrder.status === 'Cancelado') {
      toast.error('Não é possível entregar um pedido cancelado.')
      return false
    }

    if (targetOrder.status === 'Entregue') {
      toast.info('Este pedido já foi confirmado como entregue anteriormente.')
      return true
    }

    const nowIso = new Date().toISOString()
    const prevOrders = [...orders]
    const prevProducts = [...products]

    // Optimistic update: marca pedido como entregue e baixa estoque na UI
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, status: 'Entregue', entregue_em: nowIso, entregue_por: userId } : o,
      ),
    )

    const itensToDec = targetOrder.items.filter((i) => i.productId && i.quantity > 0)
    if (itensToDec.length > 0) {
      setProducts((prev) =>
        prev.map((p) => {
          const matchItem = itensToDec.find((it) => it.productId === p.id)
          if (!matchItem) return p
          return { ...p, stock: Math.max(0, p.stock - matchItem.quantity) }
        }),
      )
    }

    try {
      // 1. Atualizar pedido para Entregue
      await pedidosService.updateStatus(id, 'Entregue', {
        entregue_em: nowIso,
        entregue_por: userId || undefined,
      })

      // 2. Dar baixa no estoque no banco
      for (const item of targetOrder.items) {
        if (item.productId && item.quantity > 0) {
          try {
            await produtosService.decrementarEstoque(item.productId, item.quantity)
          } catch (stkErr) {
            console.error(`Erro ao baixar estoque do produto ${item.productId}:`, stkErr)
          }
        }
      }

      toast.success(`Pedido ${targetOrder.numero} entregue com sucesso! Estoque atualizado.`)
      return true
    } catch (err: any) {
      console.error('Erro ao confirmar entrega do pedido:', err)
      // Rollback
      setOrders(prevOrders)
      setProducts(prevProducts)
      toast.error('Falha ao confirmar entrega do pedido.')
      return false
    }
  }

  const cancelarPedido = async (
    id: string,
    motivo: string,
    _isEmRota = false,
  ): Promise<boolean> => {
    const targetOrder = orders.find((o) => o.id === id)
    if (!targetOrder) {
      toast.error('Pedido não encontrado.')
      return false
    }

    if (targetOrder.status === 'Cancelado') {
      toast.info('Este pedido já está cancelado.')
      return true
    }

    if (targetOrder.status === 'Entregue') {
      toast.error('Não é possível cancelar um pedido já entregue.')
      return false
    }

    if (!motivo || !motivo.trim()) {
      toast.error('Informe obrigatoriamente o motivo do cancelamento.')
      return false
    }

    const nowIso = new Date().toISOString()
    const cleanMotivo = motivo.trim()
    const prevOrders = [...orders]

    // Optimistic update
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: 'Cancelado',
              cancelamento_motivo: cleanMotivo,
              motivo_cancelamento: cleanMotivo,
              cancelado_em: nowIso,
            }
          : o,
      ),
    )

    try {
      await pedidosService.updateStatus(id, 'Cancelado', {
        motivo_cancelamento: cleanMotivo,
        cancelamento_motivo: cleanMotivo,
        cancelado_em: nowIso,
      })

      toast.success(`Pedido ${targetOrder.numero} foi cancelado definitivamente.`)
      return true
    } catch (err: any) {
      console.error('Erro ao cancelar pedido:', err)
      setOrders(prevOrders)
      toast.error('Falha ao cancelar pedido.')
      return false
    }
  }

  // 6. DESPACHO: Botão "Colocar em Rota" por rota logística que despacha a rota inteira
  // Operação em BATCH ÚNICO via backend hook transacional + Optimistic Update
  const despacharRotaInteira = async (
    rotaLogisticaId: string,
    contratoId: string,
    userId?: string,
  ): Promise<boolean> => {
    // Escolas que pertencem a esta rota logística (via paradas_rota)
    const escolasDaRota = new Set(
      paradasRota.filter((p) => p.rota_logistica_id === rotaLogisticaId).map((p) => p.escola_id),
    )

    // Identificar pedidos pendentes do ciclo ativo (ou pendentes em geral)
    const pedidosDaRota = orders.filter((o) => {
      if (o.status !== 'Pendente') return false
      if (activeCiclo?.id && o.cicloId && o.cicloId !== activeCiclo.id) return false
      return escolasDaRota.has(o.schoolId) || o.rotaLogisticaId === rotaLogisticaId
    })

    if (pedidosDaRota.length === 0) {
      toast.info('Não há pedidos pendentes no ciclo ativo para as escolas desta rota.')
      return false
    }

    const rotaLog = rotasLogisticas.find((r) => r.id === rotaLogisticaId)
    const prevOrders = [...orders]
    const prevDespachos = [...despachos]
    const nowIso = new Date().toISOString()
    const pedidosIdsSet = new Set(pedidosDaRota.map((p) => p.id))

    // Optimistic Update imediato: apenas os pedidos afetados passam para 'Em Rota'
    setOrders((prev) =>
      prev.map((o) =>
        pedidosIdsSet.has(o.id)
          ? {
              ...o,
              status: 'Em Rota',
              rotaLogisticaId,
              rotaLogisticaNome: rotaLog?.nome || o.rotaLogisticaNome,
            }
          : o,
      ),
    )

    const tempDespacho: DespachoRecord = {
      id: `temp-desp-${Date.now()}`,
      contrato_id: contratoId,
      ciclo_id: activeCiclo?.id,
      rota_logistica_id: rotaLogisticaId,
      usuario_id: userId,
      data_despacho: nowIso,
      status: 'Em Rota',
      created: nowIso,
      updated: nowIso,
    }
    setDespachos((prev) => [tempDespacho, ...prev])

    try {
      const res = await rotasLogisticasService.despacharRotaBatch({
        rota_logistica_id: rotaLogisticaId,
        contrato_id: contratoId,
        ciclo_id: activeCiclo?.id || undefined,
        user_id: userId,
      })

      // Substituir o despacho temporário pelo real (com proteção contra SSE)
      if (res.despacho) {
        const realDespacho = res.despacho as DespachoRecord
        setDespachos((prev) => {
          const alreadyHasReal = prev.some((d) => d.id === realDespacho.id)
          if (alreadyHasReal) {
            return prev.filter((d) => d.id !== tempDespacho.id)
          }
          return prev.map((d) => (d.id === tempDespacho.id ? realDespacho : d))
        })
      }

      toast.success(
        `Rota logística despachada com sucesso! ${pedidosDaRota.length} pedido(s) colocados "Em Rota".`,
      )
      return true
    } catch (err: any) {
      console.error('Erro ao despachar rota em lote:', err)
      // Rollback
      setOrders(prevOrders)
      setDespachos(prevDespachos)
      toast.error('Falha ao despachar rota logística.')
      return false
    }
  }

  // 7. ENTREGA POR ROTA INTEIRA (operação offline): botão "Rota Entregue"
  // Executa em BATCH ÚNICO no servidor e atualiza apenas o estado local afetado
  const confirmarEntregaRotaInteira = async (
    rotaLogisticaId: string,
    userId?: string,
  ): Promise<boolean> => {
    const escolasDaRota = new Set(
      paradasRota.filter((p) => p.rota_logistica_id === rotaLogisticaId).map((p) => p.escola_id),
    )

    const pedidosEmRota = orders.filter((o) => {
      if (o.status !== 'Em Rota') return false
      return escolasDaRota.has(o.schoolId) || o.rotaLogisticaId === rotaLogisticaId
    })

    if (pedidosEmRota.length === 0) {
      toast.info('Não há pedidos "Em Rota" nesta rota logística para confirmar entrega.')
      return false
    }

    const nowIso = new Date().toISOString()
    const prevOrders = [...orders]
    const prevProducts = [...products]
    const prevDespachos = [...despachos]
    const pedidosEmRotaIds = new Set(pedidosEmRota.map((p) => p.id))

    // Optimistic Update: pedidos afetados -> Entregue
    setOrders((prev) =>
      prev.map((o) =>
        pedidosEmRotaIds.has(o.id)
          ? {
              ...o,
              status: 'Entregue',
              entregue_em: nowIso,
              entregue_por: userId,
            }
          : o,
      ),
    )

    // Optimistic Update: despachos da rota -> Entregue
    setDespachos((prev) =>
      prev.map((d) =>
        d.rota_logistica_id === rotaLogisticaId && d.status === 'Em Rota'
          ? { ...d, status: 'Entregue' }
          : d,
      ),
    )

    // Optimistic Update: estoque dos produtos dos pedidos da rota
    const estoqueBaixasLocal = new Map<string, number>()
    for (const ped of pedidosEmRota) {
      for (const it of ped.items) {
        if (it.productId && it.quantity > 0) {
          estoqueBaixasLocal.set(
            it.productId,
            (estoqueBaixasLocal.get(it.productId) || 0) + it.quantity,
          )
        }
      }
    }

    if (estoqueBaixasLocal.size > 0) {
      setProducts((prev) =>
        prev.map((p) => {
          const qtd = estoqueBaixasLocal.get(p.id)
          if (!qtd) return p
          return { ...p, stock: Math.max(0, p.stock - qtd) }
        }),
      )
    }

    try {
      const res = await rotasLogisticasService.entregarRotaBatch({
        rota_logistica_id: rotaLogisticaId,
        user_id: userId,
      })

      // Se o backend retornou produtos atualizados com precisão
      if (res.produtos && res.produtos.length > 0) {
        const prodMap = new Map(res.produtos.map((pr: any) => [pr.id, pr]))
        setProducts((prev) =>
          prev.map((p) => {
            const up = prodMap.get(p.id)
            return up ? { ...p, stock: Number(up.estoque) || 0 } : p
          }),
        )
      }

      toast.success(
        `Rota confirmada como entregue! ${pedidosEmRota.length} pedido(s) finalizados e estoque baixado.`,
      )
      return true
    } catch (err: any) {
      console.error('Erro ao confirmar entrega da rota inteira:', err)
      // Rollback
      setOrders(prevOrders)
      setProducts(prevProducts)
      setDespachos(prevDespachos)
      toast.error('Falha ao confirmar entrega da rota logística.')
      return false
    }
  }

  // 8. CANCELAMENTO: botão "Não entregue" após despacho (Em Rota) -> Cancelado DEFINITIVAMENTE por motivo logístico
  const marcarNaoEntreguePedido = async (
    pedidoId: string,
    motivoLogistico: string,
    userId?: string,
  ): Promise<boolean> => {
    const targetOrder = orders.find((o) => o.id === pedidoId)
    if (!targetOrder) {
      toast.error('Pedido não encontrado.')
      return false
    }

    if (targetOrder.status !== 'Em Rota') {
      toast.error(
        'A marcação de "Não entregue" aplica-se apenas a pedidos despachados ("Em Rota").',
      )
      return false
    }

    const nowIso = new Date().toISOString()
    const cleanMotivo = motivoLogistico.trim()
    const prevOrders = [...orders]

    // Optimistic Update
    setOrders((prev) =>
      prev.map((o) =>
        o.id === pedidoId
          ? {
              ...o,
              status: 'Cancelado',
              motivo_cancelamento: cleanMotivo,
              cancelamento_motivo: cleanMotivo,
              cancelado_em: nowIso,
              entregue_por: userId,
            }
          : o,
      ),
    )

    try {
      await pedidosService.updateStatus(pedidoId, 'Cancelado', {
        motivo_cancelamento: cleanMotivo,
        cancelamento_motivo: cleanMotivo,
        cancelado_em: nowIso,
        entregue_por: userId,
      })

      toast.success(
        `Pedido ${targetOrder.numero} marcado como "Não entregue" e cancelado definitivamente por motivo logístico.`,
      )
      return true
    } catch (err: any) {
      console.error('Erro ao marcar pedido como não entregue:', err)
      setOrders(prevOrders)
      toast.error('Falha ao processar não entrega.')
      return false
    }
  }

  // Criar nova rota logística para um contrato
  const criarRotaLogistica = async (data: {
    contrato_id: string
    nome: string
    ordem?: number
    ativa?: boolean
  }): Promise<RotaLogisticaRecord | null> => {
    const cleanNome = (data.nome || '').trim().replace(/\s+/g, ' ')
    if (!cleanNome) {
      toast.error('Informe um nome para a rota logística.')
      return null
    }

    // Validação de unicidade no frontend contra o estado já carregado/realtime
    const normalizedTarget = cleanNome.toLowerCase()
    const existeDuplicata = rotasLogisticas.some(
      (r) =>
        r.contrato_id === data.contrato_id &&
        (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget,
    )
    if (existeDuplicata) {
      toast.error('Já existe uma rota logística com este nome neste contrato.')
      return null
    }

    const tempId = `temp-rota-${Date.now()}`
    const tempRecord: RotaLogisticaRecord = {
      id: tempId,
      contrato_id: data.contrato_id,
      nome: cleanNome,
      ordem: data.ordem || rotasLogisticas.length + 1,
      ativa: data.ativa ?? true,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    }

    // Optimistic update
    setRotasLogisticas((prev) => {
      // Evita duplicatas se já houver um registro com este id temporário
      if (prev.some((r) => r.id === tempId)) return prev
      return [...prev, tempRecord]
    })

    try {
      const created = await rotasLogisticasService.create({
        ...data,
        nome: cleanNome,
      })
      setRotasLogisticas((prev) => {
        // Se o evento SSE já tiver inserido ou substituído pelo created.id:
        const alreadyHasCreated = prev.some((r) => r.id === created.id)
        if (alreadyHasCreated) {
          // Remove o tempId para não deixar item fantasma
          return prev.filter((r) => r.id !== tempId).sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        }
        // Substitui o tempId pelo registro real criado
        return prev
          .map((r) => (r.id === tempId ? created : r))
          .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      })
      toast.success(`Rota logística "${cleanNome}" criada com sucesso!`)
      return created
    } catch (err: any) {
      console.error('Erro ao criar rota logística:', err)
      setRotasLogisticas((prev) => prev.filter((r) => r.id !== tempId))
      const serverMsg = err?.data?.message || err?.message || ''
      if (serverMsg.includes('Já existe uma rota logística com este nome')) {
        toast.error('Já existe uma rota logística com este nome neste contrato.')
      } else {
        toast.error(
          serverMsg ? `Falha ao criar rota: ${serverMsg}` : 'Falha ao criar rota logística.',
        )
      }
      return null
    }
  }

  // Atualizar / Renomear rota logística existente
  const atualizarRotaLogistica = async (
    id: string,
    data: {
      nome?: string
      ordem?: number
      ativa?: boolean
    },
  ): Promise<RotaLogisticaRecord | null> => {
    const rotaAtual = rotasLogisticas.find((r) => r.id === id)
    if (!rotaAtual) {
      toast.error('Rota logística não encontrada.')
      return null
    }

    let cleanNome: string | undefined = undefined
    if (data.nome !== undefined) {
      cleanNome = data.nome.trim().replace(/\s+/g, ' ')
      if (!cleanNome) {
        toast.error('Informe um nome para a rota logística.')
        return null
      }

      // Validação de unicidade no frontend contra o mesmo contrato (exceto ela própria)
      const normalizedTarget = cleanNome.toLowerCase()
      const existeDuplicata = rotasLogisticas.some(
        (r) =>
          r.id !== id &&
          r.contrato_id === rotaAtual.contrato_id &&
          (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget,
      )
      if (existeDuplicata) {
        toast.error('Já existe uma rota logística com este nome neste contrato.')
        return null
      }
    }

    const prevRotas = [...rotasLogisticas]
    const prevOrders = [...orders]

    // Optimistic update
    setRotasLogisticas((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              nome: cleanNome ?? r.nome,
              ordem: data.ordem ?? r.ordem,
              ativa: data.ativa ?? r.ativa,
            }
          : r,
      ),
    )

    if (cleanNome) {
      const novoNome = cleanNome
      setOrders((prev) =>
        prev.map((o) => (o.rotaLogisticaId === id ? { ...o, rotaLogisticaNome: novoNome } : o)),
      )
    }

    try {
      const updated = await rotasLogisticasService.update(id, {
        ...data,
        nome: cleanNome,
      })
      setRotasLogisticas((prev) => prev.map((r) => (r.id === id ? updated : r)))
      toast.success(`Rota logística "${updated.nome}" atualizada com sucesso!`)
      return updated
    } catch (err: any) {
      console.error('Erro ao atualizar rota logística:', err)
      setRotasLogisticas(prevRotas)
      setOrders(prevOrders)
      const serverMsg = err?.data?.message || err?.message || ''
      if (serverMsg.includes('Já existe uma rota logística com este nome')) {
        toast.error('Já existe uma rota logística com este nome neste contrato.')
      } else {
        toast.error(
          serverMsg
            ? `Falha ao atualizar rota: ${serverMsg}`
            : 'Falha ao atualizar rota logística.',
        )
      }
      return null
    }
  }

  // Excluir rota logística
  const excluirRotaLogistica = async (id: string): Promise<boolean> => {
    // Checar se há pedidos com status Em Rota ou Entregue vinculados a esta rota
    const pedidosComEstaRota = orders.filter((o) => o.rotaLogisticaId === id)
    const impedemExclusao = pedidosComEstaRota.filter((o) => o.status === 'Em Rota')
    if (impedemExclusao.length > 0) {
      toast.error('Não é possível excluir uma rota com pedidos em andamento ("Em Rota").')
      return false
    }

    const prevRotas = [...rotasLogisticas]
    const prevParadas = [...paradasRota]
    const prevOrders = [...orders]

    // Optimistic update
    setRotasLogisticas((prev) => prev.filter((r) => r.id !== id))
    setParadasRota((prev) => prev.filter((p) => p.rota_logistica_id !== id))
    setOrders((prev) =>
      prev.map((o) =>
        o.rotaLogisticaId === id
          ? { ...o, rotaLogisticaId: undefined, rotaLogisticaNome: undefined }
          : o,
      ),
    )

    try {
      // Desvincular paradas cadastradas no backend
      const paradas = paradasRota.filter((p) => p.rota_logistica_id === id)
      for (const p of paradas) {
        await rotasLogisticasService.removerParada(p.id)
      }

      // Desvincular pedidos pendentes
      for (const p of pedidosComEstaRota) {
        if (p.status === 'Pendente') {
          await pedidosService.atribuirRotaLogistica(p.id, '')
        }
      }

      await rotasLogisticasService.delete(id)
      toast.success('Rota logística excluída com sucesso!')
      return true
    } catch (err: any) {
      console.error('Erro ao excluir rota logística:', err)
      setRotasLogisticas(prevRotas)
      setParadasRota(prevParadas)
      setOrders(prevOrders)
      toast.error('Falha ao excluir rota logística.')
      return false
    }
  }

  // Sincronizar escolas atribuídas a uma rota logística:
  // Preenche paradas_rota, atualiza contrato_escolas.rota_logistica_id (SEM tocar na rota da planilha!),
  // atualiza pedidos pendentes dessas escolas e limpa as desatribuídas
  const sincronizarEscolasRotaLogistica = async (
    contratoId: string,
    rotaLogisticaId: string,
    escolaIds: string[],
    _pedidoIdsIgnorado?: string[],
  ): Promise<boolean> => {
    const rotaLog = rotasLogisticas.find((r) => r.id === rotaLogisticaId)
    const nomeRota = rotaLog?.nome || 'Rota'

    const paradasAnteriores = paradasRota.filter((p) => p.rota_logistica_id === rotaLogisticaId)
    const escolasAnterioresIds = paradasAnteriores.map((p) => p.escola_id)
    const novasEscolasSet = new Set(escolaIds)
    const escolasDesatribuidas = escolasAnterioresIds.filter((id) => !novasEscolasSet.has(id))

    const prevParadas = [...paradasRota]
    const prevOrders = [...orders]
    const prevContractSchools = [...contractSchools]

    // 1. Optimistic Update das Paradas
    const novasParadasOptimistic: ParadaRotaRecord[] = escolaIds.map((escId, idx) => ({
      id: `temp-parada-${escId}`,
      rota_logistica_id: rotaLogisticaId,
      escola_id: escId,
      ordem: idx + 1,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    }))

    setParadasRota((prev) => [
      ...prev.filter((p) => p.rota_logistica_id !== rotaLogisticaId),
      ...novasParadasOptimistic,
    ])

    // 2. Optimistic Update dos Pedidos Pendentes
    setOrders((prev) =>
      prev.map((o) => {
        if (o.status !== 'Pendente') return o
        if (escolaIds.includes(o.schoolId)) {
          return { ...o, rotaLogisticaId, rotaLogisticaNome: nomeRota }
        }
        if (escolasDesatribuidas.includes(o.schoolId) && o.rotaLogisticaId === rotaLogisticaId) {
          return { ...o, rotaLogisticaId: undefined, rotaLogisticaNome: undefined }
        }
        return o
      }),
    )

    // 3. Optimistic Update em contractSchools
    setContractSchools((prev) =>
      prev.map((ce) => {
        if (ce.contrato_id !== contratoId) return ce
        if (escolaIds.includes(ce.escola_id)) {
          return { ...ce, rota_logistica_id: rotaLogisticaId }
        }
        if (
          escolasDesatribuidas.includes(ce.escola_id) &&
          ce.rota_logistica_id === rotaLogisticaId
        ) {
          return { ...ce, rota_logistica_id: '' }
        }
        return ce
      }),
    )

    try {
      // Atualizar vínculo de rota logística em contrato_escolas.rota_logistica_id
      for (const escId of escolaIds) {
        try {
          await contratosService.updateEscolaRotaLogisticaByContratoEscola(
            contratoId,
            escId,
            rotaLogisticaId,
          )
        } catch (linkErr) {
          console.warn(`Erro ao sincronizar rota_logistica_id para escola ${escId}:`, linkErr)
        }
      }

      for (const escId of escolasDesatribuidas) {
        try {
          await contratosService.updateEscolaRotaLogisticaByContratoEscola(contratoId, escId, '')
        } catch (linkErr) {
          console.warn(`Erro ao limpar rota_logistica_id para escola ${escId}:`, linkErr)
        }
      }

      // Salvar paradas em batch no servidor
      const ordemExistenteMap = new Map<string, number>()
      paradasAnteriores.forEach((p) => ordemExistenteMap.set(p.escola_id, p.ordem))

      const paradasPayload = escolaIds.map((escolaId, idx) => ({
        escola_id: escolaId,
        ordem: ordemExistenteMap.get(escolaId) || idx + 1,
      }))
      paradasPayload.sort((a, b) => a.ordem - b.ordem)
      const paradasPayloadNormalizadas = paradasPayload.map((p, idx) => ({
        escola_id: p.escola_id,
        ordem: idx + 1,
      }))

      const savedParadas = await rotasLogisticasService.reordenarParadas(
        rotaLogisticaId,
        paradasPayloadNormalizadas,
      )

      if (savedParadas && savedParadas.length > 0) {
        setParadasRota((prev) => [
          ...prev.filter((p) => p.rota_logistica_id !== rotaLogisticaId),
          ...savedParadas,
        ])
      }

      // Atualizar pedidos pendentes no banco
      const pedidosPendentesAtribuidos = orders.filter(
        (o) => o.status === 'Pendente' && escolaIds.includes(o.schoolId),
      )
      for (const ped of pedidosPendentesAtribuidos) {
        if (ped.rotaLogisticaId !== rotaLogisticaId) {
          await pedidosService.atribuirRotaLogistica(ped.id, rotaLogisticaId)
        }
      }

      if (escolasDesatribuidas.length > 0) {
        const pedidosPendentesDesatribuidos = orders.filter(
          (o) =>
            o.status === 'Pendente' &&
            escolasDesatribuidas.includes(o.schoolId) &&
            o.rotaLogisticaId === rotaLogisticaId,
        )
        for (const ped of pedidosPendentesDesatribuidos) {
          await pedidosService.atribuirRotaLogistica(ped.id, '')
        }
      }

      toast.success(
        `Rota Logística "${nomeRota}" configurada com ${escolaIds.length} escola(s) e vínculos atualizados!`,
      )
      return true
    } catch (err: any) {
      console.error('Erro ao sincronizar escolas da rota logística:', err)
      // Rollback
      setParadasRota(prevParadas)
      setOrders(prevOrders)
      setContractSchools(prevContractSchools)
      toast.error('Falha ao sincronizar escolas e rotas.')
      return false
    }
  }

  // 4. ROTEAMENTO POR CONTRATO: Atribuir pedidos pendentes a rota logística
  const atribuirPedidosARotaLogistica = async (
    pedidoIds: string[],
    rotaLogisticaId: string,
  ): Promise<boolean> => {
    const rotaLog = rotasLogisticas.find((r) => r.id === rotaLogisticaId)
    const contratoId = rotaLog?.contrato_id
    const prevOrders = [...orders]

    // Optimistic Update
    setOrders((prev) =>
      prev.map((o) =>
        pedidoIds.includes(o.id)
          ? { ...o, rotaLogisticaId, rotaLogisticaNome: rotaLog?.nome || o.rotaLogisticaNome }
          : o,
      ),
    )

    try {
      for (const pid of pedidoIds) {
        await pedidosService.atribuirRotaLogistica(pid, rotaLogisticaId)
      }

      if (rotaLog && contratoId) {
        const pedEscolaIds = new Set(
          orders.filter((o) => pedidoIds.includes(o.id)).map((o) => o.schoolId),
        )

        for (const escId of pedEscolaIds) {
          try {
            await contratosService.updateEscolaRotaLogisticaByContratoEscola(
              contratoId,
              escId,
              rotaLogisticaId,
            )
          } catch {
            /* intentionally ignored */
          }
        }
      }

      toast.success(`${pedidoIds.length} pedido(s) atribuído(s) à rota logística com sucesso!`)
      return true
    } catch (err: any) {
      console.error('Erro ao atribuir pedidos à rota logística:', err)
      setOrders(prevOrders)
      toast.error('Falha ao salvar atribuição de rota.')
      return false
    }
  }

  // 5. SEQUENCIAMENTO DAS PARADAS: Salvar paradas ordenadas em BATCH ÚNICO
  const salvarSequenciamentoParadas = async (
    rotaLogisticaId: string,
    paradas: Array<{ escola_id: string; ordem: number }>,
  ): Promise<boolean> => {
    const prevParadas = [...paradasRota]

    // Optimistic update das ordens das paradas locais
    const paradaOrdemMap = new Map(paradas.map((p) => [p.escola_id, p.ordem]))
    setParadasRota((prev) =>
      prev.map((p) => {
        if (p.rota_logistica_id !== rotaLogisticaId) return p
        const novaOrdem = paradaOrdemMap.get(p.escola_id)
        return novaOrdem !== undefined ? { ...p, ordem: novaOrdem } : p
      }),
    )

    try {
      const saved = await rotasLogisticasService.reordenarParadas(rotaLogisticaId, paradas)
      if (saved && saved.length > 0) {
        setParadasRota((prev) => [
          ...prev.filter((p) => p.rota_logistica_id !== rotaLogisticaId),
          ...saved,
        ])
      }
      return true
    } catch (err: any) {
      console.error('Erro ao salvar sequenciamento de paradas:', err)
      setParadasRota(prevParadas)
      toast.error('Falha ao salvar sequência de paradas.')
      return false
    }
  }

  const updateCicloStatus = async (
    cicloId: string,
    status: 'coletando' | 'correcao' | 'fechado',
  ): Promise<boolean> => {
    const prevCiclos = [...ciclos]
    const prevActive = activeCiclo

    // Optimistic update
    setCiclos((prev) => prev.map((c) => (c.id === cicloId ? { ...c, status } : c)))
    if (activeCiclo?.id === cicloId) {
      setActiveCiclo({ ...activeCiclo, status })
    }

    try {
      await ciclosService.setStatus(cicloId, status)
      toast.success(`Fase do ciclo alterada para "${status}" com sucesso!`)
      return true
    } catch (err: any) {
      console.error('Erro ao alterar status do ciclo:', err)
      setCiclos(prevCiclos)
      setActiveCiclo(prevActive)
      toast.error('Erro ao atualizar status do ciclo.')
      return false
    }
  }

  const createCiclo = async (data: {
    nome: string
    data_inicio: string
    data_fim: string
    status: 'coletando' | 'correcao' | 'fechado'
  }): Promise<CicloRecord | null> => {
    const tempId = `temp-ciclo-${Date.now()}`
    const tempCiclo: CicloRecord = {
      id: tempId,
      nome: data.nome,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim,
      status: data.status,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    }

    setCiclos((prev) => [...prev, tempCiclo])

    try {
      const created = await ciclosService.create(data)
      setCiclos((prev) => {
        const alreadyHasCreated = prev.some((c) => c.id === created.id)
        if (alreadyHasCreated) {
          return prev.filter((c) => c.id !== tempId)
        }
        return prev.map((c) => (c.id === tempId ? created : c))
      })
      toast.success(`Ciclo "${data.nome}" criado com sucesso!`)
      return created
    } catch (err: any) {
      console.error('Erro ao criar ciclo:', err)
      setCiclos((prev) => prev.filter((c) => c.id !== tempId))
      toast.error('Falha ao criar novo ciclo.')
      return null
    }
  }

  const generateAtesto = async (
    orderId: string,
    pdfBlob?: Blob,
    customNumero?: string,
  ): Promise<AtestoRecord | null> => {
    const order = orders.find((o) => o.id === orderId)
    if (!order) {
      toast.error('Pedido não encontrado.')
      return null
    }

    const existing = atestos.find((a) => a.orderId === orderId)
    if (existing) {
      toast.info('Já existe atesto emitido para este pedido.')
      return null
    }

    const atestoCount = atestos.length + 1
    const numero = customNumero || `AT-${String(atestoCount).padStart(3, '0')}`
    const now = new Date().toISOString()
    const tempId = `temp-atesto-${Date.now()}`

    const tempAtesto: Atesto = {
      id: tempId,
      numero,
      orderId,
      orderNumber: order.numero,
      schoolName: order.schoolName,
      date: now.split('T')[0],
      status: 'Pendente Assinatura',
    }
    setAtestos((prev) => [tempAtesto, ...prev])

    try {
      const created = await atestosService.create({
        numero,
        pedido_id: orderId,
        data_emissao: now,
        status: 'Pendente Assinatura',
        arquivo: pdfBlob,
      })

      setAtestos((prev) => {
        const alreadyHasCreated = prev.some((a) => a.id === created.id)
        if (alreadyHasCreated) {
          return prev.filter((a) => a.id !== tempId)
        }
        return prev.map((a) =>
          a.id === tempId
            ? {
                ...a,
                id: created.id,
                arquivo: created.arquivo,
              }
            : a,
        )
      })

      return created
    } catch (err: any) {
      console.error('Erro ao gerar atesto:', err)
      setAtestos((prev) => prev.filter((a) => a.id !== tempId))
      const detailMsg =
        err?.data?.message ||
        err?.response?.message ||
        err?.message ||
        'Falha ao gerar atesto no banco.'
      toast.error(`Falha ao gerar atesto no banco: ${detailMsg}`)
      return null
    }
  }

  const confirmAtesto = async (atestoId: string): Promise<boolean> => {
    const prevAtestos = [...atestos]
    setAtestos((prev) => prev.map((a) => (a.id === atestoId ? { ...a, status: 'Confirmado' } : a)))

    try {
      await atestosService.confirm(atestoId)
      return true
    } catch (err: any) {
      console.error('Erro ao confirmar atesto:', err)
      setAtestos(prevAtestos)
      toast.error('Falha ao confirmar atesto.')
      return false
    }
  }

  return (
    <AppContext.Provider
      value={{
        products,
        schools,
        contracts,
        contractSchools,
        contractItems,
        orders,
        atestos,
        ciclos,
        activeCiclo,
        rotas,
        rotasLogisticas,
        paradasRota,
        despachos,
        config,
        logoUrl,
        isLoading,
        error,
        refreshData: loadAllData,
        addOrder,
        updateOrderStatus,
        confirmarEntregaPedido,
        cancelarPedido,
        criarRotaLogistica,
        atualizarRotaLogistica,
        excluirRotaLogistica,
        sincronizarEscolasRotaLogistica,
        despacharRotaInteira,
        confirmarEntregaRotaInteira,
        marcarNaoEntreguePedido,
        atribuirPedidosARotaLogistica,
        salvarSequenciamentoParadas,
        updateCicloStatus,
        createCiclo,
        generateAtesto,
        confirmAtesto,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
