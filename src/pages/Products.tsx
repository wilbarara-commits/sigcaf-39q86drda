import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Search, Plus, Loader2, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { produtosService } from '@/services/produtos'
import {
  DEFAULT_PRODUCT_UNIT,
  DEFAULT_PRODUCT_CATEGORY,
  BASE_PRODUCT_CATEGORIES,
  areCategoriesEqual,
} from '@/lib/productCsvImporter'
import { ProductImportDialog } from '@/components/ProductImportDialog'

export default function Products() {
  const { products, isLoading, refreshData } = useApp()
  const { isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Lista dinâmica consolidada de categorias disponíveis (base + do banco/produtos existentes)
  const availableCategories = useMemo(() => {
    const set = new Map<string, string>() // normalized -> canonical display
    BASE_PRODUCT_CATEGORIES.forEach((c) => {
      set.set(c.toLowerCase(), c)
    })
    products.forEach((p) => {
      if (p.category && p.category.trim()) {
        const trimmed = p.category.trim()
        const norm = trimmed.toLowerCase()
        if (!set.has(norm)) {
          set.set(norm, trimmed)
        }
      }
    })
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [products])

  // Estados de edição de produto (categoria, unidade, disponibilidade, estoque, preço e apelidos)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [editCategoria, setEditCategoria] = useState(DEFAULT_PRODUCT_CATEGORY)
  const [editCustomCategoria, setEditCustomCategoria] = useState('')
  const [editPreco, setEditPreco] = useState('')
  const [editEstoque, setEditEstoque] = useState('')
  const [editUnidade, setEditUnidade] = useState(DEFAULT_PRODUCT_UNIT)
  const [editApelidos, setEditApelidos] = useState('')
  const [editDisponibilidade, setEditDisponibilidade] = useState<
    'normal' | 'escassez' | 'abundancia'
  >('normal')

  // Estado de criação de novo produto
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newCategoria, setNewCategoria] = useState(DEFAULT_PRODUCT_CATEGORY)
  const [newCustomCategoria, setNewCustomCategoria] = useState('')
  const [newUnidade, setNewUnidade] = useState(DEFAULT_PRODUCT_UNIT)
  const [newPreco, setNewPreco] = useState('')
  const [newEstoque, setNewEstoque] = useState('')
  const [newApelidos, setNewApelidos] = useState('')
  const [newDisponibilidade, setNewDisponibilidade] = useState<
    'normal' | 'escassez' | 'abundancia'
  >('normal')

  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase()
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      (p.apelidos && p.apelidos.toLowerCase().includes(term)) ||
      (p.category && p.category.toLowerCase().includes(term))

    const matchesCategory =
      categoryFilter === 'todas' || areCategoriesEqual(p.category, categoryFilter)

    return matchesSearch && matchesCategory
  })

  const handleOpenEdit = (p: any) => {
    setEditingProduct(p)
    setEditCategoria(p.category || DEFAULT_PRODUCT_CATEGORY)
    setEditCustomCategoria('')
    setEditPreco(String(p.price ?? 0))
    setEditEstoque(String(p.stock ?? 0))
    setEditUnidade(p.unit || DEFAULT_PRODUCT_UNIT)
    setEditApelidos(p.apelidos || '')
    setEditDisponibilidade(p.disponibilidade || 'normal')
    setEditDialogOpen(true)
  }

  const handleOpenCreate = () => {
    setNewNome('')
    setNewCategoria(DEFAULT_PRODUCT_CATEGORY)
    setNewCustomCategoria('')
    setNewUnidade(DEFAULT_PRODUCT_UNIT)
    setNewPreco('0')
    setNewEstoque('0')
    setNewApelidos('')
    setNewDisponibilidade('normal')
    setCreateDialogOpen(true)
  }

  const handleSaveProductConfig = async () => {
    if (!editingProduct) return
    const parsedPrice = parseFloat(editPreco.replace(',', '.'))
    const parsedStock = parseInt(editEstoque, 10)

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error('Informe um preço unitário válido.')
      return
    }
    if (isNaN(parsedStock) || parsedStock < 0) {
      toast.error('Informe uma quantidade de estoque válida.')
      return
    }

    const trimmedUnidade = editUnidade.trim() || DEFAULT_PRODUCT_UNIT
    const finalCategoria =
      editCategoria === '__custom__'
        ? editCustomCategoria.trim() || DEFAULT_PRODUCT_CATEGORY
        : editCategoria.trim() || DEFAULT_PRODUCT_CATEGORY

    setIsSubmitting(true)
    try {
      await produtosService.update(editingProduct.id, {
        categoria: finalCategoria,
        preco_unitario: parsedPrice,
        estoque: parsedStock,
        unidade: trimmedUnidade,
        disponibilidade: editDisponibilidade,
        apelidos: editApelidos.trim(),
      })
      toast.success(`Produto "${editingProduct.name}" atualizado com sucesso!`)
      setEditDialogOpen(false)
      await refreshData()
    } catch (err) {
      console.error('Erro ao atualizar produto:', err)
      toast.error('Falha ao atualizar parâmetros do produto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateProduct = async () => {
    const trimmedNome = newNome.trim()
    if (!trimmedNome) {
      toast.error('Informe o nome do produto.')
      return
    }

    const parsedPrice = parseFloat(newPreco.replace(',', '.')) || 0
    const parsedStock = parseInt(newEstoque, 10) || 0
    const finalCategoria =
      newCategoria === '__custom__'
        ? newCustomCategoria.trim() || DEFAULT_PRODUCT_CATEGORY
        : newCategoria.trim() || DEFAULT_PRODUCT_CATEGORY

    setIsSubmitting(true)
    try {
      await produtosService.create({
        nome: trimmedNome,
        categoria: finalCategoria,
        unidade: newUnidade.trim() || DEFAULT_PRODUCT_UNIT,
        preco_unitario: parsedPrice,
        estoque: parsedStock,
        disponibilidade: newDisponibilidade,
        apelidos: newApelidos.trim(),
      })
      toast.success(`Produto "${trimmedNome}" cadastrado com sucesso!`)
      setCreateDialogOpen(false)
      await refreshData()
    } catch (err) {
      console.error('Erro ao cadastrar produto:', err)
      toast.error('Falha ao cadastrar novo produto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos & Preços</h1>
          <p className="text-muted-foreground">
            Gerencie o inventário e tabela de preços da cooperativa.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Importar CSV
            </Button>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" /> Novo Produto
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle>Catálogo de Produtos</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-48">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="todas">Todas as categorias ({products.length})</option>
                  {availableCategories.map((cat) => {
                    const count = products.filter((p) => areCategoriesEqual(p.category, cat)).length
                    return (
                      <option key={cat} value={cat}>
                        {cat} ({count})
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  className="pl-9 h-9 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Disponibilidade</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  {isAdmin && <TableHead className="text-right">Ação</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando produtos do banco...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const dispBadge =
                      product.disponibilidade === 'abundancia' ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                          Abundância
                        </Badge>
                      ) : product.disponibilidade === 'escassez' ? (
                        <Badge className="bg-amber-600 hover:bg-amber-700 text-xs">Escassez</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Normal
                        </Badge>
                      )

                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">
                          <div>
                            <span>{product.name}</span>
                            {product.apelidos && (
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <span className="font-semibold text-[10px] uppercase tracking-wider text-primary/80">
                                  AKA:
                                </span>
                                <span className="truncate max-w-[280px]" title={product.apelidos}>
                                  {product.apelidos}
                                </span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {product.category}
                          </Badge>
                        </TableCell>
                        <TableCell>{dispBadge}</TableCell>
                        <TableCell className="text-right">
                          <span
                            className={product.stock < 100 ? 'text-destructive font-medium' : ''}
                          >
                            {product.stock}
                          </span>
                        </TableCell>
                        <TableCell>{product.unit}</TableCell>
                        <TableCell className="text-right font-medium font-mono">
                          R${' '}
                          {product.price.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7"
                              onClick={() => handleOpenEdit(product)}
                            >
                              Editar
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Edição Individual do Produto */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Produto: {editingProduct?.name}</DialogTitle>
            <DialogDescription>
              Ajuste individualmente a unidade de medida, preço, estoque e a disponibilidade de
              safra deste produto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Categoria</Label>
              <select
                value={editCategoria}
                onChange={(e) => setEditCategoria(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {/* Se a categoria atual não constar na lista padrão/existente, adiciona */}
                {editCategoria &&
                  editCategoria !== '__custom__' &&
                  !availableCategories.some((c) => areCategoriesEqual(c, editCategoria)) && (
                    <option value={editCategoria}>{editCategoria}</option>
                  )}
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__custom__">+ Outra categoria (digitar nova)...</option>
              </select>
              {editCategoria === '__custom__' && (
                <Input
                  type="text"
                  value={editCustomCategoria}
                  onChange={(e) => setEditCustomCategoria(e.target.value)}
                  placeholder="Digite o nome da nova categoria (ex: Folhosas, Ovos, Tubérculos...)"
                  className="w-full h-9 mt-1 text-xs"
                  autoFocus
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-unidade" className="text-sm font-semibold">
                  Unidade de Medida
                </Label>
                <Input
                  id="edit-unidade"
                  type="text"
                  value={editUnidade}
                  onChange={(e) => setEditUnidade(e.target.value)}
                  placeholder="Ex: kg, Dúzia, dz, Maço..."
                  className="w-full h-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-preco" className="text-sm font-semibold">
                  Preço Unitário (R$)
                </Label>
                <Input
                  id="edit-preco"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPreco}
                  onChange={(e) => setEditPreco(e.target.value)}
                  placeholder="Ex: 5.50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-estoque" className="text-sm font-semibold">
                Estoque ({editUnidade.trim() || DEFAULT_PRODUCT_UNIT})
              </Label>
              <Input
                id="edit-estoque"
                type="number"
                step="1"
                min="0"
                value={editEstoque}
                onChange={(e) => setEditEstoque(e.target.value)}
                placeholder="Ex: 100"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Disponibilidade na Safra do Ciclo</Label>
              <select
                value={editDisponibilidade}
                onChange={(e) =>
                  setEditDisponibilidade(e.target.value as 'normal' | 'escassez' | 'abundancia')
                }
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="normal">Normal (Estoque Regular)</option>
                <option value="abundancia">Abundância (Safra Alta / Incentivo)</option>
                <option value="escassez">Escassez (Restrição / Compensar em Correção)</option>
              </select>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="edit-apelidos" className="text-sm font-semibold">
                Nomes Alternativos (AKA — "Also Known As")
              </Label>
              <Input
                id="edit-apelidos"
                type="text"
                value={editApelidos}
                onChange={(e) => setEditApelidos(e.target.value)}
                placeholder="Ex: TANGERINA PONCÃ; TANGERINA PONKAN; MEXERICA"
                className="w-full h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Separe os apelidos por vírgula ou ponto-e-vírgula. Nomes na planilha de pedidos ou
                no contrato que coincidirem com esses apelidos casarão automaticamente com este
                produto.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveProductConfig} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro de Novo Produto */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
            <DialogDescription>
              Cadastre um novo produto no catálogo mestre da cooperativa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-nome" className="text-sm font-semibold">
                Nome do Produto <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-nome"
                type="text"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                placeholder="Ex: Tangerina Ponkan"
                className="w-full h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Categoria</Label>
                <select
                  value={newCategoria}
                  onChange={(e) => setNewCategoria(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__custom__">+ Outra categoria (digitar nova)...</option>
                </select>
                {newCategoria === '__custom__' && (
                  <Input
                    type="text"
                    value={newCustomCategoria}
                    onChange={(e) => setNewCustomCategoria(e.target.value)}
                    placeholder="Digite o nome da categoria..."
                    className="w-full h-8 mt-1 text-xs"
                    autoFocus
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-unidade" className="text-sm font-semibold">
                  Unidade
                </Label>
                <Input
                  id="new-unidade"
                  type="text"
                  value={newUnidade}
                  onChange={(e) => setNewUnidade(e.target.value)}
                  placeholder="Ex: kg, Dúzia..."
                  className="w-full h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-preco" className="text-sm font-semibold">
                  Preço Unitário (R$)
                </Label>
                <Input
                  id="new-preco"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPreco}
                  onChange={(e) => setNewPreco(e.target.value)}
                  placeholder="Ex: 5.50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-estoque" className="text-sm font-semibold">
                  Estoque Inicial
                </Label>
                <Input
                  id="new-estoque"
                  type="number"
                  step="1"
                  min="0"
                  value={newEstoque}
                  onChange={(e) => setNewEstoque(e.target.value)}
                  placeholder="Ex: 100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Disponibilidade</Label>
              <select
                value={newDisponibilidade}
                onChange={(e) => setNewDisponibilidade(e.target.value as any)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="normal">Normal (Estoque Regular)</option>
                <option value="abundancia">Abundância</option>
                <option value="escassez">Escassez</option>
              </select>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="new-apelidos" className="text-sm font-semibold">
                Nomes Alternativos (AKA — "Also Known As")
              </Label>
              <Input
                id="new-apelidos"
                type="text"
                value={newApelidos}
                onChange={(e) => setNewApelidos(e.target.value)}
                placeholder="Ex: TANGERINA PONCÃ; TANGERINA PONKAN; MEXERICA"
                className="w-full h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Separe os apelidos por vírgula ou ponto-e-vírgula. Usado nas importações de
                planilhas.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateProduct} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cadastrando...
                </>
              ) : (
                'Cadastrar Produto'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação CSV / Planilha de Produtos */}
      <ProductImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        products={products}
        onSuccess={async () => {
          await refreshData()
        }}
      />
    </div>
  )
}
