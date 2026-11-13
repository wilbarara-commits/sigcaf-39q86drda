import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import pb from '@/lib/pocketbase/client'
import {
  compraDistribuicaoService,
  fornecedoresProdutoService,
} from '@/services/compraDistribuicao'
import type { CompraDistribuicaoRecord } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Cartão "Comprar" da Consolidação para Compras: distribui a quantidade total
 * do produto entre os fornecedores cadastrados para ele (igual ou por
 * percentuais até 125%) e GRAVA a distribuição por ciclo (coleção
 * compra_distribuicao, uma linha por fornecedor participante). Reabrir o
 * cartão carrega as linhas salvas; excluir a distribuição apaga as linhas.
 */

type ModoDistribuicao = 'igual' | 'percentual'

interface CartaoComprarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  produtoId: string
  produtoNome: string
  unidade: string
  quantidadeTotal: number
  cicloId: string
  dataEntrega: string
  chamadaId: string
  onDistribuicaoGravada: () => void
}

const MAX_PERCENTUAL = 125

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

function parsePercent(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace('%', '').replace(',', '.')
  if (!cleaned) return null
  const v = Number(cleaned)
  if (!Number.isFinite(v)) return null
  return Math.round(v * 100) / 100
}

export function CartaoComprarDialog({
  open,
  onOpenChange,
  produtoId,
  produtoNome,
  unidade,
  quantidadeTotal,
  cicloId,
  dataEntrega,
  chamadaId,
  onDistribuicaoGravada,
}: CartaoComprarDialogProps) {
  const { fornecedores } = useApp()
  const { user } = useAuth()
  const { toast } = useToast()

  const [modo, setModo] = useState<ModoDistribuicao>('igual')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [salvos, setSalvos] = useState<CompraDistribuicaoRecord[]>([])
  const [buscaFornecedor, setBuscaFornecedor] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const carregouRef = useRef(false)

  // Carga do cartão: vínculos fornecedor↔produto + linhas salvas do ciclo+produto
  useEffect(() => {
    if (!open || !produtoId || !cicloId) return
    if (carregouRef.current) return
    carregouRef.current = true
    let vivo = true
    setCarregando(true)
    Promise.all([
      fornecedoresProdutoService.listByProduto(produtoId),
      compraDistribuicaoService.listByCicloProduto(cicloId, produtoId),
    ])
      .then(([vinculos, dists]) => {
        if (!vivo) return
        const idsVinculados = new Set(vinculos.map((v) => v.fornecedor_id))
        const idsComLinhas = new Set(dists.map((d) => d.fornecedor_id))
        setSalvos(dists)
        setSelecionados(new Set([...idsVinculados, ...idsComLinhas]))
        const percs: Record<string, string> = {}
        for (const d of dists) {
          if (d.modo === 'percentual' && typeof d.percentual === 'number') {
            percs[d.fornecedor_id] = formatPercent(d.percentual)
          }
        }
        setPercentuais(percs)
        const modos = new Set(dists.map((d) => d.modo))
        setModo(modos.has('percentual') && modos.size === 1 ? 'percentual' : 'igual')
      })
      .catch(() => {
        if (vivo) toast({ title: 'Erro ao carregar distribuição salva', variant: 'destructive' })
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [open, produtoId, cicloId, toast])

  // Reset ao fechar
  useEffect(() => {
    if (open) return
    carregouRef.current = false
    setSelecionados(new Set())
    setPercentuais({})
    setSalvos([])
    setModo('igual')
    setBuscaFornecedor('')
  }, [open])

  const catalogoFornecedores = useMemo(() => {
    const filtrados = fornecedores.filter((f) => {
      if (!buscaFornecedor.trim()) return true
      const termo = buscaFornecedor.trim().toLowerCase()
      return f.nome.toLowerCase().includes(termo)
    })
    return [...filtrados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [fornecedores, buscaFornecedor])

  const totalPercentual = useMemo(() => {
    let total = 0
    for (const id of selecionados) {
      const v = parsePercent(percentuais[id] || '')
      if (v !== null && v > 0) total += v
    }
    return Math.round(total * 100) / 100
  }, [selecionados, percentuais])

  const temPercentuaisPreenchidos = useMemo(
    () => [...selecionados].some((id) => parsePercent(percentuais[id] || '') !== null),
    [selecionados, percentuais],
  )

  const percentualInvalido =
    modo === 'percentual' && (totalPercentual <= 0 || totalPercentual > MAX_PERCENTUAL)

  const calcularQuantidade = (fornecedorId: string): number => {
    if (modo === 'igual') {
      const n = selecionados.size
      if (n === 0 || quantidadeTotal <= 0) return 0
      return Math.round((quantidadeTotal / n) * 100) / 100
    }
    const p = parsePercent(percentuais[fornecedorId] || '')
    if (p === null || p <= 0 || quantidadeTotal <= 0) return 0
    return Math.round((p / 100) * quantidadeTotal * 100) / 100
  }

  const toggleFornecedor = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const excluirDistribuicao = async () => {
    if (salvos.length === 0) return
    setSalvando(true)
    try {
      await compraDistribuicaoService.salvarDistribuicao({
        cicloId,
        dataEntrega,
        chamadaId,
        produtoId,
        unidade,
        criadoPor: user?.id,
        linhas: [],
      })
      setSalvos([])
      setSelecionados(new Set())
      setPercentuais({})
      setModo('igual')
      toast({ title: 'Distribuição excluída' })
      onDistribuicaoGravada()
      onOpenChange(false)
    } catch {
      toast({ title: 'Erro ao excluir a distribuição', variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const gravar = async () => {
    if (selecionados.size === 0) return
    if (percentualInvalido) {
      toast({
        title: 'Percentuais inválidos',
        description: `A soma dos percentuais deve ficar entre 0% e ${MAX_PERCENTUAL}%.`,
        variant: 'destructive',
      })
      return
    }
    setSalvando(true)
    try {
      const linhas = [...selecionados]
        .sort((a, b) => {
          const fa = fornecedores.find((f) => f.id === a)?.nome || ''
          const fb = fornecedores.find((f) => f.id === b)?.nome || ''
          return fa.localeCompare(fb, 'pt-BR')
        })
        .map((fornecedorId) => ({
          fornecedorId,
          quantidade: calcularQuantidade(fornecedorId),
          percentual:
            modo === 'percentual'
              ? (parsePercent(percentuais[fornecedorId] || '') ?? 0)
              : undefined,
          modo,
        }))
      const gravadas = await compraDistribuicaoService.salvarDistribuicao({
        cicloId,
        dataEntrega,
        chamadaId,
        produtoId,
        unidade,
        criadoPor: user?.id,
        linhas,
      })
      setSalvos(gravadas)
      toast({ title: 'Distribuição gravada' })
      onDistribuicaoGravada()
      onOpenChange(false)
    } catch {
      toast({ title: 'Erro ao gravar a distribuição', variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Comprar — {produtoNome}</DialogTitle>
          <DialogDescription>
            Total do recorte:{' '}
            <span className="font-mono font-semibold text-foreground">
              {quantidadeTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </span>{' '}
            {unidade}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={modo === 'igual' ? 'default' : 'outline'}
                onClick={() => setModo('igual')}
              >
                Distribuir igualmente
              </Button>
              <Button
                type="button"
                size="sm"
                variant={modo === 'percentual' ? 'default' : 'outline'}
                onClick={() => setModo('percentual')}
              >
                Por percentual
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">Máx. {MAX_PERCENTUAL}%</span>
            </div>

            <Input
              placeholder="Buscar fornecedor…"
              value={buscaFornecedor}
              onChange={(e) => setBuscaFornecedor(e.target.value)}
            />

            <ScrollArea className="h-[260px] rounded-md border">
              <div className="divide-y">
                {catalogoFornecedores.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhum fornecedor encontrado.
                  </div>
                )}
                {catalogoFornecedores.map((f) => {
                  const marcado = selecionados.has(f.id)
                  return (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={marcado}
                        onCheckedChange={() => toggleFornecedor(f.id)}
                        aria-label={`Selecionar ${f.nome}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{f.nome}</div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0',
                            f.vinculo === 'EXTERNO'
                              ? 'text-amber-600 border-amber-300'
                              : 'text-emerald-700 border-emerald-300',
                          )}
                        >
                          {f.vinculo}
                        </Badge>
                      </div>
                      {modo === 'percentual' && marcado && (
                        <div className="w-24 flex items-center gap-1">
                          <Input
                            className="h-8 text-right text-sm"
                            inputMode="decimal"
                            value={percentuais[f.id] ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              setPercentuais((prev) => ({ ...prev, [f.id]: e.target.value }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )}
                      {marcado && (
                        <span className="w-24 text-right text-sm font-mono">
                          {calcularQuantidade(f.id).toLocaleString('pt-BR', {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            {modo === 'percentual' && (
              <div
                className={cn(
                  'text-xs font-medium',
                  percentualInvalido ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                Soma dos percentuais: {formatPercent(totalPercentual)}%{' '}
                {percentualInvalido && `(máx. ${MAX_PERCENTUAL}%)`}
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {salvos.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              onClick={excluirDistribuicao}
              disabled={salvando}
            >
              Excluir distribuição
            </Button>
          )}
          <Button
            type="button"
            onClick={gravar}
            disabled={salvando || selecionados.size === 0 || percentualInvalido}
          >
            {salvando ? 'Gravando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
