import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import type {
  TokenFormularioRecord,
  EscolaRecord,
  ContratoRecord,
  CicloRecord,
  CicloContratoRecord,
  ContratoItemRecord,
  ProdutoRecord,
  PedidoRecord,
  DisponibilidadeProduto,
} from '@/lib/types'
import { tokensFormularioService } from '@/services/tokens-formulario'
import { pedidosService } from '@/services/pedidos'
import {
  calcularCicloSemanal,
  formatDespachoAmigavel,
  formatIntervaloCiclo,
  getDespachoEfetivoCiclo,
} from '@/lib/cicloUtils'
import {
  formatQuantityOneDecimal,
  validateQuantityStepHalf,
  normalizeDecimalTyping,
  formatQuantityOnBlur,
} from '@/lib/decimalUtils'
import { buildComprovanteProtocoloTexto } from '@/lib/whatsapp'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  FileSpreadsheet,
  Clock,
  Send,
  AlertCircle,
  Copy,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'

interface FormItem {
  contratoItemId: string
  produtoId: string
  nomeContrato: string
  apelidos?: string
  produtoMestreNome: string
  unidade: string
  precoUnitario: number
  disponibilidade: DisponibilidadeProduto
  quantidade: string
  bloqueado: boolean
}

export default function SchoolOrderForm() {
  const { token } = useParams<{ token: string }>()

  // Estado de carregamento inicial
  const [loading, setLoading] = useState(true)
  const [errorState, setErrorState] = useState<string | null>(null)

  // Entidades carregadas
  const [tokenRecord, setTokenRecord] = useState<TokenFormularioRecord | null>(null)
  const [escola, setEscola] = useState<EscolaRecord | null>(null)
  const [contrato, setContrato] = useState<ContratoRecord | null>(null)
  const [ciclo, setCiclo] = useState<CicloRecord | null>(null)
  const [cicloContrato, setCicloContrato] = useState<CicloContratoRecord | null>(null)
  const [formItems, setFormItems] = useState<FormItem[]>([])

  // Pedido anterior existente no ciclo (se houver)
  const [existingOrder, setExistingOrder] = useState<PedidoRecord | null>(null)

  // Submissão e confirmação
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedOrder, setSubmittedOrder] = useState<{
    numero: string
    protocolo: string
    itens: Array<{ nome: string; quantidade: number; unidade: string }>
    dataDespacho: string
  } | null>(null)

  // Carregar dados pelo token
  useEffect(() => {
    let isMounted = true

    async function loadFormData() {
      if (!token) {
        setErrorState('Token do formulário não fornecido.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setErrorState(null)

        const tokenRec = await tokensFormularioService.getByToken(token)
        if (!tokenRec) {
          setErrorState(
            'Formulário não encontrado ou link inválido. Solicite um novo link à cooperativa.',
          )
          setLoading(false)
          return
        }

        // Validação de token ativo e expiração
        if (tokenRec.ativo === false) {
          setErrorState('Este formulário foi desativado. Aguarde o próximo ciclo.')
          setLoading(false)
          return
        }

        if (tokenRec.expira_em) {
          const expiraDate = new Date(tokenRec.expira_em)
          if (new Date() > expiraDate) {
            setErrorState('Este link expirou. Aguarde o próximo aviso da cooperativa.')
            setLoading(false)
            return
          }
        }

        setTokenRecord(tokenRec)

        // Carregar Escola
        const escolaRec = await pb.collection('escolas').getOne<EscolaRecord>(tokenRec.escola_id)
        setEscola(escolaRec)

        // Carregar Operação
        const contratoRec = await pb
          .collection('operacoes')
          .getOne<ContratoRecord>(tokenRec.contrato_id)
        setContrato(contratoRec)

        // Carregar Ciclo
        const cicloRec = await pb.collection('ciclos').getOne<CicloRecord>(tokenRec.ciclo_id)
        setCiclo(cicloRec)

        // Carregar CicloContrato para validar fase
        const cicloContratosList = await pb
          .collection('ciclo_contratos')
          .getList<CicloContratoRecord>(1, 1, {
            filter: `ciclo_id = "${tokenRec.ciclo_id}" && contrato_id = "${tokenRec.contrato_id}"`,
          })
        const ccRec = cicloContratosList.items[0] || null
        setCicloContrato(ccRec)

        // Carregar itens do contrato com expand do produto mestre
        const contratoItens = await pb
          .collection('contrato_itens')
          .getFullList<ContratoItemRecord>({
            filter: `contrato_id = "${tokenRec.contrato_id}"`,
            expand: 'produto_id',
            sort: 'nome_contrato',
          })

        // Carregar todos os produtos para caso expand não venha completo
        const produtosList = await pb.collection('produtos').getFullList<ProdutoRecord>()
        const produtosMap = new Map(produtosList.map((p) => [p.id, p]))

        // Verificar pedido anterior da escola no ciclo com origem 'formulario' (R24)
        const pastOrders = await pb.collection('pedidos').getList<PedidoRecord>(1, 10, {
          filter: `escola_id = "${tokenRec.escola_id}" && ciclo_id = "${tokenRec.ciclo_id}" && origem = "formulario" && status != "Cancelado"`,
          sort: '-created',
        })
        const lastOrder = pastOrders.items[0] || null
        setExistingOrder(lastOrder)

        // Carregar itens do último pedido válido para pré-preenchimento (se houver reenvio)
        const pastItemsMap = new Map<string, number>()
        if (lastOrder) {
          try {
            const lastOrderItems = await pedidosService.getItemsByPedidoId(lastOrder.id)
            for (const pi of lastOrderItems) {
              if (pi.produto_id && typeof pi.quantidade === 'number' && pi.quantidade > 0) {
                pastItemsMap.set(pi.produto_id, pi.quantidade)
              }
            }
          } catch (itemsLoadErr) {
            console.warn(
              'Não foi possível carregar itens do pedido anterior para pré-preenchimento:',
              itemsLoadErr,
            )
          }
        }

        // Montar os itens com indicação de disponibilidade, bloqueio e pré-preenchimento
        const items: FormItem[] = contratoItens.map((ci) => {
          const prod =
            produtosMap.get(ci.produto_id) || (ci.expand?.produto_id as ProdutoRecord | undefined)
          const rawDisp = (prod?.disponibilidade as any) || 'normal'
          const dispNorm: DisponibilidadeProduto = rawDisp === 'abundancia' ? 'abundante' : rawDisp
          const bloqueado = dispNorm === 'escassez' || dispNorm === 'indisponivel'

          // Pré-preencher com a quantidade do último pedido caso exista e não esteja bloqueado
          const prevQtd = pastItemsMap.get(ci.produto_id)
          const initialQtd =
            !bloqueado && prevQtd !== undefined && prevQtd > 0
              ? formatQuantityOneDecimal(prevQtd)
              : ''

          return {
            contratoItemId: ci.id,
            produtoId: ci.produto_id,
            nomeContrato: ci.nome_contrato,
            apelidos: ci.apelidos || '',
            produtoMestreNome: prod?.nome || ci.nome_contrato,
            unidade: prod?.unidade || 'kg',
            precoUnitario: ci.preco || prod?.preco_unitario || 0,
            disponibilidade: dispNorm,
            quantidade: initialQtd,
            bloqueado,
          }
        })

        if (isMounted) {
          setFormItems(items)
        }
      } catch (err: any) {
        console.error('Erro ao carregar dados do formulário:', err)
        if (isMounted) {
          setErrorState('Erro ao carregar o formulário. Verifique sua conexão e tente novamente.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadFormData()

    return () => {
      isMounted = false
    }
  }, [token])

  // Informações de datas calculadas do ciclo
  const cicloInfo = useMemo(() => {
    if (!ciclo) return null
    return calcularCicloSemanal(ciclo.data_inicio)
  }, [ciclo])

  // Despacho previsto (segunda-feira da entrega):
  // Utiliza getDespachoEfetivoCiclo para priorizar o snapshot do ciclo ou calcular confiavelmente
  const dataDespachoDate = useMemo(() => {
    if (!ciclo) return null
    return getDespachoEfetivoCiclo(ciclo)
  }, [ciclo])

  const dataDespachoFormatada = useMemo(() => {
    if (dataDespachoDate) {
      return formatDespachoAmigavel(dataDespachoDate, true)
    }
    if (cicloInfo) {
      return formatDespachoAmigavel(cicloInfo.segundaDespacho, true)
    }
    return 'Próxima segunda-feira'
  }, [dataDespachoDate, cicloInfo])

  // Status da fase do contrato no ciclo
  // Cadeia: coletando -> correcao -> coleta_encerrada -> fechado (+ cancelado)
  const faseAtual = cicloContrato?.fase || ciclo?.status || 'coletando'
  const faseNorm = (faseAtual || '').trim().toLowerCase()

  // NOVA REGRA DE JANELAS DE ENVIO (Decisão do Bill):
  // - PRIMEIRO envio do pedido da escola no ciclo (escola ainda NÃO tem pedido com origem=formulario no ciclo):
  //   aceito SOMENTE com a fase do contrato = "coletando".
  // - REENVIOS (submissões seguintes da mesma escola no ciclo, quando ela JÁ tem pedido com origem=formulario no ciclo):
  //   aceitos a partir da fase "correcao" e até o fechamento da coleta — ou seja, em "coletando", "correcao" e "coleta_encerrada".
  // - FORA dessas janelas (fase "fechado" ou "cancelado"): bloqueia envio com o aviso obrigatório.
  const isFechadoOuCancelado = faseNorm === 'fechado' || faseNorm === 'cancelado'
  const isColetaEncerrada =
    faseNorm === 'coleta_encerrada' || faseNorm === 'coletado' || faseNorm === 'coleta encerrada'
  const isCorrecao = faseNorm === 'correcao'
  const isColetando = faseNorm === 'coletando'

  // Tem pedido com origem 'formulario' no ciclo?
  const hasExistingFormOrder = !!existingOrder

  // Permissão de envio:
  // Se tem pedido anterior (reenvio): permitido em coletando, correcao e coleta_encerrada.
  // Se não tem pedido anterior (primeiro envio): permitido SOMENTE em coletando.
  const canSend =
    !isFechadoOuCancelado &&
    (hasExistingFormOrder ? isColetando || isCorrecao || isColetaEncerrada : isColetando)

  // Escola sem pedido que acessou fora de 'coletando' (em correcao ou coleta_encerrada)
  const isPrazoPrimeiroEnvioExpirado =
    !hasExistingFormOrder && !isFechadoOuCancelado && (isCorrecao || isColetaEncerrada)

  // Caso extremo: todos os produtos em escassez ou indisponíveis
  const todosBloqueados = useMemo(() => {
    if (formItems.length === 0) return false
    return formItems.every((it) => it.bloqueado)
  }, [formItems])

  // Validação ao vivo dos itens com regra de decimais (,0 e ,5)
  const validacao = useMemo(() => {
    const preenchidos: Array<{ item: FormItem; numVal: number }> = []
    const errosPorItem: Record<string, string> = {}

    formItems.forEach((it) => {
      if (it.bloqueado) return
      const trimmed = it.quantidade.trim()
      if (!trimmed) return

      const res = validateQuantityStepHalf(trimmed)
      if (!res.isValid) {
        errosPorItem[it.contratoItemId] =
          res.error || 'Valor inválido. Use múltiplos de 0,5 (ex: 2,0 ou 2,5)'
      } else {
        preenchidos.push({ item: it, numVal: res.numericValue })
      }
    })

    const valido = preenchidos.length > 0 && Object.keys(errosPorItem).length === 0

    return {
      valido,
      totalItens: preenchidos.length,
      errosPorItem,
      mensagemGeral:
        preenchidos.length === 0
          ? 'Preencha a quantidade de pelo menos um produto disponível (em múltiplos de 0,5).'
          : Object.keys(errosPorItem).length > 0
            ? 'Corrija os valores com partes decimais inválidas (apenas ,0 ou ,5).'
            : null,
    }
  }, [formItems])

  // Atualizar quantidade de um item digitando com normalização pt-BR
  const handleQuantityChange = (contratoItemId: string, rawVal: string) => {
    const normalized = normalizeDecimalTyping(rawVal)
    setFormItems((prev) =>
      prev.map((it) =>
        it.contratoItemId === contratoItemId ? { ...it, quantidade: normalized } : it,
      ),
    )
  }

  // Ao perder o foco, formatar com 1 casa decimal (ex: "5" -> "5,0")
  const handleQuantityBlur = (contratoItemId: string) => {
    setFormItems((prev) =>
      prev.map((it) => {
        if (it.contratoItemId !== contratoItemId) return it
        const formatted = formatQuantityOnBlur(it.quantidade)
        return { ...it, quantidade: formatted }
      }),
    )
  }

  // Submissão do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canSend) {
      toast.error('O ciclo não está mais aceitando envios de pedidos.')
      return
    }

    if (todosBloqueados) {
      toast.error('Nenhum produto disponível para pedido neste ciclo.')
      return
    }

    if (!validacao.valido) {
      toast.error(validacao.mensagemGeral || 'Verifique os dados do pedido.')
      return
    }

    if (!tokenRecord || !escola || !ciclo || !contrato) {
      toast.error('Dados incompletos para envio.')
      return
    }

    setIsSubmitting(true)

    try {
      // 1. Filtrar itens válidos com quantidade > 0 e não bloqueados
      const itensParaEnviar = formItems
        .filter((it) => !it.bloqueado && it.quantidade.trim() !== '')
        .map((it) => {
          const res = validateQuantityStepHalf(it.quantidade)
          if (!res.isValid) {
            throw new Error(`Item ${it.nomeContrato} com quantidade inválida: ${res.error}`)
          }
          return {
            produto_id: it.produtoId,
            quantidade: res.numericValue,
            preco_unitario: it.precoUnitario,
            nome: it.nomeContrato,
            unidade: it.unidade,
          }
        })

      // 2. Se for reenvio (já existia pedido da escola neste ciclo):
      // o ÚLTIMO envio da escola no ciclo é o válido e os anteriores ficam marcados como substituídos
      const previousOrders = await pb.collection('pedidos').getFullList<PedidoRecord>({
        filter: `escola_id = "${escola.id}" && ciclo_id = "${ciclo.id}" && status != "Cancelado"`,
      })

      for (const oldOrder of previousOrders) {
        try {
          await pb.collection('pedidos').update(oldOrder.id, {
            status: 'Cancelado',
            motivo_cancelamento: 'Substituído por novo envio via formulário pela escola',
            cancelado_em: new Date().toISOString(),
          })
        } catch (subErr) {
          console.warn('Erro ao substituir pedido anterior:', subErr)
        }
      }

      // 3. Gerar número de protocolo citável (ex: FOR-38-0014)
      const cicloNum =
        cicloInfo?.numeroSemana || parseInt((ciclo.nome || '').replace(/\D/g, ''), 10) || 1
      // Contar pedidos já existentes no ciclo para sequencial limpo
      const totalPedidosCiclo = await pb.collection('pedidos').getList(1, 1, {
        filter: `ciclo_id = "${ciclo.id}"`,
      })
      const seq = String(totalPedidosCiclo.totalItems + 1).padStart(4, '0')
      const protocoloCitavel = `FOR-${cicloNum}-${seq}`

      // 4. Buscar rota da escola para vínculo correto DO CONTRATO DESTE TOKEN
      const contractSchool = await pb
        .collection('contrato_escolas')
        .getFirstListItem(
          `escola_id = "${escola.id}" && contrato_id = "${tokenRecord.contrato_id}"`,
        )
        .catch(async () => {
          // Fallback para qualquer rota da escola se não encontrar específica do contrato
          return await pb
            .collection('contrato_escolas')
            .getFirstListItem(`escola_id = "${escola.id}"`)
            .catch(() => null)
        })
      const rotaId = contractSchool?.rota_id || ''

      const dataPrevistaIso = dataDespachoDate
        ? dataDespachoDate.toISOString()
        : cicloInfo
          ? cicloInfo.segundaDespacho.toISOString()
          : new Date(ciclo.data_fim).toISOString()

      // 5. Criar novo pedido com origem = 'formulario'
      const createdOrder = await pedidosService.create({
        numero: protocoloCitavel,
        escola_id: escola.id,
        ciclo_id: ciclo.id,
        origem: 'formulario',
        rota_id: rotaId,
        validacao: {
          status: 'validado',
          motivo: 'Enviado diretamente pela escola via Formulário Online',
          detalhes: [`${itensParaEnviar.length} item(ns) solicitados`],
        },
        data_prevista: dataPrevistaIso,
        status: 'Pendente',
        itens: itensParaEnviar.map((i) => ({
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        })),
      })

      // Exibir tela de confirmação visual
      setSubmittedOrder({
        numero: createdOrder.numero,
        protocolo: protocoloCitavel,
        itens: itensParaEnviar.map((i) => ({
          nome: i.nome,
          quantidade: i.quantidade,
          unidade: i.unidade,
        })),
        dataDespacho: dataDespachoFormatada,
      })

      toast.success('Pedido enviado com sucesso!')
    } catch (err: any) {
      console.error('Erro ao enviar pedido via formulário:', err)
      toast.error('Falha ao registrar pedido. Tente novamente ou contate a cooperativa.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // BADGE DE DISPONIBILIDADE
  const renderDisponibilidadeBadge = (disp: DisponibilidadeProduto) => {
    switch (disp) {
      case 'abundante':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold">
            Abundante
          </Badge>
        )
      case 'escassez':
        return (
          <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold">
            Escassez (bloqueado)
          </Badge>
        )
      case 'indisponivel':
        return (
          <Badge variant="destructive" className="text-[11px] font-semibold">
            Indisponível
          </Badge>
        )
      case 'normal':
      default:
        return (
          <Badge variant="outline" className="text-[11px] font-medium">
            Normal
          </Badge>
        )
    }
  }

  // TELA DE ERRO / TOKEN INVÁLIDO
  if (errorState) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-red-200 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <CardTitle className="text-xl text-red-700">Formulário Indisponível</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-slate-600">{errorState}</p>
            <div className="pt-2">
              <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // TELA DE CARREGAMENTO
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">
            Carregando formulário da escola...
          </p>
        </div>
      </div>
    )
  }

  // PARTE 3 — CONFIRMAÇÃO VISUAL (decisão do Bill)
  if (submittedOrder) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4 flex justify-center">
        <div className="max-w-xl w-full space-y-6">
          <Card className="border-emerald-200 shadow-lg overflow-hidden">
            <div className="bg-emerald-600 text-white p-6 text-center">
              <CheckCircle2 className="w-14 h-14 mx-auto mb-2 text-white" />
              <h1 className="text-2xl font-bold">Pedido Enviado com Sucesso!</h1>
              <p className="text-emerald-100 text-sm mt-1">{escola?.nome}</p>
            </div>

            <CardContent className="p-6 space-y-6">
              {/* NÚMERO DE PROTOCOLO EM DESTAQUE */}
              <div className="bg-slate-100 border-2 border-slate-300 rounded-lg p-5 text-center space-y-2">
                <span className="text-xs uppercase tracking-wider text-slate-500 font-bold block">
                  Número de Protocolo
                </span>
                <span className="text-3xl sm:text-4xl font-mono font-extrabold text-slate-900 tracking-wide select-all">
                  {submittedOrder.protocolo}
                </span>
                <p className="text-xs text-slate-600 font-medium">
                  Anote ou fotografe esta tela para guardar seu comprovante.
                </p>
              </div>

              {/* AVISO CLARO */}
              <Alert className="bg-blue-50 border-blue-200 text-blue-900">
                <AlertDescription className="text-xs leading-relaxed">
                  <strong>Guarde este número</strong> — ele identifica seu pedido perante a
                  cooperativa. Se você reenviar o formulário neste ciclo, o novo protocolo
                  substituirá o anterior.
                </AlertDescription>
              </Alert>

              {/* DATA DE ENTREGA PREVISTA */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border">
                <Calendar className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground block font-medium">
                    Previsão de Entrega (Despacho):
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {submittedOrder.dataDespacho}
                  </span>
                </div>
              </div>

              {/* LISTA DE PRODUTOS ENVIADOS */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">Itens Solicitados:</h3>
                <div className="border rounded divide-y max-h-60 overflow-y-auto bg-white">
                  {submittedOrder.itens.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 text-xs">
                      <span className="font-medium text-slate-800">{it.nome}</span>
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {it.quantidade} {it.unidade}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 text-xs gap-1"
                  onClick={() => {
                    const textoCompleto = buildComprovanteProtocoloTexto({
                      schoolName: escola?.nome || 'Escola',
                      protocolo: submittedOrder.protocolo,
                      cicloNome: ciclo?.nome,
                      dataEntrega: submittedOrder.dataDespacho,
                      itens: submittedOrder.itens.map((it) => ({
                        nome: it.nome,
                        quantidade: formatQuantityOneDecimal(it.quantidade),
                        unidade: it.unidade,
                      })),
                    })
                    navigator.clipboard.writeText(textoCompleto)
                    toast.success('Comprovante completo do protocolo copiado!')
                  }}
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar Protocolo
                </Button>
                {canSend && (
                  <Button
                    variant="ghost"
                    className="flex-1 text-xs gap-1"
                    onClick={() => {
                      setSubmittedOrder(null)
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reenviar / Editar Pedido
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // FORMULÁRIO PRINCIPAL
  return (
    <div className="min-h-screen bg-slate-50 py-6 px-3 sm:px-6 flex justify-center">
      <div className="max-w-2xl w-full space-y-4">
        {/* CABEÇALHO */}
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-primary text-primary-foreground p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80 block">
                  Formulário de Pedido Semanal
                </span>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-1 flex items-center gap-2">
                  <Building2 className="w-6 h-6 shrink-0" />
                  {escola?.nome}
                </h1>
              </div>
              <Badge variant="secondary" className="font-mono text-xs shrink-0">
                {contrato?.numero}
              </Badge>
            </div>
          </div>

          <CardContent className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white border-b">
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <div>
                <span className="text-muted-foreground block text-[11px]">Ciclo Ativo:</span>
                <span className="font-semibold text-slate-900">
                  {ciclo?.nome || 'Ciclo Semanal'}{' '}
                  {ciclo && (
                    <span className="text-muted-foreground font-normal">
                      ({formatIntervaloCiclo(ciclo.data_inicio, ciclo.data_fim)})
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Previsão de Entrega (Despacho):
                </span>
                <span className="font-semibold text-slate-900">{dataDespachoFormatada}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ALERTA DE FASE / TRAVAS DO CICLO */}
        {isFechadoOuCancelado && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm font-bold">Coleta Encerrada</AlertTitle>
            <AlertDescription className="text-xs">
              Coleta encerrada para este ciclo — aguarde o próximo aviso da cooperativa
            </AlertDescription>
          </Alert>
        )}

        {/* Caso 1: Escola SEM pedido no ciclo acessando em Correção ou Coleta Encerrada */}
        {isPrazoPrimeiroEnvioExpirado && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm font-bold">Prazo de Primeiro Envio Encerrado</AlertTitle>
            <AlertDescription className="text-xs">
              O prazo para o primeiro envio de pedidos deste ciclo foi encerrado (fase atual:{' '}
              <strong>{isCorrecao ? 'Correção' : 'Coleta Encerrada'}</strong>). Novos pedidos são
              aceitos exclusivamente na fase Coletando. Entre em contato diretamente com a
              cooperativa caso precise de auxílio.
            </AlertDescription>
          </Alert>
        )}

        {/* Caso 2: Escola que JÁ enviou pedido no ciclo (Reenvio habilitado) */}
        {hasExistingFormOrder && !isFechadoOuCancelado && (
          <Alert
            className={
              isColetaEncerrada
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }
          >
            {isColetaEncerrada ? (
              <AlertTriangle className="h-4 w-4 text-amber-700" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-blue-700" />
            )}
            <AlertTitle className="text-sm font-bold">
              {isColetaEncerrada
                ? 'Coleta Encerrada — Reenvio / Correção Autorizado'
                : isCorrecao
                  ? 'Fase de Correção — Reenvio / Ajuste Autorizado'
                  : 'Pedido Anterior Registrado — Reenvio Habilitado'}
            </AlertTitle>
            <AlertDescription className="text-xs">
              Sua instituição já possui o pedido <strong>{existingOrder.numero}</strong> registrado
              neste ciclo (os itens foram pré-preenchidos abaixo). Você pode reenviar e ajustar as
              quantidades até o fechamento da coleta — o novo envio substituirá o pedido anterior.
            </AlertDescription>
          </Alert>
        )}

        {/* CASO EXTREMO: TODOS PRODUTOS EM ESCASSEZ OU INDISPONÍVEL */}
        {todosBloqueados && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm font-bold">Nenhum Produto Disponível</AlertTitle>
            <AlertDescription className="text-xs">
              Nenhum produto disponível para pedido neste ciclo — entre em contato com a
              cooperativa.
            </AlertDescription>
          </Alert>
        )}

        {/* FORMULÁRIO DE PRODUTOS */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-bold text-foreground">
                Produtos do Contrato
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Informe as quantidades desejadas de cada produto. Os valores devem ser expressos com{' '}
                <strong>uma casa decimal (,0 ou ,5)</strong>, representando frações de meio
                quilo/unidade.{' '}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0 divide-y">
              {formItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Nenhum produto cadastrado no contrato desta escola.
                </div>
              ) : (
                formItems.map((item) => {
                  const hasDivergence =
                    item.produtoMestreNome.toLowerCase() !== item.nomeContrato.toLowerCase()
                  const erro = validacao.errosPorItem[item.contratoItemId]

                  return (
                    <div
                      key={item.contratoItemId}
                      className={`p-3.5 sm:p-4 transition-colors ${
                        item.bloqueado ? 'bg-slate-50/70 opacity-75' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {item.nomeContrato}
                            </span>
                            {renderDisponibilidadeBadge(item.disponibilidade)}
                          </div>

                          {/* Nome mestre atenuado quando diferente */}
                          {hasDivergence && (
                            <p className="text-[11px] text-muted-foreground italic">
                              Catálogo mestre: {item.produtoMestreNome}
                            </p>
                          )}

                          {item.apelidos && (
                            <p className="text-[11px] text-muted-foreground">
                              Apelidos: {item.apelidos}
                            </p>
                          )}

                          {item.bloqueado && (
                            <p className="text-[11px] text-amber-700 font-medium">
                              {item.disponibilidade === 'indisponivel'
                                ? 'Indisponível neste ciclo'
                                : 'Em escassez — não pode ser pedido neste ciclo'}
                            </p>
                          )}
                        </div>

                        {/* Campo de Quantidade */}
                        <div className="sm:w-44 flex flex-col items-end">
                          <div className="flex items-center gap-1.5 w-full">
                            <Input
                              type="text"
                              inputMode="decimal"
                              disabled={item.bloqueado || !canSend || isSubmitting}
                              placeholder={item.bloqueado ? 'Bloqueado' : '0,0'}
                              value={item.quantidade}
                              onChange={(e) =>
                                handleQuantityChange(item.contratoItemId, e.target.value)
                              }
                              onBlur={() => handleQuantityBlur(item.contratoItemId)}
                              className={`h-9 text-right font-mono text-xs ${
                                item.bloqueado
                                  ? 'bg-slate-100 text-muted-foreground cursor-not-allowed border-dashed'
                                  : erro
                                    ? 'border-red-500 focus-visible:ring-red-500 bg-red-50/20'
                                    : ''
                              }`}
                            />
                            <span className="text-xs font-medium text-muted-foreground w-8 shrink-0">
                              {item.unidade}
                            </span>
                          </div>
                          {erro && (
                            <span className="text-[11px] text-red-600 mt-1 self-start">{erro}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* RESUMO E BOTÃO DE ENVIO */}
          <Card className="border-slate-200 shadow-sm bg-slate-50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span>Itens preenchidos:</span>
                <span className="font-bold text-foreground">
                  {validacao.totalItens} produto(s) selecionado(s)
                </span>
              </div>

              {validacao.mensagemGeral && !todosBloqueados && canSend && (
                <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {validacao.mensagemGeral}
                </p>
              )}

              <Button
                type="submit"
                disabled={!canSend || todosBloqueados || !validacao.valido || isSubmitting}
                className="w-full h-11 text-sm font-semibold gap-2 shadow"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Registrando pedido...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Enviar Pedido da Escola
                  </>
                )}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                Ao clicar em &quot;Enviar Pedido&quot;, sua solicitação é registrada diretamente no
                sistema da cooperativa e gera um número de protocolo oficial.
              </p>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
