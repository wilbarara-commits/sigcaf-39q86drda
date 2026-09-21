import { useState, useMemo, useEffect } from 'react'
import { useApp } from '@/context/app-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
  MessageSquare,
  Send,
  RotateCcw,
  CheckCircle2,
  Clock,
  Sparkles,
  Phone,
  Copy,
  ExternalLink,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { whatsappService } from '@/services/whatsapp-import'
import type { EnvioWhatsappRecord } from '@/lib/types'

export default function WhatsappCommunication() {
  const { activeCiclo, products, schools, contracts } = useApp()
  const [envios, setEnvios] = useState<EnvioWhatsappRecord[]>([])
  const [loadingEnvios, setLoadingEnvios] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)

  // Itens em abundância e escassez do catálogo
  const itensAbundantes = useMemo(
    () => products.filter((p) => p.disponibilidade === 'abundancia').map((p) => p.name),
    [products],
  )
  const itensEscassos = useMemo(
    () => products.filter((p) => p.disponibilidade === 'escassez').map((p) => p.name),
    [products],
  )

  // Mensagem padrão customizável
  const [customMsg, setCustomMsg] = useState('')

  // Preencher template semanal
  useEffect(() => {
    const abundStr =
      itensAbundantes.length > 0 ? itensAbundantes.join(', ') : 'Diversos itens da horta'
    const escassStr =
      itensEscassos.length > 0 ? itensEscassos.join(', ') : 'Nenhum item com restrição'

    const tpl = `Olá! Mensagem da CooperGestão referente ao *${activeCiclo?.nome || 'Ciclo Semanal'}*.

🥦 *Itens em Abundância (Incentivo de Pedido):* ${abundStr}
⚠️ *Itens em Escassez (Limitar pedido):* ${escassStr}

📋 *Link para formulário/lançamento:* https://coopergestao.app/pedidos
Por favor, envie suas quantidades até o prazo da fase de coleta para garantir a entrega na sua rota!`

    setCustomMsg(tpl)
  }, [activeCiclo, itensAbundantes, itensEscassos])

  // Carregar histórico de envios do ciclo ativo
  const loadEnvios = async () => {
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
  }

  useEffect(() => {
    loadEnvios()
  }, [activeCiclo])

  // Status de envio por escola
  const enviosMap = useMemo(() => {
    const map = new Map<string, EnvioWhatsappRecord>()
    for (const e of envios) {
      map.set(e.escola_id, e)
    }
    return map
  }, [envios])

  const handleEnviarManual = async (escolaId: string, telefone: string, escolaNome: string) => {
    if (!activeCiclo) {
      toast.error('Nenhum ciclo ativo selecionado.')
      return
    }

    const cleanPhone = telefone.replace(/\D/g, '')
    const phoneToUse = cleanPhone.length >= 10 ? `55${cleanPhone}` : ''
    const encoded = encodeURIComponent(`*A/C: ${escolaNome}*\n\n` + customMsg)

    if (phoneToUse) {
      window.open(`https://wa.me/${phoneToUse}?text=${encoded}`, '_blank')
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank')
    }

    try {
      await whatsappService.logEnvio({
        ciclo_id: activeCiclo.id,
        escola_id: escolaId,
        status: 'enviado',
      })
      await loadEnvios()
      toast.success(`Disparo registrado para ${escolaNome}!`)
    } catch (err) {
      console.error('Erro ao registrar envio:', err)
    }
  }

  const handleEnviarTodos = async () => {
    if (!activeCiclo) return
    setSendingAll(true)
    try {
      let count = 0
      for (const sch of schools) {
        await whatsappService.logEnvio({
          ciclo_id: activeCiclo.id,
          escola_id: sch.id,
          status: 'enviado',
        })
        count++
      }
      await loadEnvios()
      toast.success(`Disparo registrado para todas as ${count} escolas!`)
    } catch (err) {
      console.error('Erro ao registrar disparo em massa:', err)
      toast.error('Falha ao registrar disparo para todas as escolas.')
    } finally {
      setSendingAll(false)
    }
  }

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(customMsg)
    toast.success('Texto da mensagem copiado para a área de transferência!')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comunicação Semanal (WhatsApp)</h1>
          <p className="text-muted-foreground">
            Dispare templates informativos sobre disponibilidade de safra e acompanhe envios por
            escola.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleEnviarTodos}
            disabled={sendingAll || !activeCiclo}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Send className="h-4 w-4" /> Enviar para Todos ({schools.length})
          </Button>
        </div>
      </div>

      {/* Editor do Template Semanal */}
      <Card className="border-t-4 border-t-emerald-600">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" /> Template da Mensagem Semanal
              </CardTitle>
              <CardDescription>
                Mensagem gerada com base na safra (abundância), escassez e diretrizes do ciclo *
                {activeCiclo?.nome || 'ativo'}*.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyMessage}
              className="gap-1 text-xs"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar Texto
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={7}
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            className="font-mono text-sm leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
              {itensAbundantes.length} em abundância
            </Badge>
            <Badge variant="outline" className="border-amber-500/40 text-amber-700">
              {itensEscassos.length} em escassez
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Escolas e Status de Envio */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Status de Envio por Instituição
              </CardTitle>
              <CardDescription>
                Acompanhe o registro de mensagens enviadas para cada escola participante e reenvie
                quando necessário.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {envios.filter((e) => e.status === 'enviado').length} / {schools.length} Enviados
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escola</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Contato (WhatsApp)</TableHead>
                  <TableHead>Status de Envio</TableHead>
                  <TableHead>Último Envio</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma escola cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  schools.map((sch) => {
                    const record = enviosMap.get(sch.id)
                    const isEnviado = record?.status === 'enviado'

                    return (
                      <TableRow key={sch.id}>
                        <TableCell className="font-semibold text-primary">{sch.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{sch.route}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {sch.contact || 'Sem telefone'}
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
                            onClick={() => handleEnviarManual(sch.id, sch.contact, sch.name)}
                          >
                            {isEnviado ? (
                              <>
                                <RotateCcw className="h-3.5 w-3.5" /> Reenviar
                              </>
                            ) : (
                              <>
                                <Send className="h-3.5 w-3.5" /> Enviar Manual
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
