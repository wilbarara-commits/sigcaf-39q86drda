import React, { useState, useEffect } from 'react'
import type {
  RotaRecord,
  MotoristaRecord,
  RotaDespachoRecord,
  CicloRecord,
  ChamadaRecord,
} from '@/lib/types'
import { rotaDespachosService, buildDriverWhatsAppMessage } from '@/services/rota-despachos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Send,
  RotateCcw,
  Copy,
  Check,
  User,
  Truck,
  ExternalLink,
  Loader2,
  Calendar,
  AlertCircle,
  MessageSquare,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface DespachoMotoristaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rota: RotaRecord | null
  ciclo: CicloRecord | null
  chamada?: ChamadaRecord | null
  totalEntregas: number
  motoristas: MotoristaRecord[]
  despachoAtivo: RotaDespachoRecord | null
  onDespachoSucesso: (despacho: RotaDespachoRecord) => void
  onGerenciarMotoristas: () => void
}

export const DespachoMotoristaModal: React.FC<DespachoMotoristaModalProps> = ({
  open,
  onOpenChange,
  rota,
  ciclo,
  chamada,
  totalEntregas,
  motoristas,
  despachoAtivo,
  onDespachoSucesso,
  onGerenciarMotoristas,
}) => {
  const [selectedMotoristaId, setSelectedMotoristaId] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mensagemPronta, setMensagemPronta] = useState<string>('')

  // Sincroniza o motorista selecionado quando o modal abre ou o despachoAtivo muda
  useEffect(() => {
    if (open && rota) {
      if (despachoAtivo?.motorista_id) {
        setSelectedMotoristaId(despachoAtivo.motorista_id)
      } else if (motoristas.length > 0 && !selectedMotoristaId) {
        // Pré-seleciona o primeiro motorista ativo se houver
        const primeiroAtivo = motoristas.find((m) => m.ativo)
        if (primeiroAtivo) setSelectedMotoristaId(primeiroAtivo.id)
      }

      // Se já houver despacho ativo, reconstrói a mensagem pronta atual
      if (despachoAtivo?.token) {
        const cicloCodigo = ciclo?.nome || (ciclo as any)?.numero || chamada?.chamada
        const msg = buildDriverWhatsAppMessage({
          rotaNome: rota.nome,
          cicloCodigo,
          totalEntregas,
          token: despachoAtivo.token,
        })
        setMensagemPronta(msg)
      } else {
        setMensagemPronta('')
      }
    }
  }, [open, rota, despachoAtivo, motoristas, ciclo, chamada, totalEntregas])

  const handleCopiarMensagem = async () => {
    if (!mensagemPronta) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(mensagemPronta)
      } else {
        // Fallback para textarea selecionado
        const el = document.getElementById('msg-pronta-textarea') as HTMLTextAreaElement
        if (el) {
          el.select()
          document.execCommand('copy')
        }
      }
      setCopied(true)
      toast({
        title: 'Mensagem copiada!',
        description: 'Cole manualmente no WhatsApp do motorista.',
      })
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast({
        title: 'Falha ao copiar',
        description: 'Selecione o texto manualmente e copie (Ctrl+C).',
        variant: 'destructive',
      })
    }
  }

  const handleExecutarDespacho = async (isRedisparo: boolean) => {
    if (!rota) return
    setIsProcessing(true)

    try {
      const novoDespacho = await rotaDespachosService.despacharOuRenovar({
        rotaId: rota.id,
        motoristaId: selectedMotoristaId || undefined,
        cicloId: ciclo?.id,
        chamadaId: chamada?.id || rota.chamada_id,
        isRedisparo,
      })

      const cicloCodigo = ciclo?.nome || (ciclo as any)?.numero || chamada?.chamada
      const msg = buildDriverWhatsAppMessage({
        rotaNome: rota.nome,
        cicloCodigo,
        totalEntregas,
        token: novoDespacho.token,
      })
      setMensagemPronta(msg)

      onDespachoSucesso(novoDespacho)

      toast({
        title: isRedisparo ? 'Rota redisparada!' : 'Rota despachada para o motorista!',
        description: 'Mensagem pronta com o link gerada abaixo. Copie e cole no WhatsApp.',
      })

      // Copia automaticamente após gerar
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(msg)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        }
      } catch {
        /* intentionally ignored */
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao despachar',
        description: err?.message || 'Falha ao gerar despacho do motorista.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDateTime = (iso?: string) => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    } catch {
      return ''
    }
  }

  const jaDespachada = Boolean(despachoAtivo)
  const linkMotorista = despachoAtivo?.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/motorista?token=${despachoAtivo.token}`
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Despacho da Rota para Motorista
          </DialogTitle>
          <DialogDescription className="text-xs">
            Rota <strong>{rota?.nome}</strong> • {totalEntregas} entrega(s)
            {ciclo?.nome
              ? ` • ${ciclo.nome}`
              : (ciclo as any)?.numero
                ? ` • Ciclo ${(ciclo as any).numero}`
                : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Seletor de Motorista */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="motorista-select" className="font-semibold text-foreground">
                Selecione o Motorista da Rota
              </Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onGerenciarMotoristas}
                className="h-auto p-0 text-[11px] text-primary"
              >
                + Gerenciar motoristas
              </Button>
            </div>

            <Select value={selectedMotoristaId} onValueChange={setSelectedMotoristaId}>
              <SelectTrigger id="motorista-select" className="h-9 text-xs">
                <SelectValue placeholder="Selecione um motorista cadastrado..." />
              </SelectTrigger>
              <SelectContent>
                {motoristas.length === 0 ? (
                  <div className="p-2 text-center text-muted-foreground text-xs">
                    Nenhum motorista cadastrado.
                  </div>
                ) : (
                  motoristas.map((m) => (
                    <SelectItem key={m.id} value={m.id} disabled={!m.ativo}>
                      <span className="font-medium">{m.nome}</span>
                      {m.telefone && (
                        <span className="text-muted-foreground ml-1.5">({m.telefone})</span>
                      )}
                      {!m.ativo && (
                        <span className="text-destructive ml-1 text-[10px]">(Inativo)</span>
                      )}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Estado atual do despacho */}
          {jaDespachada && despachoAtivo && (
            <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-300 dark:border-amber-900/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <Badge className="bg-amber-600 text-white text-[10px] px-1.5 py-0">
                    Despachada
                  </Badge>
                  {despachoAtivo.expand?.motorista_id?.nome && (
                    <span>Motorista: {despachoAtivo.expand.motorista_id.nome}</span>
                  )}
                </span>

                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateTime(despachoAtivo.despachado_em)}
                </span>
              </div>

              {despachoAtivo.renovado_em && (
                <p className="text-[10px] text-amber-800 dark:text-amber-300">
                  Último redisparo: {formatDateTime(despachoAtivo.renovado_em)}
                </p>
              )}

              {linkMotorista && (
                <div className="pt-1 flex items-center gap-2">
                  <a
                    href={linkMotorista}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-mono text-[11px] truncate flex-1 flex items-center gap-1"
                    title="Abrir página pública do motorista"
                  >
                    <span>{linkMotorista}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Botões de Ação de Despacho / Redisparo */}
          <div className="flex items-center gap-2">
            {!jaDespachada ? (
              <Button
                type="button"
                disabled={isProcessing}
                onClick={() => handleExecutarDespacho(false)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-9 text-xs gap-1.5 shadow-xs"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Despachando...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Despachar Rota e Gerar Link
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={isProcessing}
                onClick={() => handleExecutarDespacho(true)}
                className="w-full border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-50 h-9 text-xs gap-1.5 font-semibold"
                title="Invalida o token anterior e gera um novo link para o motorista"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Redisparando...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 text-amber-600" /> Redisparar Rota (Renovar
                    Token)
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Bloco da MENSAGEM PRONTA PARA WHATSAPP */}
          {mensagemPronta && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="msg-pronta-textarea"
                  className="font-bold flex items-center gap-1.5 text-foreground"
                >
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  Mensagem Pronta para WhatsApp
                </Label>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleCopiarMensagem}
                  className={`h-7 px-2.5 text-xs gap-1.5 font-bold transition-all ${
                    copied
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copiar Mensagem
                    </>
                  )}
                </Button>
              </div>

              <Textarea
                id="msg-pronta-textarea"
                rows={4}
                readOnly
                value={mensagemPronta}
                className="font-mono text-xs bg-slate-50 dark:bg-slate-900 border text-slate-800 dark:text-slate-200 resize-none select-all"
              />

              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                Clique em <strong>Copiar Mensagem</strong> e cole manualmente na conversa com o
                motorista no WhatsApp.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
