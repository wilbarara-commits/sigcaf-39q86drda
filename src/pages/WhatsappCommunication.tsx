import { useState, useMemo, useEffect, useCallback } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
  MessageSquare,
  Send,
  RotateCcw,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Users,
  Link as LinkIcon,
  Loader2,
  Filter,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { whatsappService } from '@/services/whatsapp-import'
import { tokensFormularioService } from '@/services/tokens-formulario'
import { isPreviewEnvironment, safeOpenWhatsApp } from '@/lib/whatsapp'
import { isVinculoElegivelParaTokenFormulario, getColetaPorEfetivo } from '@/lib/coletaPor'
import type { EnvioWhatsappRecord, TokenFormularioRecord } from '@/lib/types'

export default function WhatsappCommunication() {
  const { activeCiclo, products, schools, contracts, contractSchools } = useApp()
  const [selectedContratoFilter, setSelectedContratoFilter] = useState<string>('todos')
  const [envios, setEnvios] = useState<EnvioWhatsappRecord[]>([])
  const [tokensMap, setTokensMap] = useState<Map<string, TokenFormularioRecord>>(new Map())
  const [loadingEnvios, setLoadingEnvios] = useState(false)
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const isPreview = useMemo(() => isPreviewEnvironment(), [])

  // Mensagem padrão customizável com o placeholder oficial
  const [customMsg, setCustomMsg] = useState('')

  // Preencher template semanal com produtos de destaque e o placeholder
  useEffect(() => {
    const prodsAbundantes = products
      .filter(
        (p) => p.disponibilidade === 'abundante' || (p.disponibilidade as any) === 'abundancia',
      )
      .map((p) => p.name)
      .slice(0, 5)

    const prodsEscassez = products
      .filter((p) => p.disponibilidade === 'escassez' || p.disponibilidade === 'indisponivel')
      .map((p) => p.name)
      .slice(0, 5)

    const linhaAbundancia =
      prodsAbundantes.length > 0
        ? `🌟 *Produtos em Abundância:* ${prodsAbundantes.join(', ')}\n`
        : ''
    const linhaEscassez =
      prodsEscassez.length > 0
        ? `⚠️ *Itens em Escassez/Indisponíveis neste ciclo:* ${prodsEscassez.join(', ')}\n`
        : ''

    const tpl = `Olá! Mensagem da Cooperativa referente ao *${activeCiclo?.nome || 'Ciclo Semanal'}*.

${linhaAbundancia}${linhaEscassez}📋 *Link exclusivo para preenchimento do pedido:*
[Link do Formulário]

Por favor, envie as quantidades da sua instituição pelo link acima durante o período de coleta para garantir a entrega da sua rota!`

    setCustomMsg(tpl)
  }, [activeCiclo, products])

  // Contratos com status 'Ativo' que possuem escolas com coleta_por EFETIVO = 'formulario'
  // (Generalização R25: não restringe mais fixamente por modalidade no filtro do topo)
  const contratosElegiveisParaFormulario = useMemo(() => {
    return contracts.filter((c) => {
      if (c.status !== 'Ativo' || (c.encerrado_em && c.encerrado_em.trim() !== '')) {
        return false
      }
      // Verificar se possui vínculos em contractSchools elegíveis para formulário
      const links = contractSchools.filter((cs) => cs.contrato_id === c.id)
      if (links.length > 0) {
        return links.some((cs) =>
          isVinculoElegivelParaTokenFormulario({
            vinculo: cs,
            contrato: c,
          }),
        )
      }
      // Fallback: se ainda não houver contractSchools sincronizados, verifica modalidade ou vínculo em c.escolas
      if (c.escolas && c.escolas.length > 0) {
        return c.escolas.some((ce) =>
          isVinculoElegivelParaTokenFormulario({
            vinculo: ce,
            contrato: c,
          }),
        )
      }
      // Se não tem escolas vinculadas, verifica se modalidade padrão geraria 'formulario'
      return getColetaPorEfetivo(null, c.modalidade_pedido) === 'formulario'
    })
  }, [contracts, contractSchools])

  // Lista de itens escola x contrato com coleta_por EFETIVO = "formulario"
  // Unicidade R25: cada escola tem no máx. 1 contrato ativo (logo no máx. 1 token por ciclo).
  // Vínculos encerrados ou contratos inativos NUNCA entram aqui.
  interface EscolaContratoLinha {
    key: string
    escolaId: string
    escolaNome: string
    escolaContato: string
    rotaNome: string
    contratoId: string
    contratoNumero: string
    coletaPorEfetivo: string
    vinculoId?: string
  }

  const escolasContratosList = useMemo<EscolaContratoLinha[]>(() => {
    const linhas: EscolaContratoLinha[] = []
    const targetContratos =
      selectedContratoFilter === 'todos'
        ? contratosElegiveisParaFormulario
        : contratosElegiveisParaFormulario.filter((c) => c.id === selectedContratoFilter)

    for (const contr of targetContratos) {
      // Obter vínculos deste contrato
      const links = contractSchools.filter((cs) => cs.contrato_id === contr.id)
      for (const link of links) {
        // Valida se o vínculo é elegível:
        // 1. Contrato Ativo
        // 2. Vínculo sem encerrado_em
        // 3. coleta_por EFETIVO === 'formulario' (NUNCA 'planilha')
        if (
          !isVinculoElegivelParaTokenFormulario({
            vinculo: link,
            contrato: contr,
          })
        ) {
          continue
        }

        const sch = schools.find((s) => s.id === link.escola_id)
        if (sch) {
          linhas.push({
            key: `${sch.id}_${contr.id}`,
            escolaId: sch.id,
            escolaNome: sch.name,
            escolaContato: sch.contact || '',
            rotaNome: sch.route || 'Sem rota',
            contratoId: contr.id,
            contratoNumero: contr.numero,
            coletaPorEfetivo: getColetaPorEfetivo(link, contr.modalidade_pedido),
            vinculoId: link.id,
          })
        }
      }
    }

    // Se nenhum contrato tiver vínculos cadastrados em contractSchools ainda,
    // fazer fallback pelas escolas cadastradas nos contratos em c.escolas
    if (linhas.length === 0 && targetContratos.length > 0) {
      for (const contr of targetContratos) {
        if (contr.escolas && contr.escolas.length > 0) {
          for (const ce of contr.escolas) {
            if (
              !isVinculoElegivelParaTokenFormulario({
                vinculo: ce,
                contrato: contr,
              })
            ) {
              continue
            }

            const sch = schools.find((s) => s.id === ce.escolaId)
            if (sch && !linhas.some((l) => l.key === `${sch.id}_${contr.id}`)) {
              linhas.push({
                key: `${sch.id}_${contr.id}`,
                escolaId: sch.id,
                escolaNome: sch.name,
                escolaContato: sch.contact || '',
                rotaNome: ce.rotaNome || sch.route || 'Sem rota',
                contratoId: contr.id,
                contratoNumero: contr.numero,
                coletaPorEfetivo: getColetaPorEfetivo(ce, contr.modalidade_pedido),
                vinculoId: ce.id,
              })
            }
          }
        }
      }
    }

    return linhas
  }, [contratosElegiveisParaFormulario, selectedContratoFilter, contractSchools, schools])

  const loadEnvios = useCallback(async () => {
    if (!activeCiclo) return
    setLoadingEnvios(true)
    try {
      const list = await whatsappService.getByCiclo(activeCiclo.id)
      setEnvios(list)
    } catch (err) {
      console.error('Erro ao carregar envios whatsapp:', err)
    } finally {
      setLoadingEnvios(false)
    }
  }, [activeCiclo])

  // Carregar ou pré-gerar tokens para as escolas no ciclo ativo
  const loadTokens = useCallback(async () => {
    if (!activeCiclo) return
    setLoadingTokens(true)
    try {
      const list = await tokensFormularioService.getAllByCiclo(activeCiclo.id)
      // Mapear por chave composta escola_id + contrato_id e também por escola_id
      const map = new Map<string, TokenFormularioRecord>()
      for (const t of list) {
        map.set(`${t.escola_id}:::${t.contrato_id}`, t)
        map.set(t.escola_id, t)
      }
      setTokensMap(map)
    } catch (err) {
      console.error('Erro ao carregar tokens de formulário:', err)
    } finally {
      setLoadingTokens(false)
    }
  }, [activeCiclo])

  useEffect(() => {
    loadEnvios()
    loadTokens()
  }, [loadEnvios, loadTokens])

  /**
   * Helper para obter a URL completa do formulário de uma escola para um contrato elegível específico.
   * REGRA R25: O link só é gerado se o coleta_por EFETIVO do vínculo for 'formulario'
   * e o contrato for 'Ativo' sem encerramento. NUNCA para 'planilha'.
   */
  const getOrGenerateSchoolUrl = async (
    escolaId: string,
    targetContratoId?: string,
  ): Promise<string> => {
    if (!activeCiclo) return window.location.origin + '/formulario/demo'

    // Determinar o contrato elegível da escola
    let resolvedContratoId = targetContratoId
    let targetVinculo = contractSchools.find(
      (cs) =>
        cs.escola_id === escolaId && (!resolvedContratoId || cs.contrato_id === resolvedContratoId),
    )

    if (!resolvedContratoId) {
      // Buscar entre os vínculos ativos elegíveis para token
      for (const cs of contractSchools) {
        if (cs.escola_id !== escolaId) continue
        const contr = contracts.find((c) => c.id === cs.contrato_id)
        if (contr && isVinculoElegivelParaTokenFormulario({ vinculo: cs, contrato: contr })) {
          resolvedContratoId = cs.contrato_id
          targetVinculo = cs
          break
        }
      }

      // Se ainda não achou, fallback em contratosElegiveisParaFormulario
      if (!resolvedContratoId) {
        const fallbackContr = contratosElegiveisParaFormulario.find((c) =>
          c.escolas?.some((e) => e.escolaId === escolaId),
        )
        resolvedContratoId = fallbackContr?.id || contratosElegiveisParaFormulario[0]?.id || ''
      }
    }

    if (!resolvedContratoId) {
      return `${window.location.origin}/formulario/demo`
    }

    const targetContrato = contracts.find((c) => c.id === resolvedContratoId)

    // Se encontramos vínculo e contrato, valida se de fato é elegível
    if (targetContrato) {
      const elegivel = isVinculoElegivelParaTokenFormulario({
        vinculo: targetVinculo,
        contrato: targetContrato,
      })
      if (!elegivel) {
        console.warn(
          `Vínculo da escola ${escolaId} no contrato ${resolvedContratoId} não é elegível para formulário (coleta_por efetivo !== "formulario" ou contrato/vínculo encerrado).`,
        )
        return `${window.location.origin}/formulario/demo`
      }
    }

    const key = `${escolaId}:::${resolvedContratoId}`
    let tokenRec = tokensMap.get(key) || tokensMap.get(escolaId)

    // Se o token existente estiver com contrato diferente, ignorar e criar o correto
    if (tokenRec && tokenRec.contrato_id !== resolvedContratoId) {
      tokenRec = undefined
    }

    if (!tokenRec) {
      try {
        tokenRec = await tokensFormularioService.getOrCreateToken(
          escolaId,
          resolvedContratoId,
          activeCiclo.id,
          activeCiclo.data_fim,
          {
            vinculo: targetVinculo,
            contrato: targetContrato,
          },
        )
        setTokensMap((prev) => {
          const next = new Map(prev)
          next.set(key, tokenRec!)
          next.set(escolaId, tokenRec!)
          return next
        })
      } catch (err) {
        console.error('Erro ao gerar token para escola e contrato:', err)
      }
    }

    const tokenStr = tokenRec?.token || 'token'
    return `${window.location.origin}/formulario/${tokenStr}`
  }

  /**
   * Monta a mensagem real substituindo [Link do Formulário] pelo link da escola
   * Identifica o contrato na mensagem quando especificado.
   */
  const buildMessageForSchool = async (
    escolaId: string,
    escolaNome: string,
    contratoId?: string,
    contratoNumero?: string,
  ): Promise<string> => {
    const schoolFormUrl = await getOrGenerateSchoolUrl(escolaId, contratoId)
    let text = customMsg
    if (text.includes('[Link do Formulário]')) {
      text = text.replace(/\[Link do Formulário\]/g, schoolFormUrl)
    } else {
      // Se o usuário removeu o placeholder, adiciona o link no final
      text = `${text}\n\n📋 *Link do Formulário:* ${schoolFormUrl}`
    }

    // Identificar o contrato na mensagem se informado
    const headerContrato = contratoNumero ? `\n📌 *Contrato:* ${contratoNumero}` : ''
    return `*A/C: ${escolaNome}*${headerContrato}\n\n${text}`
  }

  // Status de envio por escola
  const enviosMap = useMemo(() => {
    const map = new Map<string, EnvioWhatsappRecord>()
    for (const e of envios) {
      map.set(e.escola_id, e)
    }
    return map
  }, [envios])

  const handleEnviarManual = async (
    escolaId: string,
    telefone: string,
    escolaNome: string,
    contratoId?: string,
    contratoNumero?: string,
  ) => {
    if (!activeCiclo) {
      toast.error('Nenhum ciclo ativo selecionado.')
      return
    }

    if (activeCiclo.status === 'fechado') {
      toast.error('Ciclo fechado — abra o próximo ciclo')
      return
    }

    if (activeCiclo.status === 'cancelado') {
      toast.error('Ciclo cancelado')
      return
    }

    const fullMessage = await buildMessageForSchool(
      escolaId,
      escolaNome,
      contratoId,
      contratoNumero,
    )
    const { preview } = await safeOpenWhatsApp({
      phone: telefone,
      text: fullMessage,
      recipientName: escolaNome,
    })

    try {
      await whatsappService.logEnvio({
        ciclo_id: activeCiclo.id,
        escola_id: escolaId,
        status: 'enviado',
      })
      await loadEnvios()
      if (!preview) {
        toast.success(
          `Disparo registrado para ${escolaNome} (${contratoNumero || 'Formulário'}) com link do formulário!`,
        )
      } else {
        toast.success(
          `Envio simulado e registrado para ${escolaNome} (${contratoNumero || 'Formulário'}).`,
        )
      }
    } catch (err) {
      console.error('Erro ao registrar envio:', err)
    }
  }

  const handleEnviarTodos = async () => {
    if (!activeCiclo) return

    if (activeCiclo.status === 'fechado') {
      toast.error('Ciclo fechado — abra o próximo ciclo')
      return
    }

    if (activeCiclo.status === 'cancelado') {
      toast.error('Ciclo cancelado')
      return
    }

    setSendingAll(true)
    try {
      let count = 0
      for (const item of escolasContratosList) {
        // Assegurar token para cada escola e contrato com coleta_por efetivo formulario
        await getOrGenerateSchoolUrl(item.escolaId, item.contratoId)
        await whatsappService.logEnvio({
          ciclo_id: activeCiclo.id,
          escola_id: item.escolaId,
          status: 'enviado',
        })
        count++
      }
      await loadEnvios()

      if (isPreview) {
        // Em preview, o envio em massa registra os envios e avisa claramente sem abrir dezenas de popups bloqueados
        toast.info(
          `Envio em massa registrado para as ${count} escolas. No ambiente de demonstração, os disparos externos para o WhatsApp ficam bloqueados para evitar falha no navegador.`,
          { duration: 6000 },
        )
      } else {
        toast.success(
          `Disparo registrado para todas as ${count} escolas/contratos com seus links únicos!`,
        )
      }
    } catch (err) {
      console.error('Erro ao registrar disparo em massa:', err)
      toast.error('Falha ao registrar disparo para todas as escolas.')
    } finally {
      setSendingAll(false)
    }
  }

  const handleCopySchoolLink = async (
    escolaId: string,
    escolaNome: string,
    contratoId?: string,
  ) => {
    const url = await getOrGenerateSchoolUrl(escolaId, contratoId)
    navigator.clipboard.writeText(url)
    toast.success(`Link do formulário copiado para ${escolaNome}!`)
  }

  const handleCopyMessageTemplate = () => {
    navigator.clipboard.writeText(customMsg)
    toast.success('Texto do template copiado para a área de transferência!')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comunicação Semanal (WhatsApp)</h1>
          <p className="text-muted-foreground">
            Dispare templates informativos sobre o ciclo e links únicos do formulário para as
            escolas participantes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleEnviarTodos}
            disabled={sendingAll || !activeCiclo || escolasContratosList.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {sendingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar para Todos ({escolasContratosList.length})
          </Button>
        </div>
      </div>

      {/* Banner informativo quando em ambiente de preview */}
      {isPreview && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-lg p-3 text-sm flex items-start gap-2.5">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Ambiente de Demonstração (Preview):</span>
            <p className="text-xs text-muted-foreground dark:text-amber-300/80">
              A abertura direta de links do WhatsApp (<code>api.whatsapp.com</code> /{' '}
              <code>wa.me</code>) é bloqueada pelo navegador neste domínio. Ao clicar em enviar, o
              sistema registra o envio operacional e copia o link completo para sua área de
              transferência para que você possa testar o conteúdo sem erros. Em produção, os links
              abrirão diretamente.
            </p>
          </div>
        </div>
      )}

      {/* Editor do Template Semanal */}
      <Card className="border-t-4 border-t-emerald-600">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" /> Template da Mensagem Semanal
              </CardTitle>
              <CardDescription>
                Mensagem informativa e diretrizes para o ciclo *{activeCiclo?.nome || 'ativo'}*.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyMessageTemplate}
              className="gap-1 text-xs"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={8}
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            className="font-mono text-sm leading-relaxed"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-2 rounded border">
            <LinkIcon className="h-4 w-4 text-primary shrink-0" />
            <span>
              O placeholder <code>[Link do Formulário]</code> será automaticamente substituído pela
              URL única de cada escola (ex: <code>{window.location.origin}/formulario/f_...</code>)
              ao disparar ou copiar.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Escolas por Coleta via Formulário e Status de Envio */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Disparos por Coleta Formulário
              </CardTitle>
              <CardDescription>
                Links gerados para escolas cujo valor efetivo de <code>coleta_por</code> é{' '}
                <strong>formulario</strong>. Escolas com coleta por planilha da secretaria não geram
                formulário público.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedContratoFilter} onValueChange={setSelectedContratoFilter}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="Filtrar por Contrato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Contratos</SelectItem>
                    {contratosElegiveisParaFormulario.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.numero}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="secondary">
                {envios.filter((e) => e.status === 'enviado').length} /{' '}
                {escolasContratosList.length} Disparados
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escola</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Contato (WhatsApp)</TableHead>
                  <TableHead>Link do Formulário</TableHead>
                  <TableHead>Status de Envio</TableHead>
                  <TableHead>Último Envio</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {escolasContratosList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum vínculo ativo com coleta por formulário encontrado. (Contratos ou
                      escolas com coleta por planilha são atendidos por importação de arquivo da
                      secretaria).
                    </TableCell>
                  </TableRow>
                ) : (
                  escolasContratosList.map((item) => {
                    const record = enviosMap.get(item.escolaId)
                    const tokenRec =
                      tokensMap.get(`${item.escolaId}:::${item.contratoId}`) ||
                      (tokensMap.get(item.escolaId)?.contrato_id === item.contratoId
                        ? tokensMap.get(item.escolaId)
                        : undefined)
                    const isEnviado = record?.status === 'enviado'

                    return (
                      <TableRow key={item.key}>
                        <TableCell className="font-semibold text-primary">
                          {item.escolaNome}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {item.contratoNumero}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.rotaNome}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {item.escolaContato || 'Sem telefone'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {tokenRec ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1 px-2 text-primary hover:bg-primary/10"
                                onClick={() =>
                                  handleCopySchoolLink(
                                    item.escolaId,
                                    item.escolaNome,
                                    item.contratoId,
                                  )
                                }
                                title={`Copiar link do formulário (${item.contratoNumero})`}
                              >
                                <Copy className="h-3 w-3" />
                                <span className="font-mono text-[11px] truncate max-w-[130px]">
                                  /formulario/{tokenRec.token.substring(0, 8)}...
                                </span>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1 px-2 text-muted-foreground"
                                onClick={() =>
                                  handleCopySchoolLink(
                                    item.escolaId,
                                    item.escolaNome,
                                    item.contratoId,
                                  )
                                }
                              >
                                <LinkIcon className="h-3 w-3" />
                                <span>Gerar Link</span>
                              </Button>
                            )}
                            {tokenRec && (
                              <a
                                href={`/formulario/${tokenRec.token}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                title="Abrir formulário em nova aba"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isEnviado ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Enviado
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground text-xs gap-1"
                            >
                              <Clock className="h-3 w-3" /> Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {record?.enviado_em
                            ? new Date(record.enviado_em).toLocaleString('pt-BR')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={isEnviado ? 'outline' : 'default'}
                            className={
                              isEnviado
                                ? 'gap-1 text-xs'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs'
                            }
                            onClick={() =>
                              handleEnviarManual(
                                item.escolaId,
                                item.escolaContato,
                                item.escolaNome,
                                item.contratoId,
                                item.contratoNumero,
                              )
                            }
                          >
                            {isEnviado ? (
                              <>
                                <RotateCcw className="h-3.5 w-3.5" /> Reenviar
                              </>
                            ) : (
                              <>
                                <Send className="h-3.5 w-3.5" /> Enviar WhatsApp
                              </>
                            )}
                          </Button>
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
    </div>
  )
}
