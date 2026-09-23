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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DisponibilidadeProduto } from '@/lib/types'

export default function Products() {
  const { products, isLoading, refreshData } = useApp()
  const { isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [filterDisponibilidade, setFilterDisponibilidade] = useState<string>('todos')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Estados de edição de produto (unidade e disponibilidade)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [editUnidade, setEditUnidade] = useState(DEFAULT_PRODUCT_UNIT)
  const [editDisponibilidade, setEditDisponibilidade] = useState<DisponibilidadeProduto>('normal')

  // Estado de criação de novo produto
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newUnidade, setNewUnidade] = useState(DEFAULT_PRODUCT_UNIT)
  const [newDisponibilidade, setNewDisponibilidade] = useState<DisponibilidadeProduto>('normal')

  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase()
    const matchesSearch = !term || p.name.toLowerCase().includes(term)
    const matchesDisp =
      filterDisponibilidade === 'todos' || (p.disponibilidade || 'normal') === filterDisponibilidade
    return matchesSearch && matchesDisp
  })

  const getDisponibilidadeBadge = (disp?: string) => {
    const valor = disp || 'normal'
    switch (valor) {
      case 'abundante':
      case 'abundancia':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">
            Abundante
          </Badge>
        )
      case 'escassez':
        return (
          <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold">
            Escassez
          </Badge>
        )
      case 'indisponivel':
        return (
          <Badge variant="destructive" className="text-xs font-semibold">
            Indisponível
          </Badge>
        )
      case 'normal':
      default:
        return (
          <Badge
            variant="outline"
            className="text-foreground text-xs font-medium border-muted-foreground/30"
          >
            Normal
          </Badge>
        )
    }
  }

  const handleOpenEdit = (p: any) => {
    setEditingProduct(p)
    setEditUnidade(p.unit || DEFAULT_PRODUCT_UNIT)
    const rawDisp = p.disponibilidade === 'abundancia' ? 'abundante' : p.disponibilidade || 'normal'
    setEditDisponibilidade(rawDisp as DisponibilidadeProduto)
    setEditDialogOpen(true)
  }

  const handleOpenCreate = () => {
    setNewNome('')
    setNewUnidade(DEFAULT_PRODUCT_UNIT)
    setNewDisponibilidade('normal')
    setCreateDialogOpen(true)
  }

  const handleSaveProductConfig = async () => {
    if (!editingProduct) return

    const trimmedUnidade = editUnidade.trim() || DEFAULT_PRODUCT_UNIT

    setIsSubmitting(true)
    try {
      await produtosService.update(editingProduct.id, {
        unidade: trimmedUnidade,
        disponibilidade: editDisponibilidade,
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
        disponibilidade: newDisponibilidade,
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
              <div className="w-44">
                <Select value={filterDisponibilidade} onValueChange={setFilterDisponibilidade}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Disponibilidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas disponibilidades</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="abundante">Abundante</SelectItem>
                    <SelectItem value="escassez">Escassez</SelectItem>
                    <SelectItem value="indisponivel">Indisponível</SelectItem>
                  </SelectContent>
                </Select>
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
                  <TableHead>Disponibilidade</TableHead>
                  {isAdmin && <TableHead className="text-right">Ação</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando produtos do banco...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        <span>{product.name}</span>
                      </TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell>{getDisponibilidadeBadge(product.disponibilidade)}</TableCell>
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
            <DialogDescription>Ajuste a unidade de medida deste produto.</DialogDescription>
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

            <div className="space-y-2">
              <Label htmlFor="edit-disp" className="text-sm font-semibold">
                Disponibilidade do Produto
              </Label>
              <Select
                value={editDisponibilidade}
                onValueChange={(val) => setEditDisponibilidade(val as DisponibilidadeProduto)}
              >
                <SelectTrigger id="edit-disp" className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal (pode ser pedido)</SelectItem>
                  <SelectItem value="abundante">Abundante (em safra / destaque)</SelectItem>
                  <SelectItem value="escassez">
                    Escassez (tem pouco — bloqueado no formulário)
                  </SelectItem>
                  <SelectItem value="indisponivel">
                    Indisponível (não tem — bloqueado no formulário)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Escassez e Indisponível bloqueiam o pedido da escola no formulário.
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

            <div className="space-y-2">
              <Label htmlFor="new-disp" className="text-sm font-semibold">
                Disponibilidade Inicial
              </Label>
              <Select
                value={newDisponibilidade}
                onValueChange={(val) => setNewDisponibilidade(val as DisponibilidadeProduto)}
              >
                <SelectTrigger id="new-disp" className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="abundante">Abundante</SelectItem>
                  <SelectItem value="escassez">Escassez</SelectItem>
                  <SelectItem value="indisponivel">Indisponível</SelectItem>
                </SelectContent>
              </Select>
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
