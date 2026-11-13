import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Check, ChevronDown, Copy, MessageCircle } from 'lucide-react'
import type { CompraDistribuicaoRecord } from '@/lib/types'
import { useApp } from '@/context/app-context'
import { formatarDataEntrega } from '@/lib/datasEntrega'
import {
  safeOpenWhatsApp,
  buildPedidoCompraWhatsAppMessage,
  normalizeWhatsAppPhone,
} from '@/lib/whatsapp'
import { cn } from '@/lib/utils'

/**
 * Pedidos de compra por fornecedor — seção colapsável abaixo da tabela da
 * Consolidação para Compras. Agrupa as linhas GRAVADAS (coleção
 * compra_distribuicao) do recorte atual (data de entrega + chamada) por
 * fornecedor: um cartão por fornecedor com os produtos e o total de itens.
 * Cada cartão tem botão "WhatsApp" (abre wa.me com a mensagem do pedido) e
 * "Copiar mensagem" (mesma mensagem na área de transferência).
 */

interface PedidosCompraSectionProps {
  distribuicao: CompraDistribuicaoRecord[]
  chamadaNome: string
  dataEntrega: string
  carregada: boolean
}

function formatQty(value: number): string {
  return (value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export default function PedidosCompraSection({
  distribuicao,
  chamadaNome,
  dataEntrega,
  carregada,
}: PedidosCompraSectionProps) {
  const { fornecedores, products } = useApp()
  const [aberta, setAberta] = useState(true)
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  const grupos = useMemo(() => {
    const porFornecedor = new Map<
      string,
      {
        fornecedorId: string
        fornecedorNome: string
        vinculo: string
        whatsapp: string
        itens: Array<{
          produtoId: string
          produto: string
          quantidade: number
          unidade: string
        }>
      }
    >()
    for (const d of distribuicao) {
      if (!d.fornecedor_id || d.quantidade <= 0) continue
      const f = fornecedores.find((x) => x.id === d.fornecedor_id)
      const p = products.find((x) => x.id === d.produto_id)
      if (!p) continue // produto sem cadastro no recorte: fora
      let grupo = porFornecedor.get(d.fornecedor_id)
      if (!grupo) {
        grupo = {
          fornecedorId: d.fornecedor_id,
          fornecedorNome: f?.nome || d.fornecedor_id,
          vinculo: f?.vinculo || 'EXTERNO',
          whatsapp: f?.whatsapp || '',
          itens: [],
        }
        porFornecedor.set(d.fornecedor_id, grupo)
      }
      const existente = grupo.itens.find((it) => it.produtoId === d.produto_id)
      if (existente) {
        // Mesmo produto em mais de uma linha gravada: soma as quantidades
        existente.quantidade += d.quantidade
        continue
      }
      grupo.itens.push({
        produtoId: d.produto_id,
        produto: p.name,
        quantidade: d.quantidade,
        unidade: d.unidade || p.unit || '',
      })
    }
    for (const grupo of porFornecedor.values()) {
      grupo.itens.sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'))
    }
    return [...porFornecedor.values()].sort((a, b) =>
      a.fornecedorNome.localeCompare(b.fornecedorNome, 'pt-BR'),
    )
  }, [distribuicao, fornecedores, products])

  const abrirWhatsApp = async (fornecedorId: string) => {
    const grupo = grupos.find((g) => g.fornecedorId === fornecedorId)
    if (!grupo) return
    if (!normalizeWhatsAppPhone(grupo.whatsapp)) return
    const mensagem = buildPedidoCompraWhatsAppMessage({
      fornecedorNome: grupo.fornecedorNome,
      vinculo: grupo.vinculo,
      dataEntrega,
      chamadaNome,
      itens: grupo.itens.map((it) => ({
        nome: it.produto,
        quantidade: it.quantidade,
        unidade: it.unidade,
      })),
    })
    // safeOpenWhatsApp: abre wa.me em nova aba e, em preview, copia o link com
    // aviso (mesmo comportamento dos demais fluxos de WhatsApp do sistema).
    await safeOpenWhatsApp({
      phone: grupo.whatsapp,
      text: mensagem,
      recipientName: grupo.fornecedorNome,
    })
  }

  const copiarMensagem = async (fornecedorId: string) => {
    const grupo = grupos.find((g) => g.fornecedorId === fornecedorId)
    if (!grupo) return
    const mensagem = buildPedidoCompraWhatsAppMessage({
      fornecedorNome: grupo.fornecedorNome,
      vinculo: grupo.vinculo,
      dataEntrega,
      chamadaNome,
      itens: grupo.itens.map((it) => ({
        nome: it.produto,
        quantidade: it.quantidade,
        unidade: it.unidade,
      })),
    })
    try {
      await navigator.clipboard.writeText(mensagem)
    } catch {
      // Área de transferência indisponível (permissão/ambiente): falha silenciosa
      return
    }
    setCopiadoId(fornecedorId)
    window.setTimeout(() => {
      setCopiadoId((cur) => (cur === fornecedorId ? null : cur))
    }, 2000)
  }

  return (
    <Collapsible open={aberta} onOpenChange={setAberta}>
      <Card>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={aberta}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div>
                <CardTitle className="text-base font-semibold">
                  Pedidos de compra por fornecedor
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Agrupamento das distribuições gravadas
                  {dataEntrega ? ` para ${formatarDataEntrega(dataEntrega)}` : ''}
                  {chamadaNome ? ` · ${chamadaNome}` : ''}.
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200',
                  aberta && 'rotate-180',
                )}
              />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {!carregada ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : grupos.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum pedido de compra gravado para este recorte. Use o botão “Comprar” na tabela
                acima para distribuir um produto entre os fornecedores.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {grupos.map((g) => {
                  const semTelefone = !normalizeWhatsAppPhone(g.whatsapp)
                  return (
                    <Card key={g.fornecedorId} className="border">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold">
                          <span className="truncate">{g.fornecedorNome}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0 shrink-0',
                              g.vinculo === 'EXTERNO'
                                ? 'text-amber-600 border-amber-300'
                                : 'text-emerald-700 border-emerald-300',
                            )}
                          >
                            {g.vinculo}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-1">
                        {g.itens.map((it, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{it.produto}</span>
                            <span className="font-mono whitespace-nowrap">
                              {formatQty(it.quantidade)} {it.unidade}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 border-t pt-1.5 text-xs font-medium">
                          <span>Total de itens</span>
                          <span>{g.itens.length}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1.5">
                          <Button
                            size="sm"
                            disabled={semTelefone}
                            title={
                              semTelefone
                                ? 'Fornecedor sem telefone cadastrado — cadastre o WhatsApp no cadastro de Fornecedores'
                                : 'Abrir WhatsApp com a mensagem do pedido'
                            }
                            aria-label={`Enviar pedido por WhatsApp para ${g.fornecedorNome}`}
                            onClick={() => abrirWhatsApp(g.fornecedorId)}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                          >
                            <MessageCircle className="mr-1.5 h-4 w-4" />
                            WhatsApp
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Copiar mensagem do pedido para ${g.fornecedorNome}`}
                            onClick={() => copiarMensagem(g.fornecedorId)}
                          >
                            {copiadoId === g.fornecedorId ? (
                              <>
                                <Check className="mr-1.5 h-4 w-4 text-green-600" />
                                Copiado!
                              </>
                            ) : (
                              <>
                                <Copy className="mr-1.5 h-4 w-4" />
                                Copiar mensagem
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
