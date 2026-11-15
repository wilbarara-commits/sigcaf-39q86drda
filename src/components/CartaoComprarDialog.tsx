import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import {
  compraDistribuicaoService,
  compraConfigService,
  fornecedoresProdutoService,
  PERCENTUAL_MAXIMO_PADRAO,
} from '@/services/compraDistribuicao'
import type { CompraDistribuicaoRecord, FornecedorProdutoRecord } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Cartão "Comprar" da Consolidação para Compras: distribui a quantidade total
 * do produto entre os fornecedores da LISTA DO PRODUTO (vínculo persistente da
 * coleção fornecedores_produto — incluídos via dropdown e removidos pela
 * lixeira). O percentual máximo (padrão 125%) é editável e persistido por
 * ciclo+produto (coleção compra_config). "Distribuir igualmente" divide o
 * MÁXIMO entre os selecionados; percentuais ficam editáveis nos dois modos e
 * Total Comprado / % Comprado atualizam em tempo real. GRAVA a distribuição
 * por ciclo (coleção compra_distribuicao, uma linha por fornecedor).
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

function formatQty(value: number): string {
  return (value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
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
  const [vinculos, setVinculos] = useState<FornecedorProdutoRecord[]>([])
  const [maxPercentual, setMaxPercentual] = useState(PERCENTUAL_MAXIMO_PADRAO)
  const [maxInput, setMaxInput] = useState(String(PERCENTUAL_MAXIMO_PADRAO))
  const [dropdownSel, setDropdownSel] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const carregouRef = useRef(false)

  // Carga do cartão: vínculos fornecedor↔produto + linhas salvas + percentual
  // máximo salvo (por ciclo+produto, padrão 125%)
  useEffect(() => {
    if (!open || !produtoId || !cicloId) return
    if (carregouRef.current) return
    carregouRef.current = true
    let vivo = true
    setCarregando(true)
    Promise.all([
      fornecedoresProdutoService.listByProduto(produtoId),
      compraDistribuicaoService.listByCicloProduto(cicloId, produtoId),
      compraConfigService.getPercentualMaximo(cicloId, produtoId),
    ])
      .then(([vinculosCarregados, dists, maxSalvo]) => {
        if (!vivo) return
        const idsVinculados = new Set(vinculosCarregados.map((v) => v.fornecedor_id))
        const idsComLinhas = new Set(dists.map((d) => d.fornecedor_id))
        const todos = new Set([...idsVinculados, ...idsComLinhas])
        setSalvos(dists)
        setVinculos(vinculosCarregados)
        setSelecionados(todos)
        setMaxPercentual(maxSalvo)
        setMaxInput(formatPercent(maxSalvo))
        // Percentuais salvos (gravados em ambos os modos); quem não tem valor
        // recebe a divisão igual do máximo.
        const percs: Record<string, string> = {}
        for (const d of dists) {
          if (typeof d.percentual === 'number' && d.percentual > 0) {
            percs[d.fornecedor_id] = formatPercent(d.percentual)
          }
        }
        const idsSemPerc = [...todos].filter((id) => !percs[id])
        const partesIguais = formatPercent(Math.round((maxSalvo / todos.size) * 100) / 100)
        for (const id of idsSemPerc) percs[id] = todos.size > 0 ? partesIguais : ''
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
    setVinculos([])
    setModo('igual')
    setMaxPercentual(PERCENTUAL_MAXIMO_PADRAO)
    setMaxInput(String(PERCENTUAL_MAXIMO_PADRAO))
    setDropdownSel('')
  }, [open])

  // Lista do produto (vínculo persistente) + fornecedores vindos só de linhas
  // gravadas de versões anteriores, em ordem alfabética
  const listaProduto = useMemo(() => {
    const ids = new Set(vinculos.map((v) => v.fornecedor_id))
    for (const s of salvos) {
      if (s.fornecedor_id) ids.add(s.fornecedor_id)
    }
    return [...ids]
      .map((id) => fornecedores.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [vinculos, salvos, fornecedores])

  // Dropdown: TODOS os fornecedores em ordem alfabética (exclui os já na lista)
  const dropdownFornecedores = useMemo(
    () =>
      [...fornecedores]
        .filter((f) => !listaProduto.some((p) => p.id === f.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [fornecedores, listaProduto],
  )

  const totalPercentual = useMemo(() => {
    let total = 0
    for (const id of selecionados) {
      const v = parsePercent(percentuais[id] || '')
      if (v !== null && v > 0) total += v
    }
    return Math.round(total * 100) / 100
  }, [selecionados, percentuais])

  // Total Comprado e % Comprado em TEMPO REAL: derivam dos percentuais atuais
  // da tela (não das linhas gravadas)
  const totalCompradoAtual = useMemo(
    () => Math.round((totalPercentual / 100) * quantidadeTotal * 100) / 100,
    [totalPercentual, quantidadeTotal],
  )
  const pctCompradoAtual = totalPercentual

  const percentualInvalido = totalPercentual <= 0 || totalPercentual > maxPercentual

  const calcularQuantidade = (fornecedorId: string): number => {
    const p = parsePercent(percentuais[fornecedorId] || '')
    if (p === null || p <= 0 || quantidadeTotal <= 0) return 0
    return Math.round((p / 100) * quantidadeTotal * 100) / 100
  }

  const aplicarDistribuicaoIgual = () => {
    const n = selecionados.size
    if (n === 0) return
    const parte = formatPercent(Math.round((maxPercentual / n) * 100) / 100)
    const next: Record<string, string> = {}
    for (const id of selecionados) next[id] = parte
    setPercentuais(next)
  }

  const gravarMaxPercentual = (valor: number) => {
    compraConfigService
      .salvarPercentualMaximo({ cicloId, produtoId, percentualMaximo: valor, criadoPor: user?.id })
      .catch(() =>
        toast({
          title: 'Erro ao salvar o percentual máximo',
          variant: 'destructive',
        }),
      )
  }

  const handleMaxBlur = () => {
    const v = parsePercent(maxInput)
    if (v !== null && v > 0 && v !== maxPercentual) {
      setMaxPercentual(v)
      gravarMaxPercentual(v)
    } else {
      setMaxInput(formatPercent(maxPercentual))
    }
  }

  // Dropdown → INCLUI o fornecedor na lista do produto (vínculo persistente)
  const incluirFornecedor = async (fornecedorId: string) => {
    setDropdownSel('')
    if (!fornecedorId || listaProduto.some((f) => f.id === fornecedorId)) return
    const nome = fornecedores.find((f) => f.id === fornecedorId)?.nome || ''
    try {
      const vinculo = await fornecedoresProdutoService.create(fornecedorId, produtoId)
      setVinculos((prev) => [...prev, vinculo])
    } catch {
      // Vínculo pode já existir (índice único) — segue com inclusão local
      setVinculos((prev) => [
        ...prev,
        { id: `local-${fornecedorId}`, fornecedor_id: fornecedorId, produto_id: produtoId },
      ])
    }
    // Entra na compra marcado; percentual: divisão igual do máximo quando a
    // lista ainda não tem percentuais, senão 0 para edição manual
    const jaTemPerc = [...selecionados].some((id) => parsePercent(percentuais[id] || '') !== null)
    setSelecionados((prev) => new Set(prev).add(fornecedorId))
    setPercentuais((prev) => ({
      ...prev,
      [fornecedorId]: jaTemPerc ? '' : formatPercent(Math.round(maxPercentual * 100) / 100),
    }))
    if (nome) toast({ title: `${nome} incluído na lista do produto` })
  }

  // Lixeira → REMOVE o fornecedor da lista do produto (apaga o vínculo
  // persistente) e o tira da compra atual
  const removerVinculo = async (fornecedorId: string) => {
    const vinculo = vinculos.find((v) => v.fornecedor_id === fornecedorId)
    if (vinculo) {
      try {
        await fornecedoresProdutoService.delete(vinculo.id)
      } catch {
        toast({ title: 'Erro ao remover o fornecedor da lista', variant: 'destructive' })
        return
      }
    }
    setVinculos((prev) => prev.filter((v) => v.fornecedor_id !== fornecedorId))
    setSelecionados((prev) => {
      const next = new Set(prev)
      next.delete(fornecedorId)
      return next
    })
    setPercentuais((prev) => {
      const next = { ...prev }
      delete next[fornecedorId]
      return next
    })
    const nome = fornecedores.find((f) => f.id === fornecedorId)?.nome || 'Fornecedor'
    toast({ title: `${nome} removido da lista do produto` })
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
        description: `A soma dos percentuais deve ficar entre 0% e ${formatPercent(maxPercentual)}%.`,
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
          percentual: parsePercent(percentuais[fornecedorId] || '') ?? 0,
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Comprar — {produtoNome}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span>
                Total Pedido:{' '}
                <span className="font-mono font-semibold text-foreground">
                  {formatQty(quantidadeTotal)}
                </span>{' '}
                {unidade}
              </span>
              <span>
                Total Comprado:{' '}
                <span
                  className={cn(
                    'font-mono font-semibold',
                    totalCompradoAtual > 0 ? 'text-emerald-700' : 'text-muted-foreground',
                  )}
                >
                  {formatQty(totalCompradoAtual)}
                </span>{' '}
                {unidade}
              </span>
              <span>
                % Comprado:{' '}
                <span
                  className={cn(
                    'font-mono font-semibold',
                    pctCompradoAtual > maxPercentual
                      ? 'text-destructive'
                      : pctCompradoAtual > 0
                        ? 'text-emerald-700'
                        : 'text-muted-foreground',
                  )}
                >
                  {formatPercent(pctCompradoAtual)}%
                </span>
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={modo === 'igual' ? 'default' : 'outline'}
                onClick={() => {
                  setModo('igual')
                  aplicarDistribuicaoIgual()
                }}
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
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                Máx. (%)
                <Input
                  className="h-8 w-20 text-right text-sm"
                  inputMode="decimal"
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  onBlur={handleMaxBlur}
                  aria-label="Percentual máximo"
                />
              </label>
            </div>

            {/* Dropdown: TODOS os fornecedores em ordem alfabética — selecionar
                INCLUI na lista do produto (vínculo persistente) */}
            <div className="flex items-center gap-2">
              <Select value={dropdownSel} onValueChange={incluirFornecedor}>
                <SelectTrigger className="w-full" aria-label="Buscar fornecedor">
                  <SelectValue placeholder="Buscar fornecedor…" />
                </SelectTrigger>
                <SelectContent>
                  {dropdownFornecedores.length === 0 ? (
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      Todos os fornecedores já estão na lista do produto.
                    </div>
                  ) : (
                    dropdownFornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Lista do produto: checkbox marca quem participa desta compra; */}
            {/* lixeira remove o vínculo persistente do produto */}
            <ScrollArea className="h-[240px] rounded-md border">
              <div className="divide-y">
                {listaProduto.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhum fornecedor na lista deste produto. Use o dropdown acima para incluir — a
                    lista fica salva para as próximas compras.
                  </div>
                )}
                {listaProduto.map((f) => {
                  const marcado = selecionados.has(f.id)
                  return (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={marcado}
                        onCheckedChange={() =>
                          setSelecionados((prev) => {
                            const next = new Set(prev)
                            if (next.has(f.id)) next.delete(f.id)
                            else next.add(f.id)
                            return next
                          })
                        }
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
                      {marcado && (
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
                        <span className="w-20 text-right text-sm font-mono">
                          {formatQty(calcularQuantidade(f.id))}
                        </span>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removerVinculo(f.id)}
                        disabled={salvando}
                        aria-label={`Remover ${f.nome} da lista do produto`}
                        title="Remover da lista do produto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            <div
              className={cn(
                'text-xs font-medium',
                percentualInvalido ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              Soma dos percentuais: {formatPercent(totalPercentual)}%{' '}
              {percentualInvalido && `(máx. ${formatPercent(maxPercentual)}%)`}
            </div>
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
