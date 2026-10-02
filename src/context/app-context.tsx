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
  CicloContratoRecord,
  RotaRecord,
  RotaLogisticaRecord,
  ParadaRotaRecord,
  DespachoRecord,
  ContratoEscolaRecord,
  ContratoItemRecord,
  PedidoValidacao,
  ConfiguracoesRecord,
  ChamadaRecord,
  ChamadaItemRecord,
} from '@/lib/types'
import { configuracoesService } from '@/services/configuracoes'
import { chamadasService } from '@/services/chamadas'
import { produtosService } from '@/services/produtos'
import { escolasService } from '@/services/escolas'
import { contratosService } from '@/services/contratos'
import { pedidosService } from '@/services/pedidos'
import { atestosService } from '@/services/atestos'
import { ciclosService } from '@/services/ciclos'
import { cicloContratosService } from '@/services/ciclo-contratos'
import { rotasService } from '@/services/rotas'
import { rotasLogisticasService } from '@/services/rotas-logisticas'
import { toast } from 'sonner'
import useRealtime from '@/hooks/use-realtime'
import { validateOrder } from '@/lib/orderValidation'
import { derivarStatusCiclo, getCicloAtivo } from '@/lib/cicloUtils'

export interface CreateOrderData {
  schoolId: string
  date: string
  cicloId?: string
  origem?: 'excel' | 'whatsapp' | 'manual' | 'formulario'
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
  chamadas: ChamadaRecord[]
  chamadaItems: ChamadaItemRecord[]
  contracts: Contract[]
  contractSchools: ContratoEscolaRecord[]
  contractItems: ContratoItemRecord[]
  orders: Order[]
  atestos: Atesto[]
  ciclos: CicloRecord[]
  cicloContratos: CicloContratoRecord[]
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
    contratoId?: string,
    userId?: string,
    chamadaId?: string,
  ) => Promise<boolean>
  confirmarEntregaRotaInteira: (rotaLogisticaId: string, userId?: string) => Promise<boolean>
  marcarNaoEntreguePedido: (
    pedidoId: string,
    motivoLogistico: string,
    userId?: string,
  ) => Promise<boolean>
  criarRotaLogistica: (data: {
    chamada_id?: string
    contrato_id?: string
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
      caminhao_escola_id?: string | null
      caminhao_posicao_atual?: number | null
    },
  ) => Promise<RotaLogisticaRecord | null>
  atualizarPosicaoCaminhaoRota: (
    rotaId: string,
    escolaId: string | null,
    posicaoAtual?: number | null,
  ) => Promise<boolean>
  excluirRotaLogistica: (id: string) => Promise<boolean>
  sincronizarEscolasRotaLogistica: (
    contratoId: string,
    rotaLogisticaId: string,
    escolaIds: string[],
    pedidoIds?: string[],
    chamadaId?: string,
  ) => Promise<boolean>
  atribuirPedidosARotaLogistica: (pedidoIds: string[], rotaLogisticaId: string) => Promise<boolean>
  salvarSequenciamentoParadas: (
    rotaLogisticaId: string,
    paradas: Array<{ escola_id: string; ordem: number }>,
  ) => Promise<boolean>
  moverEscolaEntreRotas: (data: {
    escolaId: string
    origemRotaId?: string
    destinoRotaId: string
    targetOrdem?: number
  }) => Promise<boolean>
  updateCicloStatus: (
    cicloId: string,
    status: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado' | string,
  ) => Promise<boolean>
  updateCicloContratoFase: (
    cicloId: string,
    contratoId: string,
    fase: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado' | string,
  ) => Promise<boolean>
  createCiclo: (data: {
    nome: string
    chamada_id?: string
    data_inicio: string
    data_fim: string
    data_despacho?: string
    status?: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado' | string
    snapshot?: any
    contratoIds?: string[]
  }) => Promise<CicloRecord | null>
  cancelarCicloContrato: (
    cicloId: string,
    contratoId: string,
    motivo: string,
    cancelarPedidosJunto?: boolean,
  ) => Promise<boolean>
  cancelarCiclo: (
    cicloId: string,
    motivo: string,
    cancelarPedidosJunto?: boolean,
  ) => Promise<boolean>
  updateOrderItemsAndDate: (
    orderId: string,
    items: Array<{ productId: string; quantity: number }>,
    orderDate?: string,
  ) => Promise<boolean>
}

const AppContext = createContext<AppState | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [chamadas, setChamadas] = useState<ChamadaRecord[]>([])
  const [chamadaItems, setChamadaItems] = useState<ChamadaItemRecord[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractSchools, setContractSchools] = useState<ContratoEscolaRecord[]>([])
  const [contractItems, setContractItems] = useState<ContratoItemRecord[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [atestos, setAtestos] = useState<Atesto[]>([])
  const [ciclos, setCiclos] = useState<CicloRecord[]>([])
  const [cicloContratos, setCicloContratos] = useState<CicloContratoRecord[]>([])
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
        rawCicloContratos,
        rawRotas,
        rawRotasLogisticas,
        rawParadasRota,
        rawDespachos,
        rawConfig,
        rawChamadas,
        rawChamadaItens,
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
        cicloContratosService.getAll(),
        rotasService.getAll(),
        rotasService.getAll(),
        rotasService.getParadas(),
        rotasService.getDespachos(),
        configuracoesService.get(),
        chamadasService.getAll().catch(() => [] as ChamadaRecord[]),
        chamadasService.getAllItems().catch(() => [] as ChamadaItemRecord[]),
      ])

      setChamadas(rawChamadas || [])
      setChamadaItems(rawChamadaItens || [])
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

      // Deduplica contratos e cicloContratos para garantir unicidade em memória
      const seenContratoIds = new Set<string>()
      const dedupedContratos = rawContratos.filter((c) => {
        if (seenContratoIds.has(c.id)) return false
        seenContratoIds.add(c.id)
        return true
      })

      const seenCicloContratoPairs = new Set<string>()
      const dedupedCicloContratos = rawCicloContratos.filter((cc) => {
        const key = `${cc.ciclo_id}:${cc.contrato_id}`
        if (seenCicloContratoPairs.has(key)) return false
        seenCicloContratoPairs.add(key)
        return true
      })

      // Auto-vínculo de compatibilidade para ciclos legados sem chamada_id:
      // Se um ciclo legado não tiver chamada_id, derivar a partir do primeiro contrato vinculado
      const ciclosEnriquecidos = rawCiclos.map((ciclo) => {
        let chId = ciclo.chamada_id
        if (!chId) {
          const primeiroVinculo = dedupedCicloContratos.find((cc) => cc.ciclo_id === ciclo.id)
          if (primeiroVinculo) {
            const contr = dedupedContratos.find((c) => c.id === primeiroVinculo.contrato_id)
            if (contr?.chamada_id) {
              chId = contr.chamada_id
            }
          }
        }
        const chObj = rawChamadas.find((ch) => ch.id === chId)
        return {
          ...ciclo,
          chamada_id: chId,
          expand: {
            ...ciclo.expand,
            chamada_id: chObj || ciclo.expand?.chamada_id,
          },
        }
      })

      setCiclos(ciclosEnriquecidos)
      setCicloContratos(dedupedCicloContratos)

      // Ciclo ATIVO = o mais recente ciclo com PELO MENOS UM contrato em fase não-terminal (máx. 1)
      const ordenadosCiclos = [...ciclosEnriquecidos].sort((a, b) => {
        const tA = new Date(a.created || a.data_inicio).getTime()
        const tB = new Date(b.created || b.data_inicio).getTime()
        return tB - tA
      })

      const cicloAtivoEncontrado = ordenadosCiclos.find((c) => {
        const vinculados = rawCicloContratos.filter((cc) => cc.ciclo_id === c.id)
        if (vinculados.length === 0) {
          return c.status !== 'fechado' && c.status !== 'cancelado'
        }
        return vinculados.some((cc) => cc.fase !== 'fechado' && cc.fase !== 'cancelado')
      })
      setActiveCiclo(cicloAtivoEncontrado || null)
      setRotas(rawRotas)
      setRotasLogisticas(rawRotas)
      setParadasRota(rawParadasRota)
      setDespachos(rawDespachos)
      setContractSchools(rawContratoEscolas)
      setContractItems(rawContratoItens)

      // Map produtos
      const mappedProds: Product[] = rawProds.map((p) => ({
        id: p.id,
        name: p.nome,
        unit: p.unidade,
        category: p.categoria || '',
        disponibilidade: (p.disponibilidade as any) || 'normal',
        stock: p.estoque !== undefined ? Number(p.estoque) : undefined,
        price: p.preco_unitario !== undefined ? Number(p.preco_unitario) : undefined,
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
        cep: s.cep || '',
        latitude: s.latitude || '',
        longitude: s.longitude || '',
        codigo_inep: s.codigo_inep || '',
        dependencia_administrativa: s.dependencia_administrativa || '',
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

        // Derivar Rota Logística prioritariamente da ESCOLA (paradas_rota) e fallback para ped.rota_id
        const paradaEscola = escolaParadaMap.get(ped.escola_id)
        const effectiveRotaLogisticaId = paradaEscola?.rota_id || ped.rota_id
        const rotaLogObj = rawRotas.find((r) => r.id === effectiveRotaLogisticaId)
        const rotaLogisticaNome = rotaLogObj?.nome || ped.expand?.rota_id?.nome

        const pItens = rawPedidoItens.filter((pi) => pi.pedido_id === ped.id)
        let total = 0
        const items = pItens.map((pi) => {
          const prod = mappedProds.find((p) => p.id === pi.produto_id)
          const prodName = pi.expand?.produto_id?.nome || prod?.name || 'Produto'
          const preco = Number(pi.preco_unitario) || Number(prod?.price) || 0
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

        const motivoCancel = ped.motivo_cancelamento

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
          motivo_cancelamento: motivoCancel,
          cancelado_em: ped.cancelado_em,
          total: Math.round(total * 100) / 100,
          items,
        }
      })
      setOrders(mappedOrders)

      // Map contratos with N:N escolas and balance calculation
      const mappedContracts: Contract[] = dedupedContratos.map((c) => {
        const links = rawContratoEscolas.filter((ce) => ce.contrato_id === c.id && !ce.encerrado_em)
        const linkedSchools = links.map((ce) => {
          const sch = mappedSchools.find((s) => s.id === ce.escola_id)
          const rt = rawRotas.find((r) => r.id === ce.rota_id)
          const ceRotaRaw = (ce as any).rota?.trim()
          const ceRotaTexto = ceRotaRaw && !/^[a-z0-9]{15}$/.test(ceRotaRaw) ? ceRotaRaw : undefined

          const rotaPlanilhaNome = ceRotaTexto || ce.expand?.rota_id?.nome || rt?.nome || 'Sem Rota'

          // Rota unificada associada a esta escola
          const paradaEscola = rawParadasRota.find((p) => p.escola_id === ce.escola_id)
          const rotaLogId = ce.rota_id || paradaEscola?.rota_id
          const rotaLogObj = rawRotas.find((r) => r.id === rotaLogId)
          const rotaLogisticaNome = ce.expand?.rota_id?.nome || rotaLogObj?.nome || rt?.nome

          return {
            id: ce.id,
            contratoId: ce.contrato_id,
            escolaId: ce.escola_id,
            rotaId: ce.rota_id || rotaLogId,
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
            escolaCep: ce.expand?.escola_id?.cep || sch?.cep || '',
            escolaLatitude: ce.expand?.escola_id?.latitude || sch?.latitude || '',
            escolaLongitude: ce.expand?.escola_id?.longitude || sch?.longitude || '',
            escolaCodigoInep: ce.expand?.escola_id?.codigo_inep || sch?.codigo_inep || '',
            escolaDependenciaAdministrativa:
              ce.expand?.escola_id?.dependencia_administrativa ||
              sch?.dependencia_administrativa ||
              '',
            rotaNome: rotaPlanilhaNome,
            coleta_por: ce.coleta_por || 'padrao',
            encerrado_em: ce.encerrado_em,
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

        const matchedChamada =
          rawChamadas.find((ch) => ch.id === c.chamada_id) || c.expand?.chamada_id
        return {
          id: c.id,
          numero: c.numero,
          chamada_id: c.chamada_id || matchedChamada?.id || '',
          chamadaNumero: matchedChamada?.chamada || c.numero_chamada || '',
          chamadaPrograma: matchedChamada?.programa || c.tipo || '',
          chamadaModalidade: matchedChamada?.modalidade || (c.modalidade_pedido as any),
          chamadaDependenciaAdministrativa: matchedChamada?.dependencia_administrativa || '',
          chamadaStatus: matchedChamada?.status || (c.status as any),
          numero_chamada: c.numero_chamada || matchedChamada?.chamada || '',
          tipo: c.tipo || 'PNAE',
          modalidade_pedido: c.modalidade_pedido || 'individualizado',
          tipo_importacao: c.tipo_importacao,
          abas_planilha: c.abas_planilha || '',
          num_rotas_logisticas:
            c.num_rotas_logisticas !== undefined && c.num_rotas_logisticas !== null
              ? Number(c.num_rotas_logisticas)
              : undefined,
          totalValue,
          balance,
          status: c.status,
          encerrado_em: c.encerrado_em,
          motivo_cancelamento: c.motivo_cancelamento,
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
        const effectiveRotaLogisticaId = paradaEscola?.rota_id || rec.rota_id
        const rotaLogObj = rotas.find((r) => r.id === effectiveRotaLogisticaId)
        const rotaLogisticaNome = rotaLogObj?.nome || rec.expand?.rota_id?.nome
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
            motivo_cancelamento: rec.motivo_cancelamento || existing.motivo_cancelamento,
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
          motivo_cancelamento: rec.motivo_cancelamento,
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

  useRealtime<any>('rotas', (e) => {
    if (e.action === 'delete') {
      setRotas((prev) => prev.filter((r) => r.id !== e.record.id))
      setRotasLogisticas((prev) => prev.filter((r) => r.id !== e.record.id))
    } else if (e.action === 'create' || e.action === 'update') {
      const rec = e.record as RotaRecord
      const updateList = (prev: RotaRecord[]) => {
        const existingIdx = prev.findIndex((r) => r.id === rec.id)
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = { ...copy[existingIdx], ...rec }
          return copy.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        }

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
      }
      setRotas(updateList)
      setRotasLogisticas(updateList)
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
            p.id.startsWith('temp-') && p.rota_id === rec.rota_id && p.escola_id === rec.escola_id,
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
            d.rota_id === rec.rota_id,
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
            unit: p.unidade !== undefined ? p.unidade : copy[existingIdx].unit,
            category: p.categoria !== undefined ? p.categoria : copy[existingIdx].category,
            stock: p.estoque !== undefined ? Number(p.estoque) : copy[existingIdx].stock,
            price:
              p.preco_unitario !== undefined ? Number(p.preco_unitario) : copy[existingIdx].price,
          }
          return copy
        }

        const item: Product = {
          id: p.id,
          name: p.nome,
          unit: p.unidade,
          category: p.categoria || '',
          stock: p.estoque !== undefined ? Number(p.estoque) : undefined,
          price: p.preco_unitario !== undefined ? Number(p.preco_unitario) : undefined,
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
            bairro: s.bairro !== undefined ? s.bairro : copy[existingIdx].bairro,
            contatoResponsavel:
              s.contato !== undefined ? s.contato : copy[existingIdx].contatoResponsavel,
            cep: s.cep !== undefined ? s.cep : copy[existingIdx].cep,
            latitude: s.latitude !== undefined ? s.latitude : copy[existingIdx].latitude,
            longitude: s.longitude !== undefined ? s.longitude : copy[existingIdx].longitude,
            codigo_inep:
              s.codigo_inep !== undefined ? s.codigo_inep : copy[existingIdx].codigo_inep,
            dependencia_administrativa:
              s.dependencia_administrativa !== undefined
                ? s.dependencia_administrativa
                : copy[existingIdx].dependencia_administrativa,
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
          dependencia_administrativa: s.dependencia_administrativa || '',
          alunos: s.alunos !== undefined && s.alunos !== null ? Number(s.alunos) : undefined,
          bairro: s.bairro || '',
          contatoResponsavel: s.contato || '',
          cep: s.cep || '',
          latitude: s.latitude || '',
          longitude: s.longitude || '',
          codigo_inep: s.codigo_inep || '',
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
          const tempIdx = prev.findIndex((c) => c.id.startsWith('temp-') && c.nome === rec.nome)
          if (tempIdx !== -1) {
            const copy = [...prev]
            copy[tempIdx] = rec
            updated = copy
          } else {
            updated = [...prev, rec]
          }
        }

        // Recalcular ciclo ativo com base nos contratos
        const ordenados = [...updated].sort((a, b) => {
          const tA = new Date(a.created || a.data_inicio).getTime()
          const tB = new Date(b.created || b.data_inicio).getTime()
          return tB - tA
        })
        const cicloAtivo = ordenados.find((c) => {
          const vinculados = cicloContratos.filter((cc) => cc.ciclo_id === c.id)
          if (vinculados.length === 0) {
            return c.status !== 'fechado' && c.status !== 'cancelado'
          }
          return vinculados.some((cc) => cc.fase !== 'fechado' && cc.fase !== 'cancelado')
        })
        setActiveCiclo(cicloAtivo || null)
        return updated
      })
    }
  })

  useRealtime<any>('ciclo_contratos', (e) => {
    if (e.action === 'delete') {
      setCicloContratos((prev) => {
        const updated = prev.filter((cc) => cc.id !== e.record.id)
        // Recalcular ativo
        const ordenados = [...ciclos].sort((a, b) => {
          const tA = new Date(a.created || a.data_inicio).getTime()
          const tB = new Date(b.created || b.data_inicio).getTime()
          return tB - tA
        })
        const cicloAtivo = ordenados.find((c) => {
          const vinculados = updated.filter((cc) => cc.ciclo_id === c.id)
          if (vinculados.length === 0) {
            return c.status !== 'fechado' && c.status !== 'cancelado'
          }
          return vinculados.some((cc) => cc.fase !== 'fechado' && cc.fase !== 'cancelado')
        })
        setActiveCiclo(cicloAtivo || null)
        return updated
      })
    } else if (e.action === 'create' || e.action === 'update') {
      const rec = e.record as CicloContratoRecord
      setCicloContratos((prev) => {
        // Encontrar tanto por ID quanto por par (ciclo_id, contrato_id) para evitar duplicatas em transições ou optimistic updates
        const existingIdx = prev.findIndex(
          (cc) =>
            cc.id === rec.id ||
            (rec.ciclo_id &&
              rec.contrato_id &&
              cc.ciclo_id === rec.ciclo_id &&
              cc.contrato_id === rec.contrato_id),
        )
        let updated: CicloContratoRecord[]
        if (existingIdx !== -1) {
          const copy = [...prev]
          copy[existingIdx] = { ...copy[existingIdx], ...rec }
          updated = copy
        } else {
          updated = [rec, ...prev]
        }

        // Recalcular ativo
        const ordenados = [...ciclos].sort((a, b) => {
          const tA = new Date(a.created || a.data_inicio).getTime()
          const tB = new Date(b.created || b.data_inicio).getTime()
          return tB - tA
        })
        const cicloAtivo = ordenados.find((c) => {
          const vinculados = updated.filter((cc) => cc.ciclo_id === c.id)
          if (vinculados.length === 0) {
            return c.status !== 'fechado' && c.status !== 'cancelado'
          }
          return vinculados.some((cc) => cc.fase !== 'fechado' && cc.fase !== 'cancelado')
        })
        setActiveCiclo(cicloAtivo || null)
        return updated
      })
    }
  })

  useRealtime<any>('chamadas', async (_e) => {
    try {
      const updatedChamadas = await chamadasService.getAll()
      setChamadas(updatedChamadas)
    } catch (err) {
      console.error('Erro na sincronização realtime de chamadas:', err)
    }
  })

  useRealtime<any>('chamada_itens', async (_e) => {
    try {
      const updatedChamadaItens = await chamadasService.getAllItems()
      setChamadaItems(updatedChamadaItens)
    } catch (err) {
      console.error('Erro na sincronização realtime de chamada_itens:', err)
    }
  })

  useRealtime<any>('contratos', async (_e) => {
    // Sincronizar quando houver alterações em contratos
    try {
      const rawContratos = await contratosService.getAll()
      setContracts((prev) => {
        return rawContratos.map((c) => {
          const existing = prev.find((p) => p.id === c.id)
          const matchedChamada =
            chamadas.find((ch) => ch.id === c.chamada_id) || c.expand?.chamada_id
          const totalValue = Number(c.valor_total) || 0
          return {
            id: c.id,
            numero: c.numero,
            chamada_id: c.chamada_id || matchedChamada?.id || existing?.chamada_id || '',
            chamadaNumero:
              matchedChamada?.chamada || c.numero_chamada || existing?.chamadaNumero || '',
            chamadaPrograma: matchedChamada?.programa || c.tipo || existing?.chamadaPrograma || '',
            chamadaDependenciaAdministrativa:
              matchedChamada?.dependencia_administrativa ||
              existing?.chamadaDependenciaAdministrativa ||
              '',
            chamadaModalidade:
              matchedChamada?.modalidade ||
              (c.modalidade_pedido as any) ||
              existing?.chamadaModalidade,
            chamadaStatus: matchedChamada?.status || (c.status as any) || existing?.chamadaStatus,
            numero_chamada: c.numero_chamada || matchedChamada?.chamada || '',
            tipo: c.tipo || 'PNAE',
            modalidade_pedido: c.modalidade_pedido || 'individualizado',
            tipo_importacao: c.tipo_importacao,
            abas_planilha: c.abas_planilha || '',
            num_rotas_logisticas:
              c.num_rotas_logisticas !== undefined && c.num_rotas_logisticas !== null
                ? Number(c.num_rotas_logisticas)
                : undefined,
            totalValue,
            balance: existing?.balance ?? totalValue,
            status: c.status,
            encerrado_em: c.encerrado_em,
            motivo_cancelamento: c.motivo_cancelamento,
            escolas: existing?.escolas ?? [],
          }
        })
      })
    } catch (err) {
      console.error('Erro na sincronização realtime de contratos:', err)
    }
  })

  useRealtime<any>('contrato_escolas', async (_e) => {
    // Quando houver criação, alteração ou exclusão de vínculo escola↔contrato,
    // recarregar vínculos e contratos para manter o estado global e a tela /escolas sincronizados
    try {
      const [updatedContratoEscolas, rawContratos, rawRotas, rawParadasRota] = await Promise.all([
        contratosService.getEscolas(),
        contratosService.getAll(),
        rotasService.getAll(),
        rotasService.getParadas(),
      ])

      setContractSchools(updatedContratoEscolas)
      setRotas(rawRotas)
      setRotasLogisticas(rawRotas)
      setParadasRota(rawParadasRota)

      setContracts((prevContracts) => {
        return (rawContratos.length > 0 ? rawContratos : prevContracts).map((c) => {
          const existing = prevContracts.find((p) => p.id === c.id)
          const matchedChamada =
            chamadas.find((ch) => ch.id === c.chamada_id) || c.expand?.chamada_id
          const links = updatedContratoEscolas.filter(
            (ce) => ce.contrato_id === c.id && !ce.encerrado_em,
          )
          const linkedSchools = links.map((ce) => {
            const sch = schools.find((s) => s.id === ce.escola_id)
            const rt = rawRotas.find((r) => r.id === ce.rota_id)
            const ceRotaRaw = (ce as any).rota?.trim()
            const ceRotaTexto =
              ceRotaRaw && !/^[a-z0-9]{15}$/.test(ceRotaRaw) ? ceRotaRaw : undefined

            const rotaPlanilhaNome =
              ceRotaTexto || ce.expand?.rota_id?.nome || rt?.nome || 'Sem Rota'

            const paradaEscola = rawParadasRota.find((p) => p.escola_id === ce.escola_id)
            const rotaLogId = ce.rota_id || paradaEscola?.rota_id
            const rotaLogObj = rawRotas.find((r) => r.id === rotaLogId)
            const rotaLogisticaNome = ce.expand?.rota_id?.nome || rotaLogObj?.nome || rt?.nome

            return {
              id: ce.id,
              contratoId: ce.contrato_id,
              escolaId: ce.escola_id,
              rotaId: ce.rota_id || rotaLogId,
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
              escolaCep: ce.expand?.escola_id?.cep || sch?.cep || '',
              escolaLatitude: ce.expand?.escola_id?.latitude || sch?.latitude || '',
              escolaLongitude: ce.expand?.escola_id?.longitude || sch?.longitude || '',
              escolaCodigoInep: ce.expand?.escola_id?.codigo_inep || sch?.codigo_inep || '',
              escolaDependenciaAdministrativa:
                ce.expand?.escola_id?.dependencia_administrativa ||
                sch?.dependencia_administrativa ||
                '',
              rotaNome: rotaPlanilhaNome,
              coleta_por: ce.coleta_por || 'padrao',
              encerrado_em: ce.encerrado_em,
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
            chamada_id: c.chamada_id || matchedChamada?.id || existing?.chamada_id || '',
            chamadaNumero:
              matchedChamada?.chamada || c.numero_chamada || existing?.chamadaNumero || '',
            chamadaPrograma: matchedChamada?.programa || c.tipo || existing?.chamadaPrograma || '',
            chamadaDependenciaAdministrativa:
              matchedChamada?.dependencia_administrativa ||
              existing?.chamadaDependenciaAdministrativa ||
              '',
            chamadaModalidade:
              matchedChamada?.modalidade ||
              (c.modalidade_pedido as any) ||
              existing?.chamadaModalidade,
            chamadaStatus: matchedChamada?.status || (c.status as any) || existing?.chamadaStatus,
            numero_chamada: c.numero_chamada || matchedChamada?.chamada || '',
            tipo: c.tipo || 'PNAE',
            modalidade_pedido: c.modalidade_pedido || 'individualizado',
            tipo_importacao: c.tipo_importacao,
            abas_planilha: c.abas_planilha || '',
            num_rotas_logisticas:
              c.num_rotas_logisticas !== undefined && c.num_rotas_logisticas !== null
                ? Number(c.num_rotas_logisticas)
                : undefined,
            totalValue,
            balance,
            status: c.status,
            encerrado_em: c.encerrado_em,
            motivo_cancelamento: c.motivo_cancelamento,
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

    // Herança automática da Rota da Escola
    let rotaLogisticaIdFinal = orderData.rotaLogisticaId || orderData.rotaId
    if (!rotaLogisticaIdFinal) {
      const paradaDaEscola = paradasRota.find((p) => p.escola_id === orderData.schoolId)
      if (paradaDaEscola) {
        rotaLogisticaIdFinal = paradaDaEscola.rota_id
      }
    }
    if (!rotaId && rotaLogisticaIdFinal) {
      rotaId = rotaLogisticaIdFinal
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
        rota_id: rotaId || rotaLogisticaIdFinal,
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
      const motivo = options?.motivo_cancelamento?.trim()
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
                motivo_cancelamento: updated.motivo_cancelamento,
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

    // Optimistic update: marca pedido como entregue na UI
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, status: 'Entregue', entregue_em: nowIso, entregue_por: userId } : o,
      ),
    )

    try {
      // 1. Atualizar pedido para Entregue
      await pedidosService.updateStatus(id, 'Entregue', {
        entregue_em: nowIso,
        entregue_por: userId || undefined,
      })

      toast.success(`Pedido ${targetOrder.numero} entregue com sucesso!`)
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
              motivo_cancelamento: cleanMotivo,
              cancelado_em: nowIso,
            }
          : o,
      ),
    )

    try {
      await pedidosService.updateStatus(id, 'Cancelado', {
        motivo_cancelamento: cleanMotivo,
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
    contratoId?: string,
    userId?: string,
    chamadaId?: string,
  ): Promise<boolean> => {
    // Escolas que pertencem a esta rota (via paradas_rota)
    const escolasDaRota = new Set(
      paradasRota.filter((p) => p.rota_id === rotaLogisticaId).map((p) => p.escola_id),
    )

    // Identificar pedidos pendentes do ciclo ativo (ou pendentes em geral)
    const pedidosDaRota = orders.filter((o) => {
      if (o.status !== 'Pendente') return false
      if (activeCiclo?.id && o.cicloId && o.cicloId !== activeCiclo.id) return false
      return (
        escolasDaRota.has(o.schoolId) ||
        o.rotaLogisticaId === rotaLogisticaId ||
        o.rotaId === rotaLogisticaId
      )
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

    const effectiveChamadaId = chamadaId || rotaLog?.chamada_id
    const effectiveContratoId = contratoId || rotaLog?.contrato_id

    const tempDespacho: DespachoRecord = {
      id: `temp-desp-${Date.now()}`,
      chamada_id: effectiveChamadaId,
      contrato_id: effectiveContratoId,
      ciclo_id: activeCiclo?.id,
      rota_id: rotaLogisticaId,
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
        chamada_id: effectiveChamadaId,
        contrato_id: effectiveContratoId,
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
        `Rota despachada com sucesso! ${pedidosDaRota.length} pedido(s) colocados "Em Rota".`,
      )
      return true
    } catch (err: any) {
      console.error('Erro ao despachar rota em lote:', err)
      // Rollback
      setOrders(prevOrders)
      setDespachos(prevDespachos)
      toast.error('Falha ao despachar rota.')
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
      paradasRota.filter((p) => p.rota_id === rotaLogisticaId).map((p) => p.escola_id),
    )

    const pedidosEmRota = orders.filter((o) => {
      if (o.status !== 'Em Rota') return false
      return (
        escolasDaRota.has(o.schoolId) ||
        o.rotaLogisticaId === rotaLogisticaId ||
        o.rotaId === rotaLogisticaId
      )
    })

    if (pedidosEmRota.length === 0) {
      toast.info('Não há pedidos "Em Rota" nesta rota para confirmar entrega.')
      return false
    }

    const nowIso = new Date().toISOString()
    const prevOrders = [...orders]
    const prevProducts = [...products]
    const prevDespachos = [...despachos]
    const prevRotasLogisticas = [...rotasLogisticas]
    const prevRotas = [...rotas]
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
        d.rota_id === rotaLogisticaId && d.status === 'Em Rota' ? { ...d, status: 'Entregue' } : d,
      ),
    )

    // Optimistic Update: limpar caminhão da rota concluída (para o caminhão sumir imediatamente)
    const limparCaminhaoDaRota = (rList: RotaRecord[]) =>
      rList.map((r) =>
        r.id === rotaLogisticaId
          ? {
              ...r,
              caminhao_escola_id: undefined,
              caminhao_posicao_atual: undefined,
            }
          : r,
      )
    setRotasLogisticas(limparCaminhaoDaRota)
    setRotas(limparCaminhaoDaRota)

    try {
      await rotasLogisticasService.entregarRotaBatch({
        rota_logistica_id: rotaLogisticaId,
        user_id: userId,
      })

      // Garantir limpeza no backend via rotasService também caso o hook falhe parcialmente
      try {
        await rotasService.atualizarPosicaoCaminhao(rotaLogisticaId, {
          caminhao_escola_id: null,
          caminhao_posicao_atual: null,
        })
      } catch (_) {
        // Tolerante: o hook do backend já atualizou
      }

      toast.success(`Rota confirmada como entregue! ${pedidosEmRota.length} pedido(s) finalizados.`)
      return true
    } catch (err: any) {
      console.error('Erro ao confirmar entrega da rota inteira:', err)
      // Rollback
      setOrders(prevOrders)
      setProducts(prevProducts)
      setDespachos(prevDespachos)
      setRotasLogisticas(prevRotasLogisticas)
      setRotas(prevRotas)
      toast.error('Falha ao confirmar entrega da rota.')
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
              cancelado_em: nowIso,
              entregue_por: userId,
            }
          : o,
      ),
    )

    try {
      await pedidosService.updateStatus(pedidoId, 'Cancelado', {
        motivo_cancelamento: cleanMotivo,
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
    chamada_id?: string
    contrato_id?: string
    nome: string
    ordem?: number
    ativa?: boolean
  }): Promise<RotaLogisticaRecord | null> => {
    const cleanNome = (data.nome || '').trim().replace(/\s+/g, ' ')
    if (!cleanNome) {
      toast.error('Informe um nome para a rota.')
      return null
    }

    // Validação de unicidade no frontend contra o escopo da chamada ou contrato
    const normalizedTarget = cleanNome.toLowerCase()
    const existeDuplicata = rotasLogisticas.some((r) => {
      const matchEscopo = data.chamada_id
        ? r.chamada_id === data.chamada_id
        : data.contrato_id
          ? r.contrato_id === data.contrato_id
          : false
      return (
        matchEscopo && (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget
      )
    })
    if (existeDuplicata) {
      toast.error(
        data.chamada_id
          ? 'Já existe uma rota com este nome nesta Chamada.'
          : 'Já existe uma rota com este nome neste Contrato.',
      )
      return null
    }

    const tempId = `temp-rota-${Date.now()}`
    const tempRecord: RotaLogisticaRecord = {
      id: tempId,
      chamada_id: data.chamada_id,
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
      toast.success(`Rota "${cleanNome}" criada com sucesso!`)
      return created
    } catch (err: any) {
      console.error('Erro ao criar rota:', err)
      setRotasLogisticas((prev) => prev.filter((r) => r.id !== tempId))
      const serverMsg = err?.data?.message || err?.message || ''
      if (
        serverMsg.includes('Já existe uma rota logística com este nome') ||
        serverMsg.includes('Já existe uma rota com este nome')
      ) {
        toast.error('Já existe uma rota com este nome neste contrato.')
      } else {
        toast.error(serverMsg ? `Falha ao criar rota: ${serverMsg}` : 'Falha ao criar rota.')
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
      caminhao_escola_id?: string | null
      caminhao_posicao_atual?: number | null
    },
  ): Promise<RotaLogisticaRecord | null> => {
    const rotaAtual = rotasLogisticas.find((r) => r.id === id)
    if (!rotaAtual) {
      toast.error('Rota não encontrada.')
      return null
    }

    let cleanNome: string | undefined = undefined
    if (data.nome !== undefined) {
      cleanNome = data.nome.trim().replace(/\s+/g, ' ')
      if (!cleanNome) {
        toast.error('Informe um nome para a rota.')
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
        toast.error('Já existe uma rota com este nome neste contrato.')
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
              caminhao_escola_id:
                data.caminhao_escola_id !== undefined
                  ? data.caminhao_escola_id || undefined
                  : r.caminhao_escola_id,
              caminhao_posicao_atual:
                data.caminhao_posicao_atual !== undefined
                  ? data.caminhao_posicao_atual || undefined
                  : r.caminhao_posicao_atual,
            }
          : r,
      ),
    )
    setRotas((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              nome: cleanNome ?? r.nome,
              ordem: data.ordem ?? r.ordem,
              ativa: data.ativa ?? r.ativa,
              caminhao_escola_id:
                data.caminhao_escola_id !== undefined
                  ? data.caminhao_escola_id || undefined
                  : r.caminhao_escola_id,
              caminhao_posicao_atual:
                data.caminhao_posicao_atual !== undefined
                  ? data.caminhao_posicao_atual || undefined
                  : r.caminhao_posicao_atual,
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
      setRotas((prev) => prev.map((r) => (r.id === id ? updated : r)))
      toast.success(`Rota "${updated.nome}" atualizada com sucesso!`)
      return updated
    } catch (err: any) {
      console.error('Erro ao atualizar rota:', err)
      setRotasLogisticas(prevRotas)
      setRotas(prevRotas)
      setOrders(prevOrders)
      const serverMsg = err?.data?.message || err?.message || ''
      if (
        serverMsg.includes('Já existe uma rota logística com este nome') ||
        serverMsg.includes('Já existe uma rota com este nome')
      ) {
        toast.error('Já existe uma rota com este nome neste contrato.')
      } else {
        toast.error(
          serverMsg ? `Falha ao atualizar rota: ${serverMsg}` : 'Falha ao atualizar rota.',
        )
      }
      return null
    }
  }

  // Atualizar especificamente o pino de caminhão manual da rota
  const atualizarPosicaoCaminhaoRota = async (
    rotaId: string,
    escolaId: string | null,
    posicaoAtual?: number | null,
  ): Promise<boolean> => {
    const prevRotas = [...rotasLogisticas]

    // Optimistic update
    const updateCaminhao = (rList: RotaRecord[]) =>
      rList.map((r) =>
        r.id === rotaId
          ? {
              ...r,
              caminhao_escola_id: escolaId || undefined,
              caminhao_posicao_atual: posicaoAtual || undefined,
            }
          : r,
      )

    setRotasLogisticas(updateCaminhao)
    setRotas(updateCaminhao)

    try {
      await rotasService.atualizarPosicaoCaminhao(rotaId, {
        caminhao_escola_id: escolaId,
        caminhao_posicao_atual: posicaoAtual,
      })
      return true
    } catch (err: any) {
      console.error('Erro ao atualizar posição do caminhão na rota:', err)
      setRotasLogisticas(prevRotas)
      setRotas(prevRotas)
      toast.error('Erro ao atualizar posição manual do caminhão.')
      return false
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
    setRotas((prev) => prev.filter((r) => r.id !== id))
    setRotasLogisticas((prev) => prev.filter((r) => r.id !== id))
    setParadasRota((prev) => prev.filter((p) => p.rota_id !== id))
    setOrders((prev) =>
      prev.map((o) =>
        o.rotaLogisticaId === id || o.rotaId === id
          ? {
              ...o,
              rotaId: undefined,
              rotaNome: undefined,
              rotaLogisticaId: undefined,
              rotaLogisticaNome: undefined,
            }
          : o,
      ),
    )

    try {
      // Desvincular paradas cadastradas no backend
      const paradas = paradasRota.filter((p) => p.rota_id === id)
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
      toast.success('Rota excluída com sucesso!')
      return true
    } catch (err: any) {
      console.error('Erro ao excluir rota:', err)
      setRotasLogisticas(prevRotas)
      setParadasRota(prevParadas)
      setOrders(prevOrders)
      toast.error('Falha ao excluir rota.')
      return false
    }
  }

  // Sincronizar escolas atribuídas a uma rota logística:
  // Preenche paradas_rota, atualiza contrato_escolas.rota_id,
  // atualiza pedidos pendentes dessas escolas e limpa as desatribuídas
  const sincronizarEscolasRotaLogistica = async (
    contratoId: string,
    rotaLogisticaId: string,
    escolaIds: string[],
    _pedidoIdsIgnorado?: string[],
    chamadaId?: string,
  ): Promise<boolean> => {
    const rotaLog = rotasLogisticas.find((r) => r.id === rotaLogisticaId)
    const nomeRota = rotaLog?.nome || 'Rota'
    const targetChamadaId = chamadaId || rotaLog?.chamada_id

    const paradasAnteriores = paradasRota.filter((p) => p.rota_id === rotaLogisticaId)
    const escolasAnterioresIds = paradasAnteriores.map((p) => p.escola_id)
    const novasEscolasSet = new Set(escolaIds)
    const escolasDesatribuidas = escolasAnterioresIds.filter((id) => !novasEscolasSet.has(id))

    // Se o caminhão manual estava posicionado em uma escola que foi removida da rota, limpa a posição
    if (rotaLog?.caminhao_escola_id && !novasEscolasSet.has(rotaLog.caminhao_escola_id)) {
      rotasService
        .atualizarPosicaoCaminhao(rotaLogisticaId, {
          caminhao_escola_id: null,
          caminhao_posicao_atual: null,
        })
        .catch((e) => console.warn('Erro ao limpar caminhão de escola removida da rota:', e))

      setRotasLogisticas((prev) =>
        prev.map((r) =>
          r.id === rotaLogisticaId
            ? { ...r, caminhao_escola_id: undefined, caminhao_posicao_atual: undefined }
            : r,
        ),
      )
      setRotas((prev) =>
        prev.map((r) =>
          r.id === rotaLogisticaId
            ? { ...r, caminhao_escola_id: undefined, caminhao_posicao_atual: undefined }
            : r,
        ),
      )
    }

    const prevParadas = [...paradasRota]
    const prevOrders = [...orders]
    const prevContractSchools = [...contractSchools]

    // 1. Optimistic Update das Paradas
    const novasParadasOptimistic: ParadaRotaRecord[] = escolaIds.map((escId, idx) => ({
      id: `temp-parada-${escId}`,
      rota_id: rotaLogisticaId,
      escola_id: escId,
      ordem: idx + 1,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    }))

    setParadasRota((prev) => [
      ...prev.filter((p) => p.rota_id !== rotaLogisticaId),
      ...novasParadasOptimistic,
    ])

    // 2. Optimistic Update dos Pedidos Pendentes
    setOrders((prev) =>
      prev.map((o) => {
        if (o.status !== 'Pendente') return o
        if (escolaIds.includes(o.schoolId)) {
          return {
            ...o,
            rotaId: rotaLogisticaId,
            rotaNome: nomeRota,
            rotaLogisticaId,
            rotaLogisticaNome: nomeRota,
          }
        }
        if (
          escolasDesatribuidas.includes(o.schoolId) &&
          (o.rotaLogisticaId === rotaLogisticaId || o.rotaId === rotaLogisticaId)
        ) {
          return {
            ...o,
            rotaId: undefined,
            rotaNome: undefined,
            rotaLogisticaId: undefined,
            rotaLogisticaNome: undefined,
          }
        }
        return o
      }),
    )

    // 3. Optimistic Update em contractSchools
    // Se contratoId for fornecido, atualiza para esse contrato; se não ou se for chamada,
    // atualiza para contratos vinculados a essa chamada ou contrato
    const matchingContratoIds = new Set<string>()
    if (contratoId) {
      matchingContratoIds.add(contratoId)
    }
    if (targetChamadaId) {
      contracts
        .filter((c) => c.chamada_id === targetChamadaId)
        .forEach((c) => matchingContratoIds.add(c.id))
    }

    setContractSchools((prev) =>
      prev.map((ce) => {
        if (matchingContratoIds.size > 0 && !matchingContratoIds.has(ce.contrato_id)) return ce
        if (escolaIds.includes(ce.escola_id)) {
          return { ...ce, rota_id: rotaLogisticaId }
        }
        if (escolasDesatribuidas.includes(ce.escola_id) && ce.rota_id === rotaLogisticaId) {
          return { ...ce, rota_id: undefined }
        }
        return ce
      }),
    )

    try {
      // Atualizar vínculo de rota em contrato_escolas.rota_id
      // Encontrar para cada escola qual é o seu contrato_id correto
      for (const escId of escolaIds) {
        try {
          const ceItem = contractSchools.find((ce) =>
            matchingContratoIds.size > 0
              ? matchingContratoIds.has(ce.contrato_id) && ce.escola_id === escId
              : ce.escola_id === escId,
          )
          const targetCId = ceItem?.contrato_id || contratoId
          if (targetCId) {
            await contratosService.updateEscolaRotaByContratoEscola(
              targetCId,
              escId,
              rotaLogisticaId,
            )
          }
        } catch (linkErr) {
          console.warn(`Erro ao sincronizar rota_id para escola ${escId}:`, linkErr)
        }
      }

      for (const escId of escolasDesatribuidas) {
        try {
          const ceItem = contractSchools.find((ce) =>
            matchingContratoIds.size > 0
              ? matchingContratoIds.has(ce.contrato_id) && ce.escola_id === escId
              : ce.escola_id === escId,
          )
          const targetCId = ceItem?.contrato_id || contratoId
          if (targetCId) {
            await contratosService.updateEscolaRotaByContratoEscola(targetCId, escId, '')
          }
        } catch (linkErr) {
          console.warn(`Erro ao limpar rota_id para escola ${escId}:`, linkErr)
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
          ...prev.filter((p) => p.rota_id !== rotaLogisticaId),
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
        `Rota "${nomeRota}" configurada com ${escolaIds.length} escola(s) e vínculos atualizados!`,
      )
      return true
    } catch (err: any) {
      console.error('Erro ao sincronizar escolas da rota:', err)
      // Rollback
      setParadasRota(prevParadas)
      setOrders(prevOrders)
      setContractSchools(prevContractSchools)
      toast.error('Falha ao sincronizar escolas e rotas.')
      return false
    }
  }

  // 4. ROTEAMENTO POR CONTRATO: Atribuir pedidos pendentes a rota
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

      toast.success(`${pedidoIds.length} pedido(s) atribuído(s) à rota com sucesso!`)
      return true
    } catch (err: any) {
      console.error('Erro ao atribuir pedidos à rota:', err)
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
        if (p.rota_id !== rotaLogisticaId) return p
        const novaOrdem = paradaOrdemMap.get(p.escola_id)
        return novaOrdem !== undefined ? { ...p, ordem: novaOrdem } : p
      }),
    )

    try {
      const saved = await rotasLogisticasService.reordenarParadas(rotaLogisticaId, paradas)
      if (saved && saved.length > 0) {
        setParadasRota((prev) => [...prev.filter((p) => p.rota_id !== rotaLogisticaId), ...saved])
      }
      return true
    } catch (err: any) {
      console.error('Erro ao salvar sequenciamento de paradas:', err)
      setParadasRota(prevParadas)
      toast.error('Falha ao salvar sequência de paradas.')
      return false
    }
  }

  // 6. MOVER ESCOLA ENTRE ROTAS LOGÍSTICAS
  const moverEscolaEntreRotas = async ({
    escolaId,
    origemRotaId,
    destinoRotaId,
    targetOrdem,
  }: {
    escolaId: string
    origemRotaId?: string
    destinoRotaId: string
    targetOrdem?: number
  }): Promise<boolean> => {
    // Se mesma rota e sem nova posição especificada, não precisa fazer nada
    if (origemRotaId && origemRotaId === destinoRotaId && targetOrdem === undefined) {
      return true
    }

    const prevParadas = [...paradasRota]
    const prevOrders = [...orders]
    const prevContractSchools = [...contractSchools]
    const prevContracts = [...contracts]

    const rotaDestinoObj = rotasLogisticas.find((r) => r.id === destinoRotaId)
    const nomeRotaDestino = rotaDestinoObj?.nome || 'Rota'
    const contratoId = rotaDestinoObj?.contrato_id

    // Identificar a rota de origem real caso não informada
    const efetivaOrigemId =
      origemRotaId || paradasRota.find((p) => p.escola_id === escolaId)?.rota_id

    // --- OPTIMISTIC UPDATE ---
    // Se a escola movida para fora da rota de origem tinha o caminhão nela, limpa a posição da rota de origem
    if (efetivaOrigemId && efetivaOrigemId !== destinoRotaId) {
      const origemRotaObj = rotasLogisticas.find((r) => r.id === efetivaOrigemId)
      if (origemRotaObj?.caminhao_escola_id === escolaId) {
        rotasService
          .atualizarPosicaoCaminhao(efetivaOrigemId, {
            caminhao_escola_id: null,
            caminhao_posicao_atual: null,
          })
          .catch((e) => console.warn('Erro ao limpar caminhão da rota de origem:', e))

        setRotasLogisticas((prev) =>
          prev.map((r) =>
            r.id === efetivaOrigemId
              ? { ...r, caminhao_escola_id: undefined, caminhao_posicao_atual: undefined }
              : r,
          ),
        )
        setRotas((prev) =>
          prev.map((r) =>
            r.id === efetivaOrigemId
              ? { ...r, caminhao_escola_id: undefined, caminhao_posicao_atual: undefined }
              : r,
          ),
        )
      }
    }

    // 1. Atualizar paradas da rota de origem e da rota de destino
    if (efetivaOrigemId === destinoRotaId) {
      // Reordenação na mesma rota
      const paradasMesmaRota = paradasRota
        .filter((p) => p.rota_id === destinoRotaId)
        .sort((a, b) => a.ordem - b.ordem)

      const curIdx = paradasMesmaRota.findIndex((p) => p.escola_id === escolaId)
      if (curIdx !== -1 && targetOrdem !== undefined) {
        const [moved] = paradasMesmaRota.splice(curIdx, 1)
        const destIdx = Math.max(0, Math.min(paradasMesmaRota.length, targetOrdem - 1))
        paradasMesmaRota.splice(destIdx, 0, moved)

        const reordenadas = paradasMesmaRota.map((p, idx) => ({
          ...p,
          ordem: idx + 1,
        }))

        setParadasRota((prev) => [
          ...prev.filter((p) => p.rota_id !== destinoRotaId),
          ...reordenadas,
        ])
      }
    } else {
      // Mover entre rotas distintas
      // Paradas de origem restantes (sem a escola)
      const paradasOrigemRestantes = paradasRota
        .filter((p) => p.rota_id === efetivaOrigemId && p.escola_id !== escolaId)
        .sort((a, b) => a.ordem - b.ordem)
        .map((p, idx) => ({ ...p, ordem: idx + 1 }))

      // Paradas de destino (com a escola inserida)
      const paradasDestinoAtuais = paradasRota
        .filter((p) => p.rota_id === destinoRotaId && p.escola_id !== escolaId)
        .sort((a, b) => a.ordem - b.ordem)

      const novaParada: ParadaRotaRecord = {
        id: `temp-parada-${escolaId}-${destinoRotaId}`,
        rota_id: destinoRotaId,
        escola_id: escolaId,
        ordem: targetOrdem || paradasDestinoAtuais.length + 1,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      let insertIdx = paradasDestinoAtuais.length
      if (targetOrdem !== undefined && targetOrdem >= 1) {
        insertIdx = Math.max(0, Math.min(paradasDestinoAtuais.length, targetOrdem - 1))
      }
      paradasDestinoAtuais.splice(insertIdx, 0, novaParada)

      const paradasDestinoRenumeradas = paradasDestinoAtuais.map((p, idx) => ({
        ...p,
        ordem: idx + 1,
      }))

      setParadasRota((prev) => [
        ...prev.filter(
          (p) =>
            p.rota_id !== efetivaOrigemId &&
            p.rota_id !== destinoRotaId &&
            p.escola_id !== escolaId,
        ),
        ...paradasOrigemRestantes,
        ...paradasDestinoRenumeradas,
      ])
    }

    // 2. Atualizar pedidos pendentes da escola
    setOrders((prev) =>
      prev.map((o) => {
        if (o.schoolId === escolaId && o.status === 'Pendente') {
          return {
            ...o,
            rotaId: destinoRotaId,
            rotaNome: nomeRotaDestino,
            rotaLogisticaId: destinoRotaId,
            rotaLogisticaNome: nomeRotaDestino,
          }
        }
        return o
      }),
    )

    // 3. Atualizar contractSchools
    if (contratoId) {
      setContractSchools((prev) =>
        prev.map((ce) => {
          if (ce.contrato_id === contratoId && ce.escola_id === escolaId) {
            return { ...ce, rota_id: destinoRotaId }
          }
          return ce
        }),
      )

      // Atualizar também na lista de contratos
      setContracts((prev) =>
        prev.map((c) => {
          if (c.id !== contratoId) return c
          return {
            ...c,
            escolas: c.escolas.map((esc) => {
              if (esc.escolaId === escolaId) {
                return {
                  ...esc,
                  rotaLogisticaId: destinoRotaId,
                  rotaLogisticaNome: nomeRotaDestino,
                }
              }
              return esc
            }),
          }
        }),
      )
    }

    try {
      const res = await rotasLogisticasService.moverEscolaEntreRotas({
        escola_id: escolaId,
        origem_rota_id: efetivaOrigemId,
        destino_rota_id: destinoRotaId,
        target_ordem: targetOrdem,
      })

      if (res && res.success) {
        // Se o backend retornou as paradas salvas atualizadas, sincronizar o state
        if (res.paradas_destino || res.paradas_origem) {
          setParadasRota((prev) => {
            let next = prev.filter(
              (p) =>
                p.rota_id !== destinoRotaId &&
                (efetivaOrigemId ? p.rota_id !== efetivaOrigemId : true),
            )
            if (res.paradas_origem && res.paradas_origem.length > 0) {
              next = [...next, ...res.paradas_origem]
            }
            if (res.paradas_destino && res.paradas_destino.length > 0) {
              next = [...next, ...res.paradas_destino]
            }
            return next.sort((a, b) => a.ordem - b.ordem)
          })
        }
        return true
      }
      return false
    } catch (err: any) {
      console.error('Erro ao mover escola entre rotas:', err)
      // Rollback
      setParadasRota(prevParadas)
      setOrders(prevOrders)
      setContractSchools(prevContractSchools)
      setContracts(prevContracts)
      toast.error('Falha ao mover escola para outra rota.')
      return false
    }
  }

  const updateCicloContratoFase = async (
    cicloId: string,
    contratoId: string,
    fase: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado' | string,
  ): Promise<boolean> => {
    const existing = cicloContratos.find(
      (cc) => cc.ciclo_id === cicloId && cc.contrato_id === contratoId,
    )

    const prevCicloContratos = [...cicloContratos]
    const prevCiclos = [...ciclos]
    const prevActive = activeCiclo

    // Optimistic update
    let updatedCC: CicloContratoRecord[]
    if (existing) {
      updatedCC = prevCicloContratos.map((cc) => (cc.id === existing.id ? { ...cc, fase } : cc))
    } else {
      const tempCC: CicloContratoRecord = {
        id: `temp-cc-${Date.now()}`,
        ciclo_id: cicloId,
        contrato_id: contratoId,
        fase,
      }
      updatedCC = [tempCC, ...prevCicloContratos]
    }
    setCicloContratos(updatedCC)

    // Recalcular ciclo ativo
    const ordenados = [...ciclos].sort((a, b) => {
      const tA = new Date(a.created || a.data_inicio).getTime()
      const tB = new Date(b.created || b.data_inicio).getTime()
      return tB - tA
    })
    const cicloAtivo = ordenados.find((c) => {
      const vinculados = updatedCC.filter((cc) => cc.ciclo_id === c.id)
      if (vinculados.length === 0) {
        return c.status !== 'fechado' && c.status !== 'cancelado'
      }
      return vinculados.some((cc) => cc.fase !== 'fechado' && cc.fase !== 'cancelado')
    })
    setActiveCiclo(cicloAtivo || null)

    try {
      if (existing) {
        await cicloContratosService.setFase(existing.id, fase)
      } else {
        const created = await cicloContratosService.create({
          ciclo_id: cicloId,
          contrato_id: contratoId,
          fase,
        })
        setCicloContratos((prev) =>
          prev.map((cc) =>
            cc.ciclo_id === cicloId && cc.contrato_id === contratoId ? created : cc,
          ),
        )
      }
      toast.success(`Fase do contrato alterada para "${fase}" com sucesso!`)
      return true
    } catch (err: any) {
      console.error('Erro ao alterar fase do contrato no ciclo:', err)
      setCicloContratos(prevCicloContratos)
      setCiclos(prevCiclos)
      setActiveCiclo(prevActive)
      toast.error('Erro ao atualizar fase do contrato.')
      return false
    }
  }

  const updateCicloStatus = async (
    cicloId: string,
    status: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado' | string,
  ): Promise<boolean> => {
    // Altera a fase em todos os contratos vinculados a este ciclo
    const vinculados = cicloContratos.filter((cc) => cc.ciclo_id === cicloId)
    if (vinculados.length > 0) {
      try {
        await Promise.all(
          vinculados.map((cc) => updateCicloContratoFase(cicloId, cc.contrato_id, status)),
        )
        return true
      } catch (e) {
        return false
      }
    }

    const prevCiclos = [...ciclos]
    const prevActive = activeCiclo

    const updatedCiclos = prevCiclos.map((c) => (c.id === cicloId ? { ...c, status } : c))
    setCiclos(updatedCiclos)

    const naoTerminais = updatedCiclos.filter(
      (c) => c.status !== 'fechado' && c.status !== 'cancelado',
    )
    setActiveCiclo(naoTerminais[0] || null)

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

  const cancelarCicloContrato = async (
    cicloId: string,
    contratoId: string,
    motivo: string,
    cancelarPedidosJunto = false,
  ): Promise<boolean> => {
    const existingCC = cicloContratos.find(
      (cc) => cc.ciclo_id === cicloId && cc.contrato_id === contratoId,
    )
    const targetCiclo = ciclos.find((c) => c.id === cicloId)
    const targetContrato = contracts.find((c) => c.id === contratoId)

    if (existingCC?.fase === 'fechado') {
      toast.error(
        'Contrato em ciclo fechado não pode ser cancelado (o caminho é o ciclo seguinte).',
      )
      return false
    }

    if (existingCC?.fase === 'cancelado') {
      toast.info('Este contrato já está cancelado neste ciclo.')
      return true
    }

    const cleanMotivo = motivo.trim()
    if (!cleanMotivo) {
      toast.error('Informe obrigatoriamente o motivo do cancelamento.')
      return false
    }

    // Proteção: checar atestos emitidos vinculados às escolas deste contrato neste ciclo
    const contratoEscolaIds = new Set(
      contractSchools.filter((cs) => cs.contrato_id === contratoId).map((cs) => cs.escola_id),
    )
    const pedidosDoContratoNoCiclo = orders.filter(
      (o) => o.cicloId === cicloId && contratoEscolaIds.has(o.schoolId),
    )
    const pedidoIds = new Set(pedidosDoContratoNoCiclo.map((o) => o.id))
    const atestosEmitidos = atestos.filter((a) => pedidoIds.has(a.orderId))

    if (atestosEmitidos.length > 0) {
      toast.error(
        'Este contrato possui atestos emitidos neste ciclo — já houve entrega formalizada. O caminho é FECHAR a fase do contrato, não cancelá-lo.',
      )
      return false
    }

    const nowIso = new Date().toISOString()
    const prevCC = [...cicloContratos]
    const prevOrders = [...orders]
    const prevActive = activeCiclo

    // Optimistic CC
    let updatedCC: CicloContratoRecord[]
    if (existingCC) {
      updatedCC = prevCC.map((cc) =>
        cc.id === existingCC.id
          ? {
              ...cc,
              fase: 'cancelado',
              motivo_cancelamento: cleanMotivo,
              data_cancelamento: nowIso,
            }
          : cc,
      )
    } else {
      updatedCC = [
        {
          id: `temp-cc-${Date.now()}`,
          ciclo_id: cicloId,
          contrato_id: contratoId,
          fase: 'cancelado',
          motivo_cancelamento: cleanMotivo,
          data_cancelamento: nowIso,
        },
        ...prevCC,
      ]
    }
    setCicloContratos(updatedCC)

    // Cancelar pedidos do contrato se solicitado
    if (cancelarPedidosJunto && pedidosDoContratoNoCiclo.length > 0) {
      setOrders((prev) =>
        prev.map((o) =>
          o.cicloId === cicloId && contratoEscolaIds.has(o.schoolId) && o.status !== 'Cancelado'
            ? {
                ...o,
                status: 'Cancelado',
                motivo_cancelamento: cleanMotivo,
                cancelado_em: nowIso,
              }
            : o,
        ),
      )
    }

    // Recalcular ciclo ativo
    const ordenados = [...ciclos].sort((a, b) => {
      const tA = new Date(a.created || a.data_inicio).getTime()
      const tB = new Date(b.created || b.data_inicio).getTime()
      return tB - tA
    })
    const cicloAtivo = ordenados.find((c) => {
      const vinculados = updatedCC.filter((cc) => cc.ciclo_id === c.id)
      if (vinculados.length === 0) {
        return c.status !== 'fechado' && c.status !== 'cancelado'
      }
      return vinculados.some((cc) => cc.fase !== 'fechado' && cc.fase !== 'cancelado')
    })
    setActiveCiclo(cicloAtivo || null)

    try {
      if (existingCC) {
        await cicloContratosService.cancelar(existingCC.id, cleanMotivo)
      } else {
        const created = await cicloContratosService.create({
          ciclo_id: cicloId,
          contrato_id: contratoId,
          fase: 'cancelado',
          motivo_cancelamento: cleanMotivo,
          data_cancelamento: nowIso,
        })
        setCicloContratos((prev) =>
          prev.map((cc) =>
            cc.ciclo_id === cicloId && cc.contrato_id === contratoId ? created : cc,
          ),
        )
      }

      if (cancelarPedidosJunto && pedidosDoContratoNoCiclo.length > 0) {
        const pedidosNaoCancelados = pedidosDoContratoNoCiclo.filter(
          (o) => o.status !== 'Cancelado',
        )
        await Promise.all(
          pedidosNaoCancelados.map((p) =>
            pedidosService.updateStatus(p.id, 'Cancelado', {
              motivo_cancelamento: cleanMotivo,
              cancelado_em: nowIso,
            }),
          ),
        )
      }

      toast.success(`Contrato ${targetContrato?.numero || ''} cancelado no ciclo com sucesso.`)
      return true
    } catch (err: any) {
      console.error('Erro ao cancelar contrato no ciclo:', err)
      setCicloContratos(prevCC)
      setOrders(prevOrders)
      setActiveCiclo(prevActive)
      toast.error('Falha ao cancelar contrato no banco.')
      return false
    }
  }

  const cancelarCiclo = async (
    cicloId: string,
    motivo: string,
    cancelarPedidosJunto = false,
  ): Promise<boolean> => {
    const targetCiclo = ciclos.find((c) => c.id === cicloId)
    if (!targetCiclo) {
      toast.error('Ciclo não encontrado.')
      return false
    }

    const cleanMotivo = motivo.trim()
    if (!cleanMotivo) {
      toast.error('Informe obrigatoriamente o motivo do cancelamento.')
      return false
    }

    const vinculados = cicloContratos.filter((cc) => cc.ciclo_id === cicloId)
    const statusDerivado = derivarStatusCiclo(cicloId, cicloContratos, targetCiclo.status)

    // Proteção 1: Ciclo Fechado não pode ser cancelado
    if (statusDerivado === 'fechado' || targetCiclo.status === 'fechado') {
      toast.error('Ciclo fechado não pode ser cancelado (o caminho é o ciclo seguinte).')
      return false
    }

    // Proteção 2: Ciclo já Cancelado
    if (statusDerivado === 'cancelado' && targetCiclo.status === 'cancelado') {
      toast.info('Este ciclo já está cancelado.')
      return true
    }

    // Proteção 3: Bloqueio por atestos emitidos no ciclo inteiro
    const pedidosDoCiclo = orders.filter((o) => o.cicloId === cicloId)
    const pedidoIdsCiclo = new Set(pedidosDoCiclo.map((o) => o.id))
    const atestosEmitidos = atestos.filter((a) => pedidoIdsCiclo.has(a.orderId))

    if (atestosEmitidos.length > 0) {
      toast.error(
        'Este ciclo possui atestos emitidos — já houve entrega formalizada. O caminho é FECHAR o ciclo, não cancelá-lo.',
      )
      return false
    }

    const nowIso = new Date().toISOString()
    const prevCiclos = [...ciclos]
    const prevCC = [...cicloContratos]
    const prevOrders = [...orders]
    const prevActive = activeCiclo

    // Atualização otimista do ciclo
    const updatedCiclos = prevCiclos.map((c) =>
      c.id === cicloId
        ? {
            ...c,
            status: 'cancelado',
            motivo_cancelamento: cleanMotivo,
            data_cancelamento: nowIso,
          }
        : c,
    )
    setCiclos(updatedCiclos)

    // Atualização otimista dos contratos do ciclo (todos os não terminais para 'cancelado')
    let updatedCC = prevCC
    if (vinculados.length > 0) {
      updatedCC = prevCC.map((cc) =>
        cc.ciclo_id === cicloId && cc.fase !== 'fechado'
          ? {
              ...cc,
              fase: 'cancelado',
              motivo_cancelamento: cleanMotivo,
              data_cancelamento: nowIso,
            }
          : cc,
      )
      setCicloContratos(updatedCC)
    }

    // Atualização otimista de pedidos cancelados
    if (cancelarPedidosJunto && pedidosDoCiclo.length > 0) {
      setOrders((prev) =>
        prev.map((o) =>
          o.cicloId === cicloId && o.status !== 'Cancelado'
            ? {
                ...o,
                status: 'Cancelado',
                motivo_cancelamento: cleanMotivo,
                cancelado_em: nowIso,
              }
            : o,
        ),
      )
    }

    // Recalcular ciclo ativo usando getCicloAtivo
    const novoAtivo = getCicloAtivo(updatedCiclos, updatedCC)
    setActiveCiclo(novoAtivo)

    try {
      // 1. Cancelar registros de ciclo_contratos vinculados no PocketBase
      for (const cc of vinculados) {
        if (cc.fase !== 'cancelado' && cc.fase !== 'fechado') {
          await cicloContratosService.cancelar(cc.id, cleanMotivo)
        }
      }

      // 2. Cancelar o registro do ciclo no PocketBase
      await ciclosService.cancelar(cicloId, cleanMotivo)

      // 3. Se solicitado, cancelar pedidos em aberto no PocketBase
      if (cancelarPedidosJunto && pedidosDoCiclo.length > 0) {
        const pedidosNaoCancelados = pedidosDoCiclo.filter((o) => o.status !== 'Cancelado')
        await Promise.all(
          pedidosNaoCancelados.map((p) =>
            pedidosService.updateStatus(p.id, 'Cancelado', {
              motivo_cancelamento: cleanMotivo,
              cancelado_em: nowIso,
            }),
          ),
        )
      }

      toast.success(`Ciclo "${targetCiclo.nome}" cancelado com sucesso.`)
      return true
    } catch (err: any) {
      console.error('Erro ao cancelar ciclo:', err)
      setCiclos(prevCiclos)
      setCicloContratos(prevCC)
      setOrders(prevOrders)
      setActiveCiclo(prevActive)
      toast.error('Falha ao cancelar ciclo no banco.')
      return false
    }
  }

  const createCiclo = async (data: {
    nome: string
    chamada_id?: string
    data_inicio: string
    data_fim: string
    data_despacho?: string
    status?: 'coletando' | 'correcao' | 'coleta_encerrada' | 'coletado' | 'fechado' | string
    snapshot?: any
    contratoIds?: string[]
  }): Promise<CicloRecord | null> => {
    const tempId = `temp-ciclo-${Date.now()}`
    const initialStatus = data.status || 'coletando'
    const targetChamada = chamadas.find((c) => c.id === data.chamada_id)
    const tempCiclo: CicloRecord = {
      id: tempId,
      nome: data.nome,
      chamada_id: data.chamada_id,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim,
      data_despacho: data.data_despacho,
      status: initialStatus,
      snapshot: data.snapshot,
      expand: targetChamada ? { chamada_id: targetChamada } : undefined,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    }

    const prevCiclos = [...ciclos]
    const prevCC = [...cicloContratos]
    const newCiclos = [tempCiclo, ...prevCiclos]
    setCiclos(newCiclos)

    if (initialStatus !== 'fechado' && initialStatus !== 'cancelado') {
      setActiveCiclo(tempCiclo)
    }

    try {
      const created = await ciclosService.create({
        nome: data.nome,
        chamada_id: data.chamada_id,
        data_inicio: data.data_inicio,
        data_fim: data.data_fim,
        data_despacho: data.data_despacho,
        status: initialStatus,
        snapshot: data.snapshot,
      })

      // Determinar quais contratos vincular: se passados data.contratoIds, usar eles;
      // senão vincular contratos Ativos da chamada do ciclo (se informada) ou todos os Ativos
      const idsParaVincular =
        data.contratoIds && data.contratoIds.length > 0
          ? data.contratoIds
          : contracts
              .filter(
                (c) =>
                  c.status === 'Ativo' && (!data.chamada_id || c.chamada_id === data.chamada_id),
              )
              .map((c) => c.id)

      const novosCC: CicloContratoRecord[] = []
      for (const cId of idsParaVincular) {
        try {
          const cc = await cicloContratosService.create({
            ciclo_id: created.id,
            contrato_id: cId,
            fase: initialStatus,
          })
          novosCC.push(cc)
        } catch (ccErr) {
          console.error(`Erro ao vincular contrato ${cId} ao ciclo:`, ccErr)
        }
      }

      setCicloContratos((prev) => [...novosCC, ...prev])

      setCiclos((prev) => {
        const alreadyHasCreated = prev.some((c) => c.id === created.id)
        if (alreadyHasCreated) {
          return prev.filter((c) => c.id !== tempId)
        }
        return prev.map((c) => (c.id === tempId ? created : c))
      })

      if (initialStatus !== 'fechado' && initialStatus !== 'cancelado') {
        setActiveCiclo(created)
      }
      toast.success(`Ciclo ${data.nome} criado com sucesso!`)
      return created
    } catch (err: any) {
      console.error('Erro ao criar ciclo:', err)
      setCiclos(prevCiclos)
      setCicloContratos(prevCC)
      const ordenados = [...prevCiclos].sort((a, b) => {
        const tA = new Date(a.created || a.data_inicio).getTime()
        const tB = new Date(b.created || b.data_inicio).getTime()
        return tB - tA
      })
      const cicloAtivo = ordenados.find((c) => {
        const vinculados = prevCC.filter((cc) => cc.ciclo_id === c.id)
        if (vinculados.length === 0) {
          return c.status !== 'fechado' && c.status !== 'cancelado'
        }
        return vinculados.some((cc) => cc.fase !== 'fechado' && cc.fase !== 'cancelado')
      })
      setActiveCiclo(cicloAtivo || null)
      toast.error('Falha ao criar novo ciclo.')
      return null
    }
  }

  const updateOrderItemsAndDate = async (
    orderId: string,
    items: Array<{ productId: string; quantity: number }>,
    orderDate?: string,
  ): Promise<boolean> => {
    const targetOrder = orders.find((o) => o.id === orderId)
    if (!targetOrder) {
      toast.error('Pedido não encontrado.')
      return false
    }

    if (targetOrder.status === 'Em Rota' || targetOrder.status === 'Entregue') {
      toast.error('Pedidos em rota ou entregues não podem ser alterados.')
      return false
    }

    if (targetOrder.status === 'Cancelado') {
      toast.error('Pedidos cancelados não podem ser editados.')
      return false
    }

    const validItems = items.filter((it) => it.quantity > 0)
    if (validItems.length === 0) {
      toast.error('O pedido precisa conter ao menos um item com quantidade positiva.')
      return false
    }

    const formattedPayloadItems = validItems.map((it) => {
      const prod = products.find((p) => p.id === it.productId)
      return {
        produto_id: it.productId,
        quantidade: it.quantity,
        preco_unitario: prod?.price || 0,
      }
    })

    const prevOrders = [...orders]

    // Optimistic
    let newTotal = 0
    const newItems = validItems.map((it) => {
      const prod = products.find((p) => p.id === it.productId)
      const preco = prod?.price || 0
      newTotal += preco * it.quantity
      return {
        id: `it-${it.productId}`,
        productId: it.productId,
        name: prod?.name || 'Produto',
        quantity: it.quantity,
        price: preco,
      }
    })

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              date: orderDate || o.date,
              items: newItems,
              total: Math.round(newTotal * 100) / 100,
            }
          : o,
      ),
    )

    try {
      await pedidosService.updateOrderAndItems(orderId, {
        data_prevista: orderDate ? `${orderDate} 12:00:00.000Z` : undefined,
        items: formattedPayloadItems,
      })
      toast.success('Pedido atualizado com sucesso!')
      return true
    } catch (err: any) {
      console.error('Erro ao atualizar pedido:', err)
      setOrders(prevOrders)
      toast.error('Falha ao atualizar pedido.')
      return false
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
        chamadas,
        chamadaItems,
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
        atualizarPosicaoCaminhaoRota,
        excluirRotaLogistica,
        sincronizarEscolasRotaLogistica,
        despacharRotaInteira,
        confirmarEntregaRotaInteira,
        marcarNaoEntreguePedido,
        atribuirPedidosARotaLogistica,
        salvarSequenciamentoParadas,
        moverEscolaEntreRotas,
        updateCicloStatus,
        createCiclo,
        cicloContratos,
        updateCicloContratoFase,
        cancelarCicloContrato,
        cancelarCiclo,
        updateOrderItemsAndDate,
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
