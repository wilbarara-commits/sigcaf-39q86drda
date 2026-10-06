import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { EntregaRegistroRecord } from '@/lib/types'
import {
  CheckCircle2,
  Clock,
  User,
  FileText,
  School,
  FileCheck2,
  Camera,
  Maximize2,
  Calendar,
  X,
  FileBadge,
  UserCheck,
} from 'lucide-react'

export interface DeliveryDetailsData {
  registro?: EntregaRegistroRecord | null
  escolaNome: string
  escolaEndereco?: string
  contratoNumero?: string
  motoristaNome?: string
  ordem?: number
}

export interface DeliveryDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: DeliveryDetailsData | null
}

/**
 * Formata um carimbo ISO para HH:mm ou "DD/MM/AAAA às HH:mm" se for de outro dia
 */
function formatDataHora(isoString?: string | null): {
  hora: string
  dataCompleta?: string
  isOutroDia: boolean
} {
  if (!isoString) {
    return { hora: '—', isOutroDia: false }
  }

  try {
    const data = new Date(isoString)
    if (isNaN(data.getTime())) {
      return { hora: '—', isOutroDia: false }
    }

    const agora = new Date()
    const isOutroDia =
      data.getFullYear() !== agora.getFullYear() ||
      data.getMonth() !== agora.getMonth() ||
      data.getDate() !== agora.getDate()

    const horaFormatada = data.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const dataFormatada = data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    return {
      hora: horaFormatada,
      dataCompleta: `${dataFormatada} às ${horaFormatada}`,
      isOutroDia,
    }
  } catch {
    return { hora: '—', isOutroDia: false }
  }
}

export function DeliveryDetailsDialog({ open, onOpenChange, data }: DeliveryDetailsDialogProps) {
  const [fotoFullscreenOpen, setFotoFullscreenOpen] = useState(false)

  if (!data) return null

  const { registro, escolaNome, escolaEndereco, contratoNumero, motoristaNome, ordem } = data

  // Horários reais de coleta no dispositivo do motorista (independentes da sincronização)
  const chegadaInfo = formatDataHora(registro?.chegada_em)
  const confirmacaoInfo = formatDataHora(registro?.confirmado_em)

  // Motorista que registrou: expand do registro > motoristaNome passado > fallback
  const nomeMotoristaEfetivo = registro?.expand?.motorista_id?.nome || motoristaNome || null

  // Imagens (assinatura e foto)
  const assinaturaUrl = registro?.assinatura || null
  const fotoUrl = registro?.foto || null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-bold flex items-center gap-2 flex-wrap">
                  <span>Dados da Entrega</span>
                  {ordem !== undefined && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      Parada #{ordem}
                    </Badge>
                  )}
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[10px] px-1.5 py-0 font-medium">
                    Somente leitura
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground truncate">
                  Comprovante e registros da entrega realizada na escola
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Bloco 1: Escola e Contrato */}
            <div className="p-3 bg-muted/40 border rounded-lg space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <School className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {escolaNome}
                  </span>
                </div>
                {contratoNumero ? (
                  <Badge
                    variant="outline"
                    className="border-primary/40 text-primary font-mono text-[10px] shrink-0"
                    title={`Contrato: ${contratoNumero}`}
                  >
                    <FileBadge className="h-3 w-3 mr-1" />
                    {contratoNumero}
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic shrink-0">
                    Sem contrato
                  </span>
                )}
              </div>
              {escolaEndereco ? (
                <p className="text-[11px] text-muted-foreground pl-5.5 leading-snug">
                  {escolaEndereco}
                </p>
              ) : null}
            </div>

            {/* Bloco 2: Horários reais (Chegada e Confirmação) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                  <Clock className="h-3.5 w-3.5 text-sky-600" />
                  <span>Chegada na Escola</span>
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {chegadaInfo.isOutroDia ? chegadaInfo.dataCompleta : chegadaInfo.hora}
                </div>
                {chegadaInfo.isOutroDia && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Registro em data anterior</span>
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Confirmação da Entrega</span>
                </div>
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {confirmacaoInfo.isOutroDia ? confirmacaoInfo.dataCompleta : confirmacaoInfo.hora}
                </div>
                {confirmacaoInfo.isOutroDia && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Registro em data anterior</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bloco 3: Motorista que transportou/entregou */}
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border rounded-lg flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary shrink-0" />
                <span className="text-muted-foreground">Motorista:</span>
              </div>
              <span className="font-semibold text-foreground">
                {nomeMotoristaEfetivo || (
                  <span className="text-muted-foreground font-normal italic">Não informado</span>
                )}
              </span>
            </div>

            {/* Bloco 3.1: Responsável pelo recebimento na escola (quando informado) */}
            {(registro?.responsavel_nome || registro?.responsavel_cpf) && (
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border rounded-lg space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-medium text-[11px]">Recebido por:</span>
                </div>
                <div className="pl-6 text-foreground font-semibold text-xs flex items-center gap-2 flex-wrap">
                  {registro.responsavel_nome && <span>{registro.responsavel_nome}</span>}
                  {registro.responsavel_nome && registro.responsavel_cpf && (
                    <span className="text-muted-foreground font-normal">—</span>
                  )}
                  {registro.responsavel_cpf && (
                    <span className="font-mono text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border">
                      CPF: {registro.responsavel_cpf}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Bloco 4: Assinatura do Responsável */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                <FileCheck2 className="h-4 w-4 text-emerald-600" />
                <span>Assinatura do Responsável</span>
              </div>

              {assinaturaUrl ? (
                <div className="p-3 bg-white border rounded-lg flex flex-col items-center justify-center min-h-[120px] shadow-2xs">
                  <img
                    src={assinaturaUrl}
                    alt="Assinatura do Responsável"
                    className="max-h-40 max-w-full object-contain"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">
                    Assinado digitalmente na tela do celular
                  </span>
                </div>
              ) : (
                <div className="p-4 bg-muted/20 border border-dashed rounded-lg text-center text-muted-foreground italic">
                  Sem assinatura
                </div>
              )}
            </div>

            {/* Bloco 5: Foto do Material Entregue */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <Camera className="h-4 w-4 text-blue-600" />
                  <span>Foto do Material Entregue</span>
                </div>
                {fotoUrl && (
                  <span className="text-[10px] text-muted-foreground">
                    Clique na foto para ampliar
                  </span>
                )}
              </div>

              {fotoUrl ? (
                <button
                  type="button"
                  onClick={() => setFotoFullscreenOpen(true)}
                  className="group relative w-full h-44 rounded-lg overflow-hidden border border-border bg-slate-950 flex items-center justify-center cursor-pointer transition focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  title="Clique para ver a foto em tela cheia"
                >
                  <img
                    src={fotoUrl}
                    alt="Foto do Material Entregue"
                    className="max-h-full max-w-full object-contain group-hover:scale-[1.02] transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-semibold backdrop-blur-[1px]">
                    <Maximize2 className="h-4 w-4" />
                    <span>Ver em tela cheia</span>
                  </div>
                </button>
              ) : (
                <div className="p-4 bg-muted/20 border border-dashed rounded-lg text-center text-muted-foreground italic">
                  Sem foto
                </div>
              )}
            </div>

            {/* Bloco 6: Comentários / Observação do Motorista */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                <FileText className="h-4 w-4 text-amber-600" />
                <span>Observação do Motorista</span>
              </div>
              {registro?.observacao && registro.observacao.trim() ? (
                <div className="p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {registro.observacao.trim()}
                </div>
              ) : (
                <div className="p-3 bg-muted/20 border border-dashed rounded-lg text-center text-muted-foreground italic">
                  Nenhuma observação registrada
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Tela Cheia para a Foto do Material */}
      {fotoUrl && (
        <Dialog open={fotoFullscreenOpen} onOpenChange={setFotoFullscreenOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl p-2 bg-slate-950 border-slate-800 text-white">
            <DialogHeader className="p-2 pb-0 flex flex-row items-center justify-between">
              <div>
                <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                  <Camera className="h-4 w-4 text-blue-400" />
                  Foto do Material Entregue — {escolaNome}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Visualização ampliada do registro de entrega
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="relative flex items-center justify-center p-2 min-h-[300px] max-h-[80vh] overflow-hidden">
              <img
                src={fotoUrl}
                alt="Foto do Material Entregue em tela cheia"
                className="max-h-[78vh] max-w-full object-contain rounded"
              />
            </div>

            <DialogFooter className="p-2 pt-0 sm:justify-between items-center">
              <span className="text-[11px] text-slate-400">
                {confirmacaoInfo.dataCompleta
                  ? `Confirmada em ${confirmacaoInfo.dataCompleta}`
                  : ''}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFotoFullscreenOpen(false)}
                className="text-xs bg-slate-900 text-white border-slate-700 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
