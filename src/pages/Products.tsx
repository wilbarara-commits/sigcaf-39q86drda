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
import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { produtosService } from '@/services/produtos'
import { DEFAULT_PRODUCT_UNIT } from '@/lib/productCsvImporter'
import { ProductImportDialog } from '@/components/ProductImportDialog'

export default function Products() {
  const { products, isLoading, refreshData } = useApp()
  const { isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Estados de edição de produto (unidade e apelidos)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [editUnidade, setEditUnidade] = useState(DEFAULT_PRODUCT_UNIT)
  const [editApelidos, setEditApelidos] = useState('')

  // Estado de criação de novo produto
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newUnidade, setNewUnidade] = useState(DEFAULT_PRODUCT_UNIT)
  const [newApelidos, setNewApelidos] = useState('')

  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase()
    return (
      !term ||
      p.name.toLowerCase().includes(term) ||
      (p.apelidos && p.apelidos.toLowerCase().includes(term))
    )
  })

  const handleOpenEdit = (p: any) => {
    setEditingProduct(p)
    setEditUnidade(p.unit || DEFAULT_PRODUCT_UNIT)
    setEditApelidos(p.apelidos || '')
    setEditDialogOpen(true)
  }

  const handleOpenCreate = () => {
    setNewNome('')
    setNewUnidade(DEFAULT_PRODUCT_UNIT)
    setNewApelidos('')
    setCreateDialogOpen(true)
  }

  const handleSaveProductConfig = async () => {
    if (!editingProduct) return

    const trimmedUnidade = editUnidade.trim() || DEFAULT_PRODUCT_UNIT

    setIsSubmitting(true)
    try {
      await produtosService.update(editingProduct.id, {
        unidade: trimmedUnidade,
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

    setIsSubmitting(true)
    try {
      await produtosService.create({
        nome: trimmedNome,
        unidade: newUnidade.trim() || DEFAULT_PRODUCT_UNIT,
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
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground">
            Gerencie o catálogo mestre de produtos da cooperativa.
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
                  <TableHead>Unidade</TableHead>
                  {isAdmin && <TableHead className="text-right">Ação</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando produtos do banco...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
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
                      <TableCell>{product.unit}</TableCell>
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
                  ))
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
              Ajuste a unidade de medida e os nomes alternativos deste produto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
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
