import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FileCheck,
  Printer,
  Sprout,
  Loader2,
  Check,
  Download,
  Eye,
  FileText,
  AlertCircle,
  Building2,
  Truck,
  Layers,
  MapPin,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { configuracoesService } from '@/services/configuracoes'
import { atestosService } from '@/services/atestos'
import type { ConfiguracoesRecord, Order, Atesto, RotaLogisticaRecord } from '@/lib/types'
import {
  createOfficialAtestoPdf,
  createBatchAtestosPdf,
  openPdfForPrint,
  generateAtestoBlob,
  downloadAtestoPdf,
  formatQuantityBR,
  formatExtendDateBR,
  type AtestoDocumentData,
} from '@/lib/atestoPdfGenerator'

export default function Atestos() {
  const {
    atestos,
    orders,
    contracts,
    contractSchools,
    contractItems,
    rotasLogisticas,
    paradasRota,
    despachos,
    generateAtesto,
    confirmAtesto,
    refreshData,
    isLoading,
  } = useApp()
  const [config, setConfig] = useState<ConfiguracoesRecord | null>(null)
  const [isConfigLoading, setIsConfigLoading] = useState(true)

  // Estados de ações
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null)
  const [previewAtestoId, setPreviewAtestoId] = useState<string | null>(null)
  const [isEmitting, setIsEmitting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  // Estados para emissão/impressão por Rota Entregue em lote
  const [routeBatchModalOpen, setRouteBatchModalOpen] = useState(false)
  const [selectedRotaId, setSelectedRotaId] = useState<string>('')
  const [isGeneratingRouteBatch, setIsGeneratingRouteBatch] = useState(false)
  const [batchProgress, setBatchProgress] = useState<string>('')

  // Carregar configurações institucionais
  useEffect(() => {
    configuracoesService
      .get()
      .then((cfg) => {
        setConfig(cfg)
        setIsConfigLoading(false)
      })
      .catch((err) => {
        console.error('Erro ao carregar configurações para atestos:', err)
        setIsConfigLoading(false)
      })
  }, [])

  // Logo URL resolvida
  const logoUrl = useMemo(() => {
    return configuracoesService.getLogoUrl(config)
  }, [config])

  // Pedidos entregues sem atesto emitido (regra de negócio estrita)
  const pendingOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'Entregue' && !atestos.find((a) => a.orderId === o.id))
  }, [orders, atestos])

  // Rotas logísticas com status "Entregue" (via despacho entregue ou com pedidos entregues na rota)
  const deliveredRoutesData = useMemo(() => {
    return rotasLogisticas.map((rota) => {
      const paradasCadastradas = paradasRota
        .filter((p) => p.rota_logistica_id === rota.id)
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))

      const escolaIdsDaRota = new Set(paradasCadastradas.map((p) => p.escola_id))

      // Pedidos desta rota logística
      const pedidosDaRota = orders.filter(
        (o) => escolaIdsDaRota.has(o.schoolId) || o.rotaLogisticaId === rota.id,
      )

      // Apenas pedidos entregues da rota
      const pedidosEntregues = pedidosDaRota.filter((o) => o.status === 'Entregue')

      // Verificar se a rota possui despacho entregue ou se possui pedidos entregues
      const despachosDaRota = despachos
        .filter((d) => d.rota_logistica_id === rota.id)
        .sort((a, b) => new Date(b.data_despacho).getTime() - new Date(a.data_despacho).getTime())

      const ultimoDespacho = despachosDaRota[0]
      const isEntregue =
        ultimoDespacho?.status === 'Entregue' ||
        (pedidosEntregues.length > 0 &&
          pedidosDaRota.every((p) => p.status === 'Entregue' || p.status === 'Cancelado'))

      // Mapeamento de paradas e ordenação
      const paradaOrdemMap = new Map<string, number>()
      paradasCadastradas.forEach((p, idx) => {
        paradaOrdemMap.set(
          p.escola_id,
          p.ordem !== undefined && p.ordem !== null ? p.ordem : idx + 1,
        )
      })

      // Ordenar pedidos estritamente pela ordem de entrega das paradas
      const pedidosOrdenados = [...pedidosEntregues].sort((a, b) => {
        const ordemA = paradaOrdemMap.has(a.schoolId)
          ? (paradaOrdemMap.get(a.schoolId) as number)
          : 9999
        const ordemB = paradaOrdemMap.has(b.schoolId)
          ? (paradaOrdemMap.get(b.schoolId) as number)
          : 9999
        if (ordemA !== ordemB) {
          return ordemA - ordemB
        }
        return (a.schoolName || '').localeCompare(b.schoolName || '')
      })

      const contrato = contracts.find((c) => c.id === rota.contrato_id)

      // Quantos pedidos já têm atesto emitido vs quantos faltam emitir
      const pedidosComAtesto = pedidosOrdenados.filter((o) =>
        atestos.some((a) => a.orderId === o.id),
      )
      const pedidosSemAtesto = pedidosOrdenados.filter(
        (o) => !atestos.some((a) => a.orderId === o.id),
      )

      return {
        rota,
        contrato,
        isEntregue,
        ultimoDespacho,
        totalParadas: paradasCadastradas.length,
        pedidosDaRota,
        pedidosEntregues: pedidosOrdenados,
        pedidosComAtesto,
        pedidosSemAtesto,
        temPedidosEntregues: pedidosOrdenados.length > 0,
      }
    })
  }, [rotasLogisticas, paradasRota, orders, despachos, contracts, atestos])

  // Filtrar apenas rotas elegíveis: com status entregue e que possuam pedidos entregues
  const eligibleDeliveredRoutes = useMemo(() => {
    return deliveredRoutesData.filter((r) => r.isEntregue && r.temPedidosEntregues)
  }, [deliveredRoutesData])

  // Localizar contrato e número da chamada pública para uma escola
  const getNumeroChamadaForSchool = (schoolId: string): string => {
    // 1. Procurar no vínculo contrato_escolas
    const link = contractSchools.find((cs) => cs.escola_id === schoolId)
    if (link) {
      const contract = contracts.find((c) => c.id === link.contrato_id)
      if (contract?.numero_chamada?.trim()) {
        return contract.numero_chamada.trim()
      }
      if (contract?.numero) {
        return contract.numero
      }
    }
    // 2. Se não encontrar vínculo específico, usar o primeiro contrato ativo
    const activeContract = contracts.find((c) => c.status === 'Ativo')
    if (activeContract?.numero_chamada?.trim()) {
      return activeContract.numero_chamada.trim()
    }
    return activeContract?.numero || '001/2026'
  }

  // Prepara os dados canônicos do documento oficial para um Pedido ou Atesto
  const prepareDocumentData = (
    order: Order,
    atestoNumero?: string,
    dataEmissao?: string,
  ): AtestoDocumentData => {
    const numeroChamada = getNumeroChamadaForSchool(order.schoolId)
    const numeroAtesto = atestoNumero || `AT-${String(atestos.length + 1).padStart(3, '0')}`

    // Determinar o contrato vinculado a esta escola
    const schoolLink = contractSchools.find((cs) => cs.escola_id === order.schoolId)
    const linkedContractId =
      schoolLink?.contrato_id || contracts.find((c) => c.status === 'Ativo')?.id

    const items =
      order.items && order.items.length > 0
        ? order.items.map((i) => {
            // Regra oficial de Atestos: O nome impresso no atesto é o NOME NO CONTRATO
            // Fallback: se não tiver nome_contrato no item, usa o nome do produto
            let nomeParaAtesto = i.name
            if (linkedContractId && contractItems && contractItems.length > 0) {
              const matchedCI = contractItems.find(
                (ci) => ci.contrato_id === linkedContractId && ci.produto_id === i.productId,
              )
              if (matchedCI?.nome_contrato?.trim()) {
                nomeParaAtesto = matchedCI.nome_contrato.trim()
              }
            } else if (contractItems && contractItems.length > 0) {
              const anyCI = contractItems.find(
                (ci) => ci.produto_id === i.productId && ci.nome_contrato?.trim(),
              )
              if (anyCI?.nome_contrato?.trim()) {
                nomeParaAtesto = anyCI.nome_contrato.trim()
              }
            }

            return {
              nome: nomeParaAtesto,
              quantidade: i.quantity,
            }
          })
        : [
            {
              nome: 'Gêneros alimentícios da agricultura familiar conforme nota de entrega',
              quantidade: 1,
            },
          ]

    return {
      numeroAtesto,
      numeroChamada,
      nomeEscola: order.schoolName || 'Unidade Escolar',
      nomeCooperativa: config?.nome_cooperativa || 'CooperGestão — Cooperativa Agrícola Familiar',
      siglaCooperativa: config?.sigla || 'COOPGESTÃO',
      cidadeUf: config?.cidade_uf || 'Região Serrana - RJ',
      dataEmissao: dataEmissao || new Date(),
      items,
      logoUrl: logoUrl || undefined,
    }
  }

  // 1. Abertura do Modal de Emissão com Preview
  const handleOpenPreview = (orderId: string) => {
    setPreviewOrderId(orderId)
  }

  // 2. Executar Emissão de Atesto: Gera PDF, faz upload para o banco no registro do atesto
  const handleEmitirAtesto = async () => {
    if (!previewOrderId) return
    const order = orders.find((o) => o.id === previewOrderId)
    if (!order) {
      toast.error('Pedido não localizado para emissão.')
      return
    }

    setIsEmitting(true)
    try {
      const nextNum = `AT-${String(atestos.length + 1).padStart(3, '0')}`
      let warnedLogoFailure = false
      const handleLogoError = (err: unknown) => {
        if (!warnedLogoFailure) {
          warnedLogoFailure = true
          console.warn('Falha ao carregar logotipo para o PDF:', err)
          toast.error('Falha ao carregar o logotipo — o PDF será gerado sem o logo.')
        }
      }

      const docData = {
        ...prepareDocumentData(order, nextNum),
        onLogoError: handleLogoError,
      }

      // 1. Gerar PDF oficial como Blob (robusto mesmo se logotipo falhar)
      let pdfBlob: Blob | undefined
      try {
        pdfBlob = await generateAtestoBlob(docData)
      } catch (pdfErr) {
        console.warn('Tentativa com logotipo falhou ao gerar Blob, tentando sem logo:', pdfErr)
        handleLogoError(pdfErr)
        // Fallback garantido: gerar sem logo para não barrar a emissão do atesto oficial
        pdfBlob = await generateAtestoBlob({
          ...docData,
          logoUrl: undefined,
          onLogoError: undefined,
        })
      }

      // 2. Gravar no backend no registro do atesto (com arquivo PDF no campo `arquivo`)
      const createdRecord = await generateAtesto(order.id, pdfBlob, nextNum)

      if (createdRecord) {
        toast.success(
          `Termo de Recebimento (${docData.numeroAtesto}) emitido e gravado com sucesso!`,
        )
        // Disparar download imediato do PDF oficial para conveniência
        try {
          await downloadAtestoPdf(
            docData,
            `Termo_Recebimento_${docData.numeroAtesto}_${order.schoolName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
          )
        } catch (dlErr) {
          console.warn('Download automático em navegador falhou:', dlErr)
          toast.error('O atesto foi gerado, mas houve uma falha ao disparar o download automático.')
        }
        setPreviewOrderId(null)
      }
    } catch (err: any) {
      console.error('Erro ao emitir atesto oficial:', err)
      const detail =
        err?.data?.message ||
        err?.response?.message ||
        err?.message ||
        'Falha ao emitir e armazenar atesto oficial.'
      toast.error(`Falha ao emitir atesto: ${detail}`)
    } finally {
      setIsEmitting(false)
    }
  }

  // 3. Download e geração do PDF de um Atesto já emitido (SEMPRE gera com o template oficial mais recente)
  const handleDownloadExisting = async (atesto: Atesto) => {
    setDownloadingId(atesto.id)
    try {
      // Sempre regerar o PDF a partir dos dados do pedido e do template atual,
      // garantindo que qualquer atesto já existente receba o layout novo imediatamente.
      // Procura o pedido vinculado na lista em memória ou busca no backend
      let relatedOrder = orders.find((o) => o.id === atesto.orderId)

      // Fallback: se não estiver na lista local de pedidos, buscar dados do pedido e itens direto do banco
      if (!relatedOrder && atesto.orderId) {
        try {
          const pedRec = await pb.collection('pedidos').getOne<any>(atesto.orderId, {
            expand: 'escola_id,ciclo_id,rota_id',
          })
          const pedItens = await pb.collection('pedido_itens').getFullList<any>({
            filter: `pedido_id = "${atesto.orderId}"`,
            expand: 'produto_id',
          })

          // Buscar contrato_itens para garantir o nome no contrato
          let fallbackContractItems: any[] = []
          try {
            fallbackContractItems = await pb.collection('contrato_itens').getFullList<any>()
          } catch {
            /* intentionally ignored */
          }

          if (pedRec) {
            relatedOrder = {
              id: pedRec.id,
              numero: pedRec.numero,
              schoolId: pedRec.escola_id,
              schoolName: pedRec.expand?.escola_id?.nome || atesto.schoolName || 'Unidade Escolar',
              cicloId: pedRec.ciclo_id,
              origem: pedRec.origem || 'manual',
              rotaId: pedRec.rota_id,
              validacao: pedRec.validacao,
              date: pedRec.data_prevista || atesto.date,
              status: pedRec.status,
              entregue_em: pedRec.entregue_em,
              total: 0,
              items: pedItens.map((it: any) => {
                const ciMatch = fallbackContractItems.find(
                  (c) => c.produto_id === it.produto_id && c.nome_contrato?.trim(),
                )
                const nomeContrato =
                  ciMatch?.nome_contrato?.trim() ||
                  it.expand?.produto_id?.nome ||
                  'Gêneros Alimentícios'
                return {
                  id: it.id,
                  productId: it.produto_id,
                  name: nomeContrato,
                  quantity: Number(it.quantidade) || 0,
                  price: Number(it.preco_unitario) || 0,
                }
              }),
            }
          }
        } catch (fetchPedErr) {
          console.warn('Busca de emergência do pedido falhou:', fetchPedErr)
          toast.error(
            'Não foi possível carregar os dados completos do pedido vinculado. Usando dados do atesto.',
          )
        }
      }

      // Se ainda não encontrou o pedido completo, construir um objeto Order sintético mínimo baseado nos dados do atesto
      const targetOrder: Order = relatedOrder || {
        id: atesto.orderId,
        numero: atesto.orderNumber || atesto.numero,
        schoolId: '',
        schoolName: atesto.schoolName || 'Unidade Escolar',
        origem: 'manual',
        validacao: { status: 'validado', motivo: 'Registro de Atesto' },
        date: atesto.date || new Date().toISOString(),
        status: 'Entregue',
        total: 0,
        items: [
          {
            id: 'fallback-item',
            productId: 'fallback',
            name: 'Gêneros alimentícios da agricultura familiar conforme registro de entrega',
            quantity: 1,
            price: 0,
          },
        ],
      }

      let warnedLogoFailure = false
      const handleLogoError = (err: unknown) => {
        if (!warnedLogoFailure) {
          warnedLogoFailure = true
          console.warn('Falha ao carregar logotipo para o PDF:', err)
          toast.error('Falha ao carregar o logotipo — o PDF será gerado sem o logo.')
        }
      }

      const docData: AtestoDocumentData = {
        ...prepareDocumentData(targetOrder, atesto.numero, atesto.date),
        onLogoError: handleLogoError,
      }

      // 3. Sintetizar PDF com tolerância máxima a falhas de imagem
      let pdfBlob: Blob | null = null
      let generationError: unknown = null

      try {
        pdfBlob = await generateAtestoBlob(docData)
      } catch (genErr) {
        generationError = genErr
        console.warn('Falha na geração com logotipo, tentando sem logo:', genErr)
        handleLogoError(genErr)

        try {
          pdfBlob = await generateAtestoBlob({
            ...docData,
            logoUrl: undefined,
            onLogoError: undefined,
          })
          generationError = null
        } catch (genFallbackErr) {
          generationError = genFallbackErr
          console.error('Falha crítica na síntese do PDF sem logotipo:', genFallbackErr)
        }
      }

      // 4. Se sintetizou o Blob, salvar retroativamente no banco para os próximos downloads
      if (pdfBlob) {
        const safeAtestoNum = (atesto.numero || atesto.id).replace(/[^a-zA-Z0-9_-]/g, '_')
        const retroFilename = `Termo_Recebimento_${safeAtestoNum}.pdf`
        try {
          await atestosService.updatePdf(atesto.id, pdfBlob, retroFilename)
        } catch (upErr) {
          console.warn(
            'Atualização retroativa no PocketBase não concluída (não impede download):',
            upErr,
          )
          toast.error(
            'PDF gerado com sucesso, mas não foi possível salvar a cópia no banco para downloads futuros.',
          )
        }
      }

      // 5. Disparar download para o usuário no navegador
      const safeSchoolName = (atesto.schoolName || 'Escola').replace(/[^a-zA-Z0-9_-]/g, '_')
      const safeNum = (atesto.numero || atesto.id).replace(/[^a-zA-Z0-9_-]/g, '_')
      const downloadFilename = `Termo_Recebimento_${safeNum}_${safeSchoolName}.pdf`

      try {
        await downloadAtestoPdf(docData, downloadFilename)
        toast.success('Termo de Recebimento gerado e baixado com sucesso!')
      } catch (dlErr: any) {
        console.error('Falha ao disparar download do PDF:', dlErr)
        const reason =
          generationError instanceof Error
            ? generationError.message
            : dlErr?.message || 'Falha ao processar o arquivo PDF.'
        toast.error(`Não foi possível regenerar o PDF do atesto: ${reason}`)
      }
    } catch (err: any) {
      console.error('Erro geral no download do atesto:', err)
      const detail = err?.data?.message || err?.message || 'Erro inesperado ao processar o atesto.'
      toast.error(`Falha no download do atesto: ${detail}`)
    } finally {
      setDownloadingId(null)
    }
  }

  // 4. Confirmar Atesto
  const handleConfirm = async (atestoId: string) => {
    setConfirmingId(atestoId)
    const success = await confirmAtesto(atestoId)
    setConfirmingId(null)
    if (success) {
      toast.success('Termo de Recebimento confirmado com sucesso!')
    }
  }

  const handlePrint = () => {
    // Garantir que a impressão dispare após renderização do DOM
    window.print()
  }

  // Impressão direta do documento oficial em PDF com layout perfeito
  const handlePrintAtestoPdf = async (atesto: Atesto) => {
    setDownloadingId(atesto.id)
    try {
      let relatedOrder = orders.find((o) => o.id === atesto.orderId)
      if (!relatedOrder && atesto.orderId) {
        try {
          const pedRec = await pb.collection('pedidos').getOne<any>(atesto.orderId, {
            expand: 'escola_id,ciclo_id,rota_id',
          })
          const pedItens = await pb.collection('pedido_itens').getFullList<any>({
            filter: `pedido_id = "${atesto.orderId}"`,
            expand: 'produto_id',
          })
          let fallbackContractItems: any[] = []
          try {
            fallbackContractItems = await pb.collection('contrato_itens').getFullList<any>()
          } catch {
            /* intentionally ignored */
          }
          if (pedRec) {
            relatedOrder = {
              id: pedRec.id,
              numero: pedRec.numero,
              schoolId: pedRec.escola_id,
              schoolName: pedRec.expand?.escola_id?.nome || atesto.schoolName || 'Unidade Escolar',
              cicloId: pedRec.ciclo_id,
              origem: pedRec.origem || 'manual',
              rotaId: pedRec.rota_id,
              validacao: pedRec.validacao,
              date: pedRec.data_prevista || atesto.date,
              status: pedRec.status,
              entregue_em: pedRec.entregue_em,
              total: 0,
              items: pedItens.map((it: any) => {
                const ciMatch = fallbackContractItems.find(
                  (c) => c.produto_id === it.produto_id && c.nome_contrato?.trim(),
                )
                const nomeContrato =
                  ciMatch?.nome_contrato?.trim() ||
                  it.expand?.produto_id?.nome ||
                  'Gêneros Alimentícios'
                return {
                  id: it.id,
                  productId: it.produto_id,
                  name: nomeContrato,
                  quantity: Number(it.quantidade) || 0,
                  price: Number(it.preco_unitario) || 0,
                }
              }),
            }
          }
        } catch (fetchErr) {
          console.warn('Erro ao carregar pedido para impressão PDF:', fetchErr)
        }
      }

      const targetOrder: Order = relatedOrder || {
        id: atesto.orderId,
        numero: atesto.orderNumber || atesto.numero,
        schoolId: '',
        schoolName: atesto.schoolName || 'Unidade Escolar',
        origem: 'manual',
        validacao: { status: 'validado', motivo: 'Registro de Atesto' },
        date: atesto.date || new Date().toISOString(),
        status: 'Entregue',
        total: 0,
        items: [
          {
            id: 'fallback-item',
            productId: 'fallback',
            name: 'Gêneros alimentícios da agricultura familiar conforme registro de entrega',
            quantity: 1,
            price: 0,
          },
        ],
      }

      const docData: AtestoDocumentData = prepareDocumentData(
        targetOrder,
        atesto.numero,
        atesto.date,
      )
      let doc: any
      try {
        doc = await createOfficialAtestoPdf(docData)
      } catch {
        doc = await createOfficialAtestoPdf({ ...docData, logoUrl: undefined })
      }
      openPdfForPrint(doc)
    } catch (printErr: any) {
      console.error('Falha ao abrir PDF para impressão:', printErr)
      window.print()
    } finally {
      setDownloadingId(null)
    }
  }

  // 5. Emitir e Imprimir todos os atestos de uma ROTA ENTREGUE em um único PDF em ordem de entrega
  const handleEmitirEImprimirRota = async () => {
    if (!selectedRotaId) {
      toast.error('Selecione uma rota logística entregue.')
      return
    }

    const rotaData = deliveredRoutesData.find((r) => r.rota.id === selectedRotaId)
    if (!rotaData) {
      toast.error('Dados da rota não encontrados.')
      return
    }

    if (rotaData.pedidosEntregues.length === 0) {
      toast.error('Esta rota não possui pedidos entregues para emitir atestos.')
      return
    }

    setIsGeneratingRouteBatch(true)
    setBatchProgress('Iniciando processamento dos atestos da rota...')

    try {
      // 1. Garantir que os pedidos da rota sem atesto sejam emitidos primeiro no banco
      const pedidosParaProcessar = rotaData.pedidosEntregues
      let emitidosNovosCount = 0

      // Clonar a lista de atestos em memória para controle incremental do número de atesto
      let currentAtestosSnapshot = [...atestos]

      for (let i = 0; i < pedidosParaProcessar.length; i++) {
        const order = pedidosParaProcessar[i]
        const atestoExistente = currentAtestosSnapshot.find((a) => a.orderId === order.id)

        if (!atestoExistente) {
          setBatchProgress(
            `Emitindo atesto ${i + 1} de ${pedidosParaProcessar.length}: ${order.schoolName}...`,
          )
          const nextNum = `AT-${String(currentAtestosSnapshot.length + 1).padStart(3, '0')}`

          const docData = {
            ...prepareDocumentData(order, nextNum),
            onLogoError: undefined,
          }

          // Gerar blob para arquivar no banco
          let pdfBlob: Blob | undefined
          try {
            pdfBlob = await generateAtestoBlob(docData)
          } catch {
            pdfBlob = await generateAtestoBlob({ ...docData, logoUrl: undefined })
          }

          const created = await generateAtesto(order.id, pdfBlob, nextNum)
          if (created) {
            emitidosNovosCount++
            currentAtestosSnapshot.push({
              id: created.id,
              numero: nextNum,
              orderId: order.id,
              orderNumber: order.numero,
              schoolName: order.schoolName,
              date: new Date().toISOString().split('T')[0],
              status: 'Pendente Assinatura',
              arquivo: created.arquivo,
            })
          }
        }
      }

      setBatchProgress('Montando PDF único consolidado em ordem de entrega...')

      // 2. Montar documentos em estrita ordem de entrega da rota logística
      const batchDocumentDataList: AtestoDocumentData[] = []

      for (const order of pedidosParaProcessar) {
        const atestoDoPedido = currentAtestosSnapshot.find((a) => a.orderId === order.id)
        const numeroAtesto =
          atestoDoPedido?.numero ||
          `AT-${String(currentAtestosSnapshot.length + 1).padStart(3, '0')}`
        const dataDoc = atestoDoPedido?.date || new Date().toISOString()

        const docData = prepareDocumentData(order, numeroAtesto, dataDoc)
        batchDocumentDataList.push(docData)
      }

      // 3. Criar PDF consolidado único contendo todas as páginas
      const batchDoc = await createBatchAtestosPdf(batchDocumentDataList)

      // 4. Disparar abertura e impressão do PDF único
      setBatchProgress('Enviando para impressão e download...')
      openPdfForPrint(batchDoc)

      // Também disponibilizar download do arquivo com nome bem formatado
      const safeRotaNome = rotaData.rota.nome.replace(/[^a-zA-Z0-9_-]/g, '_')
      const pdfFileName = `Atestos_Rota_${safeRotaNome}_Entregue.pdf`
      try {
        batchDoc.save(pdfFileName)
      } catch (errSave) {
        console.warn('doc.save() falhou, fallback via blob:', errSave)
        const blob = batchDoc.output('blob')
        const blobUrl = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = pdfFileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000)
      }

      toast.success(
        `PDF gerado com sucesso! ${batchDocumentDataList.length} atesto(s) da Rota "${rotaData.rota.nome}" consolidados em ordem de entrega. ${
          emitidosNovosCount > 0
            ? `(${emitidosNovosCount} novo(s) atesto(s) gravado(s) no sistema).`
            : ''
        }`,
      )

      setRouteBatchModalOpen(false)
      // Atualizar dados para refletir imediatamente novos atestos na tabela
      if (emitidosNovosCount > 0) {
        refreshData()
      }
    } catch (err: any) {
      console.error('Erro na geração em lote da rota:', err)
      const detail = err?.data?.message || err?.message || 'Falha ao processar atestos da rota.'
      toast.error(`Falha ao emitir atestos da rota: ${detail}`)
    } finally {
      setIsGeneratingRouteBatch(false)
      setBatchProgress('')
    }
  }

  // Ordem selecionada para emissão
  const orderForEmission = useMemo(() => {
    if (!previewOrderId) return null
    return orders.find((o) => o.id === previewOrderId) || null
  }, [previewOrderId, orders])

  // Atesto selecionado para visualização
  const atestoForView = useMemo(() => {
    if (!previewAtestoId) return null
    return atestos.find((a) => a.id === previewAtestoId) || null
  }, [previewAtestoId, atestos])

  const orderForView = useMemo(() => {
    if (!atestoForView) return null
    return orders.find((o) => o.id === atestoForView.orderId) || null
  }, [atestoForView, orders])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <span>Emissão de Atestos Oficiais</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            Gere o <strong>Termo de Recebimento de Aquisição de Gêneros Alimentícios</strong> pronto
            para impressão e arquivamento em PDF.
          </p>
        </div>

        {/* Botão em lote: Emitir e Imprimir por Rota Entregue */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 font-medium shadow-xs"
            onClick={() => {
              if (eligibleDeliveredRoutes.length > 0) {
                // Auto-selecionar a primeira se não tiver selecionado
                if (
                  !selectedRotaId ||
                  !eligibleDeliveredRoutes.some((r) => r.rota.id === selectedRotaId)
                ) {
                  setSelectedRotaId(eligibleDeliveredRoutes[0].rota.id)
                }
              }
              setRouteBatchModalOpen(true)
            }}
            disabled={isLoading || isConfigLoading}
          >
            <Truck className="h-4 w-4" />
            <span>Imprimir Atestos por Rota Entregue</span>
            {eligibleDeliveredRoutes.length > 0 && (
              <Badge className="ml-1 bg-white/20 hover:bg-white/30 text-white text-[11px] px-1.5 py-0 h-5">
                {eligibleDeliveredRoutes.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Bloco: Pedidos Entregues Aguardando Emissão */}
      {pendingOrders.length > 0 ? (
        <Card className="border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
                <FileCheck className="h-5 w-5 text-emerald-600" /> Pedidos Entregues Aguardando
                Emissão de Atesto
              </CardTitle>
              <Badge
                variant="outline"
                className="text-emerald-700 border-emerald-400 font-semibold"
              >
                {pendingOrders.length} pedido(s) elegível(eis)
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Regra de negócio: Apenas pedidos com status <strong>"Entregue"</strong> e sem atesto
              vinculado são listados aqui. Clique em <strong>"Visualizar e Emitir"</strong> para
              revisar o documento oficial em modelo A4 antes de gravar.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingOrders.map((order) => {
                const totalKg = order.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
                const chamada = getNumeroChamadaForSchool(order.schoolId)

                return (
                  <div
                    key={order.id}
                    className="flex flex-col justify-between bg-card p-3.5 rounded-lg border shadow-xs hover:border-emerald-400/50 transition-colors"
                  >
                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm line-clamp-1">{order.schoolName}</p>
                        <Badge className="bg-emerald-600 text-[10px] h-4 shrink-0">Entregue</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Pedido:{' '}
                        <span className="font-semibold text-foreground">
                          {order.numero || order.id}
                        </span>
                        {order.entregue_em && (
                          <span> • {new Date(order.entregue_em).toLocaleDateString('pt-BR')}</span>
                        )}
                      </p>
                      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t">
                        <span>
                          Chamada Pública: <strong>{chamada}</strong>
                        </span>
                        <span>
                          Total de Itens: <strong>{formatQuantityBR(totalKg)} KG</strong>
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 text-xs"
                      onClick={() => handleOpenPreview(order.id)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Visualizar e Emitir Atesto
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5">
            <Check className="h-5 w-5 text-emerald-600" />
            <span>Nenhum pedido entregue aguardando emissão de atesto no momento.</span>
            <span className="text-[11px]">
              Para emitir um novo atesto, confirme primeiro a entrega do pedido na tela de{' '}
              <strong>Pedidos</strong> ou <strong>Rotas de Entrega</strong>.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Histórico de Atestos Emitidos */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle>Histórico de Termos de Recebimento</CardTitle>
              <CardDescription>
                Relação completa de atestos emitidos, prontos para download do PDF oficial e
                conferência.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              Total emitidos: <strong>{atestos.length}</strong>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Atesto</TableHead>
                  <TableHead>Ref. Pedido</TableHead>
                  <TableHead>Instituição / Escola</TableHead>
                  <TableHead>Data Emissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Arquivo PDF</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || isConfigLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Carregando atestos do banco...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : atestos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum atesto emitido no banco de dados.
                    </TableCell>
                  </TableRow>
                ) : (
                  atestos.map((atesto) => {
                    return (
                      <TableRow key={atesto.id}>
                        <TableCell className="font-semibold text-primary">
                          {atesto.numero || atesto.id}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {atesto.orderNumber || atesto.orderId}
                        </TableCell>
                        <TableCell className="font-medium">{atesto.schoolName}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(atesto.date).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={atesto.status === 'Confirmado' ? 'default' : 'outline'}
                            className={
                              atesto.status === 'Confirmado'
                                ? 'bg-primary'
                                : 'text-secondary-foreground border-secondary bg-secondary/10'
                            }
                          >
                            {atesto.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {atesto.arquivo ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-300"
                            >
                              PDF Gravado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Gerado ao Baixar
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {atesto.status === 'Pendente Assinatura' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10"
                                onClick={() => handleConfirm(atesto.id)}
                                disabled={confirmingId === atesto.id}
                              >
                                {confirmingId === atesto.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Check className="h-3 w-3 mr-1" />
                                )}
                                Confirmar
                              </Button>
                            )}

                            {/* Botão Imprimir Direto */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 border-muted-foreground/30 hover:bg-muted"
                              onClick={() => handlePrintAtestoPdf(atesto)}
                              disabled={downloadingId === atesto.id}
                              title="Imprimir Termo de Recebimento Oficial"
                            >
                              {downloadingId === atesto.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Printer className="h-3 w-3 mr-1" />
                              )}
                              Imprimir
                            </Button>
                            {/* Botão Baixar PDF */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 border-muted-foreground/30 hover:bg-muted"
                              onClick={() => handleDownloadExisting(atesto)}
                              disabled={downloadingId === atesto.id}
                              title="Baixar Termo de Recebimento em PDF"
                            >
                              {downloadingId === atesto.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Download className="h-3 w-3 mr-1" />
                              )}
                              Baixar PDF
                            </Button>
                            {/* Botão Visualizar Documento */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setPreviewAtestoId(atesto.id)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
                            </Button>
                          </div>
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

      {/* ========================================================================= */}
      {/* MODAL 1: PREVIEW DO DOCUMENTO ANTES DE EMITIR (COM BOTÃO "EMITIR ATESTO") */}
      {/* ========================================================================= */}
      <Dialog
        open={!!previewOrderId}
        onOpenChange={(open) => {
          if (!open && !isEmitting) setPreviewOrderId(null)
        }}
      >
        <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-2 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span>Preview do Documento Oficial</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Confira a pré-visualização do modelo oficial A4 antes de confirmar a emissão.
                </DialogDescription>
              </div>
              <Badge variant="outline" className="text-emerald-700 border-emerald-400">
                Pendente Emissão
              </Badge>
            </div>
          </DialogHeader>

          {orderForEmission && (
            <div className="p-6 space-y-4">
              {/* Documento A4 Estilizado */}
              <DocumentoOficialView
                order={orderForEmission}
                config={config}
                logoUrl={logoUrl}
                numeroChamada={getNumeroChamadaForSchool(orderForEmission.schoolId)}
                numeroAtesto={`AT-${String(atestos.length + 1).padStart(3, '0')}`}
                dataEmissao={new Date()}
              />

              {/* Ações do Modal */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewOrderId(null)}
                  disabled={isEmitting}
                >
                  Cancelar
                </Button>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextNum = `AT-${String(atestos.length + 1).padStart(3, '0')}`
                      const docData = prepareDocumentData(orderForEmission, nextNum)
                      createOfficialAtestoPdf(docData)
                        .then((doc) => openPdfForPrint(doc))
                        .catch(() => window.print())
                    }}
                    disabled={isEmitting}
                    className="gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </Button>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 flex-1 sm:flex-none"
                    onClick={handleEmitirAtesto}
                    disabled={isEmitting}
                  >
                    {isEmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Emitindo e Gravando PDF...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Emitir Atesto & Gravar PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: VISUALIZAÇÃO DE ATESTO JÁ EMITIDO */}
      {/* ========================================================================= */}
      <Dialog
        open={!!previewAtestoId}
        onOpenChange={(open) => {
          if (!open) setPreviewAtestoId(null)
        }}
      >
        <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-2 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span>Termo de Recebimento Emitido</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {atestoForView?.numero || atestoForView?.id} • Instituição:{' '}
                  {atestoForView?.schoolName}
                </DialogDescription>
              </div>
              <Badge
                variant={atestoForView?.status === 'Confirmado' ? 'default' : 'outline'}
                className={atestoForView?.status === 'Confirmado' ? 'bg-primary' : ''}
              >
                {atestoForView?.status}
              </Badge>
            </div>
          </DialogHeader>

          {atestoForView && (
            <div className="p-6 space-y-4">
              {orderForView ? (
                <DocumentoOficialView
                  order={orderForView}
                  config={config}
                  logoUrl={logoUrl}
                  numeroChamada={getNumeroChamadaForSchool(orderForView.schoolId)}
                  numeroAtesto={atestoForView.numero}
                  dataEmissao={atestoForView.date}
                />
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  Dados detalhados do pedido indisponíveis para visualização em tela. Utilize o
                  botão "Baixar PDF" para obter o arquivo oficial.
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
                <div>
                  {atestoForView.status === 'Pendente Assinatura' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfirm(atestoForView.id)}
                      disabled={confirmingId === atestoForView.id}
                      className="border-primary/40 text-primary"
                    >
                      {confirmingId === atestoForView.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Confirmar Recebimento
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePrintAtestoPdf(atestoForView)}
                    disabled={downloadingId === atestoForView.id}
                    className="gap-1.5"
                  >
                    {downloadingId === atestoForView.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4" />
                    )}
                    Imprimir
                  </Button>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                    onClick={() => handleDownloadExisting(atestoForView)}
                    disabled={downloadingId === atestoForView.id}
                  >
                    {downloadingId === atestoForView.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Baixar PDF
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: EMISSÃO E IMPRESSÃO DE TODOS OS ATESTOS POR ROTA ENTREGUE        */}
      {/* ========================================================================= */}
      <Dialog
        open={routeBatchModalOpen}
        onOpenChange={(open) => {
          if (!open && !isGeneratingRouteBatch) setRouteBatchModalOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <span>Emitir e Imprimir Atestos por Rota Entregue</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Gera em um <strong>ÚNICO PDF</strong> todos os termos de recebimento da rota
              selecionada, em estrita <strong>ordem de entrega das paradas</strong>. Pedidos
              entregues sem atesto serão emitidos e arquivados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {eligibleDeliveredRoutes.length === 0 ? (
              <div className="p-6 text-center rounded-lg border border-dashed bg-muted/30 space-y-2">
                <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-foreground">
                  Nenhuma rota logística entregue com pedidos disponíveis
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Para utilizar esta função, certifique-se de que a rota logística teve seu despacho
                  marcado como <strong>"Entregue"</strong> na tela de{' '}
                  <strong>Rotas de Entrega</strong> e possui pedidos com status{' '}
                  <strong>"Entregue"</strong>.
                </p>
              </div>
            ) : (
              <>
                {/* Seletor de Rota */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    Selecione a Rota Entregue:
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {eligibleDeliveredRoutes.map((r) => {
                      const isSelected = selectedRotaId === r.rota.id
                      const despDataStr = r.ultimoDespacho?.data_despacho
                        ? new Date(r.ultimoDespacho.data_despacho).toLocaleDateString('pt-BR')
                        : 'Entregue'

                      return (
                        <div
                          key={r.rota.id}
                          onClick={() => {
                            if (!isGeneratingRouteBatch) setSelectedRotaId(r.rota.id)
                          }}
                          className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary'
                              : 'hover:border-primary/50 bg-card'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-foreground">
                                  {r.rota.nome}
                                </span>
                                <Badge className="bg-emerald-600 text-[10px] h-4">Entregue</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Contrato:{' '}
                                <span className="font-medium text-foreground">
                                  {r.contrato?.numero || 'Sem contrato'}
                                </span>
                                {r.contrato?.numero_chamada &&
                                  ` • Chamada: ${r.contrato.numero_chamada}`}
                              </p>
                            </div>
                            <div className="text-right text-xs">
                              <span className="font-semibold text-primary">
                                {r.pedidosEntregues.length} pedido(s)
                              </span>
                              <p className="text-[11px] text-muted-foreground">
                                {r.totalParadas} parada(s)
                              </p>
                            </div>
                          </div>

                          {/* Detalhes de pendência de emissão */}
                          <div className="mt-2.5 pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Despacho: {despDataStr}
                            </span>
                            <div className="flex items-center gap-2">
                              <span>
                                Já emitidos:{' '}
                                <strong className="text-emerald-600">
                                  {r.pedidosComAtesto.length}
                                </strong>
                              </span>
                              {r.pedidosSemAtesto.length > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-amber-600 border-amber-300 text-[10px] h-4"
                                >
                                  {r.pedidosSemAtesto.length} a gerar agora
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-emerald-700 border-emerald-300 text-[10px] h-4"
                                >
                                  Todos gerados
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Resumo da Sequência de Entrega */}
                {selectedRotaId &&
                  (() => {
                    const rotaSel = eligibleDeliveredRoutes.find(
                      (r) => r.rota.id === selectedRotaId,
                    )
                    if (!rotaSel) return null

                    return (
                      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            Ordem de Entrega das Paradas ({rotaSel.pedidosEntregues.length} atestos
                            no PDF):
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            1 página por atesto
                          </span>
                        </div>

                        <div className="max-h-44 overflow-y-auto space-y-1 pr-1 text-xs">
                          {rotaSel.pedidosEntregues.map((ord, idx) => {
                            const jaTemAtesto = atestos.some((a) => a.orderId === ord.id)
                            return (
                              <div
                                key={ord.id}
                                className="flex items-center justify-between p-1.5 rounded bg-background border text-[11.5px]"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px] shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="font-medium text-foreground line-clamp-1">
                                    {ord.schoolName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-muted-foreground">
                                    Ped: {ord.numero || ord.id}
                                  </span>
                                  {jaTemAtesto ? (
                                    <Badge
                                      variant="outline"
                                      className="text-emerald-600 border-emerald-300 text-[9px] h-4"
                                    >
                                      Atesto OK
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-amber-600 border-amber-300 text-[9px] h-4"
                                    >
                                      Novo
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                {/* Barra de Progresso / Feedback */}
                {isGeneratingRouteBatch && (
                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{batchProgress || 'Processando atestos...'}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Por favor aguarde enquanto os documentos são gerados, timbrados e consolidados
                      em um único arquivo PDF.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRouteBatchModalOpen(false)}
              disabled={isGeneratingRouteBatch}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
              onClick={handleEmitirEImprimirRota}
              disabled={
                isGeneratingRouteBatch || eligibleDeliveredRoutes.length === 0 || !selectedRotaId
              }
            >
              {isGeneratingRouteBatch ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Emitindo e Consolidando PDF...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  Emitir e Imprimir Rota Completa (PDF Único)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Componente que renderiza a visualização fiel da folha A4 oficial:
 * MODELO: "TERMO DE RECEBIMENTO DE AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS"
 */
interface DocumentoOficialViewProps {
  order: Order
  config: ConfiguracoesRecord | null
  logoUrl?: string
  numeroChamada: string
  numeroAtesto: string
  dataEmissao: Date | string
}

function DocumentoOficialView({
  order,
  config,
  logoUrl,
  numeroChamada,
  numeroAtesto,
  dataEmissao,
}: DocumentoOficialViewProps) {
  const nomeCoop = config?.nome_cooperativa || 'CooperGestão — Cooperativa Agrícola Familiar'
  const cidadeUf = config?.cidade_uf || 'Região Serrana - RJ'
  const nomeEscola = order.schoolName || 'Unidade Escolar'

  const items =
    order.items && order.items.length > 0
      ? order.items
      : [
          {
            name: 'Gêneros alimentícios da agricultura familiar',
            quantity: 1,
            price: 0,
            productId: '1',
          },
        ]

  const totalQuantidade = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)
  const isDense = items.length > 12

  // Linhas tracejadas de preenchimento caso haja poucos itens (conforme modelo oficial)
  const emptyRowsCount = items.length < 6 ? Math.min(2, 6 - items.length) : 0

  return (
    <div
      id="atesto-documento-oficial"
      className={`bg-white text-slate-900 border border-slate-300 shadow-md ${
        isDense ? 'p-6 sm:p-8 space-y-4' : 'p-8 sm:p-10 space-y-5'
      } rounded-sm font-sans max-w-[680px] mx-auto text-sm leading-relaxed print:p-0 print:border-none print:shadow-none print:max-w-none`}
    >
      {/* 1. Cabeçalho com logotipo, nome da cooperativa e título oficial */}
      <div className="text-center space-y-1.5 pb-3 border-b border-slate-300">
        {logoUrl ? (
          <div className="flex justify-center mb-1.5">
            <img
              src={logoUrl}
              alt="Logotipo Cooperativa"
              className={`${isDense ? 'h-11 max-w-[140px]' : 'h-13 max-w-[160px]'} object-contain`}
            />
          </div>
        ) : (
          <div className="flex justify-center mb-1">
            <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800">
              <Sprout className="h-5 w-5" />
            </div>
          </div>
        )}
        <h2 className="font-bold text-[11px] uppercase tracking-wider text-slate-700">
          {nomeCoop}
        </h2>
        <h1 className="font-extrabold text-xs sm:text-[13px] text-slate-900 tracking-tight leading-snug">
          TERMO DE RECEBIMENTO DE AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS REFERENTE À CHAMADA PÚBLICA - N°{' '}
          {numeroChamada || 'Nº'}
        </h1>
      </div>

      {/* 2. Parágrafo de Atesto */}
      <div className="text-justify text-[12.5px] text-slate-800">
        <p>
          Atesto que a <strong>{nomeEscola}</strong> recebeu os produtos listados abaixo da{' '}
          <strong>{nomeCoop}</strong>.
        </p>
      </div>

      {/* 3. Tabela de Produtos centralizada */}
      <div className="flex justify-center">
        <div className="w-full max-w-[540px] overflow-hidden border border-slate-800 rounded-none shadow-none">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-800 font-bold text-slate-900 text-center">
                <th
                  className={`border-r border-slate-800 ${isDense ? 'py-1 px-2.5' : 'py-1.5 px-3'} text-left`}
                >
                  PRODUTOS
                </th>
                <th className={`${isDense ? 'py-1 px-2.5 w-36' : 'py-1.5 px-3 w-40'} text-center`}>
                  QUANTIDADE (KG)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td
                    className={`border-r border-slate-800 ${
                      isDense ? 'py-0.5 px-2.5 text-[11px]' : 'py-1 px-3 text-xs'
                    } uppercase text-slate-800 font-medium`}
                  >
                    {it.name}
                  </td>
                  <td
                    className={`${
                      isDense ? 'py-0.5 px-2.5 text-[11px]' : 'py-1 px-3 text-xs'
                    } text-center font-bold text-slate-900`}
                  >
                    {formatQuantityBR(it.quantity)}
                  </td>
                </tr>
              ))}
              {Array.from({ length: emptyRowsCount }).map((_, i) => (
                <tr key={`empty-${i}`}>
                  <td
                    className={`border-r border-slate-800 ${
                      isDense ? 'py-0.5 px-2.5 text-[11px]' : 'py-1 px-3 text-xs'
                    } text-center text-slate-400`}
                  >
                    -----
                  </td>
                  <td
                    className={`${
                      isDense ? 'py-0.5 px-2.5 text-[11px]' : 'py-1 px-3 text-xs'
                    } text-center text-slate-400`}
                  >
                    -----
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-800 font-bold text-slate-900">
                <td
                  className={`border-r border-slate-800 ${isDense ? 'py-1 px-2.5 text-xs' : 'py-1.5 px-3 text-xs'} text-slate-900`}
                >
                  Total de itens
                </td>
                <td
                  className={`${isDense ? 'py-1 px-2.5 text-xs' : 'py-1.5 px-3 text-xs'} text-center text-slate-900 font-bold`}
                >
                  {formatQuantityBR(totalQuantidade)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. Texto de Declaração */}
      <div
        className={`space-y-1.5 ${isDense ? 'text-[11.5px]' : 'text-[12px]'} text-slate-800 leading-normal text-justify`}
      >
        <p>Nestes termos, os produtos entregues estão de acordo com o contrato assinado.</p>
        <p>
          Declaro ainda que os produtos estão de acordo com os padrões de qualidade aceitos por esta
          instituição, pelos quais concedemos a aceitabilidade, comprometendo-nos a dar a destinação
          final aos produtos recebidos, conforme estabelecido na aquisição da Agricultura Familiar
          para Alimentação Escolar.
        </p>
      </div>

      {/* 5. Bloco de Assinatura ordenado estritamente conforme o modelo oficial */}
      <div className="pt-2 text-center space-y-2">
        {/* a) Data centralizada */}
        <p className={`${isDense ? 'text-xs' : 'text-[12.5px]'} text-slate-900 font-normal`}>
          {formatExtendDateBR(cidadeUf, dataEmissao)}
        </p>

        {/* b) Linha (traço) para assinatura SEM nenhuma identificação abaixo dela */}
        <div className="pt-4 pb-2">
          <div className="mx-auto w-72 sm:w-96 border-t border-slate-800" />
        </div>

        {/* c) Matrícula ou CPF com espaço em branco para preencher */}
        <p className={`${isDense ? 'text-[11px]' : 'text-xs'} text-slate-800 font-normal`}>
          Matrícula ou CPF: ___________________________
        </p>

        {/* d) Identificação do conferente */}
        <p className={`${isDense ? 'text-xs' : 'text-[12.5px]'} font-bold text-slate-900`}>
          Representante da Unidade Escolar (conferente)
        </p>

        {/* e) A ÚLTIMA linha do bloco inferior é o NOME DA ESCOLA */}
        <p
          className={`${isDense ? 'text-xs' : 'text-sm'} font-bold text-slate-900 uppercase tracking-wide`}
        >
          {nomeEscola}
        </p>
      </div>
    </div>
  )
}
