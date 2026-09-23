import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Search,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Globe,
  FileSpreadsheet,
  Users,
  Eye,
  FilterX,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { escolasService } from '@/services/escolas'
import { SchoolImportDialog } from '@/components/SchoolImportDialog'
import type { School, EscolaTipo } from '@/lib/types'

const ESCOLA_TIPOS: EscolaTipo[] = ['CMEI', 'CRECHE', 'INTEGRAL', 'FUNDAMENTAL', 'Médio', 'Técnico']

export default function Schools() {
  const { schools, isLoading, refreshData } = useApp()
  const { isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<string>('todos')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)

  // Details dialog state
  const [detailsSchool, setDetailsSchool] = useState<School | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)

  // Form dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editingSchool, setEditingSchool] = useState<School | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [bairro, setBairro] = useState('')
  const [contatoResponsavel, setContatoResponsavel] = useState('')
  const [tipo, setTipo] = useState<string>('')
  const [alunos, setAlunos] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [schoolToDelete, setSchoolToDelete] = useState<School | null>(null)
  const [dependencyWarning, setDependencyWarning] = useState<{
    contractsCount: number
    ordersCount: number
  } | null>(null)
  const [isCheckingDeps, setIsCheckingDeps] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filtered schools (apenas atributos próprios da escola)
  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const searchLower = search.trim().toLowerCase()

      // Textual search: matches name, address, email, tipo, bairro, contact
      const matchesSearch =
        !searchLower ||
        s.name.toLowerCase().includes(searchLower) ||
        (s.address && s.address.toLowerCase().includes(searchLower)) ||
        (s.email && s.email.toLowerCase().includes(searchLower)) ||
        (s.tipo && s.tipo.toLowerCase().includes(searchLower)) ||
        (s.bairro && s.bairro.toLowerCase().includes(searchLower)) ||
        (s.contatoResponsavel && s.contatoResponsavel.toLowerCase().includes(searchLower)) ||
        (s.contact && s.contact.toLowerCase().includes(searchLower))

      // Filter by tipo
      const matchesTipo =
        filterTipo === 'todos' ? true : filterTipo === 'sem_tipo' ? !s.tipo : s.tipo === filterTipo

      return matchesSearch && matchesTipo
    })
  }, [schools, search, filterTipo])

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filteredSchools.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedSchools = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredSchools.slice(start, start + pageSize)
  }, [filteredSchools, safeCurrentPage, pageSize])

  const hasActiveFilters = search.trim() !== '' || filterTipo !== 'todos'

  const handleClearFilters = () => {
    setSearch('')
    setFilterTipo('todos')
    setCurrentPage(1)
  }

  const handleOpenDetails = (school: School) => {
    setDetailsSchool(school)
    setDetailsDialogOpen(true)
  }

  const handleOpenCreate = () => {
    setEditingSchool(null)
    setName('')
    setAddress('')
    setContact('')
    setEmail('')
    setBairro('')
    setContatoResponsavel('')
    setTipo('')
    setAlunos('')
    setDialogOpen(true)
  }

  const handleOpenEdit = (school: School) => {
    setEditingSchool(school)
    setName(school.name)
    setAddress(school.address)
    setContact(school.contact)
    setEmail(school.email || '')
    setBairro(school.bairro || '')
    setContatoResponsavel(school.contatoResponsavel || '')
    setTipo(school.tipo || '')
    setAlunos(school.alunos !== undefined ? String(school.alunos) : '')
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Informe o nome da instituição escolar.')
      return
    }

    const parsedAlunos = alunos.trim() ? parseInt(alunos.trim(), 10) : undefined

    setIsSubmitting(true)
    try {
      if (editingSchool) {
        // Checar duplicidade ao editar (caso mude o nome para outro existente)
        const existing = await escolasService.findByNameNormalized(trimmedName)
        if (existing && existing.id !== editingSchool.id) {
          toast.warning(
            `Já existe outra escola cadastrada com o nome similar "${existing.nome}". Use o registro existente.`,
          )
          setIsSubmitting(false)
          return
        }

        await escolasService.update(editingSchool.id, {
          nome: trimmedName,
          endereco: address.trim(),
          telefone: contact.trim(),
          email: email.trim() || undefined,
          bairro: bairro.trim() || undefined,
          contato: contatoResponsavel.trim() || undefined,
          tipo: tipo || undefined,
          alunos: parsedAlunos,
        })
        toast.success(`Escola "${trimmedName}" atualizada com sucesso!`)
      } else {
        // Checar duplicidade antes de criar no cadastro mestre
        const existing = await escolasService.findByNameNormalized(trimmedName)
        if (existing) {
          toast.warning(
            `A escola "${existing.nome}" já existe no cadastro mestre. Escolas devem ser criadas apenas uma vez e reutilizadas.`,
          )
          setIsSubmitting(false)
          return
        }

        await escolasService.create({
          nome: trimmedName,
          endereco: address.trim(),
          telefone: contact.trim(),
          email: email.trim() || undefined,
          bairro: bairro.trim() || undefined,
          contato: contatoResponsavel.trim() || undefined,
          tipo: tipo || undefined,
          alunos: parsedAlunos,
        })
        toast.success(`Escola "${trimmedName}" cadastrada no cadastro mestre global!`)
      }
      setDialogOpen(false)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao salvar escola:', err)
      const message =
        err?.response?.message || err?.message || 'Falha ao salvar escola no banco de dados.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenDelete = async (school: School) => {
    setSchoolToDelete(school)
    setDependencyWarning(null)
    setDeleteDialogOpen(true)
    setIsCheckingDeps(true)
    try {
      const deps = await escolasService.checkDependencies(school.id)
      setDependencyWarning(deps)
    } catch (err) {
      console.error('Erro ao verificar dependências da escola:', err)
    } finally {
      setIsCheckingDeps(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!schoolToDelete) return
    setIsDeleting(true)
    try {
      await escolasService.delete(schoolToDelete.id)
      toast.success(`Escola "${schoolToDelete.name}" removida com sucesso!`)
      setDeleteDialogOpen(false)
      setSchoolToDelete(null)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao excluir escola:', err)
      const message =
        err?.response?.message ||
        err?.message ||
        'Não foi possível excluir a escola. Verifique se há pedidos ou contratos vinculados.'
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header com título e ações principais */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Cadastro Mestre de Escolas</h1>
            <Badge variant="outline" className="gap-1 text-xs border-primary/40 text-primary">
              <Globe className="h-3 w-3" /> Global & Independente
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Diretório global único: cada escola é cadastrada <strong>uma única vez</strong> e
            reutilizada em múltiplos contratos PNAE/PAA.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Importar CSV
            </Button>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nova Escola Mestre
            </Button>
          </div>
        )}
      </div>

      {/* Barra de Filtros: Busca textual e Tipo */}
      <Card className="border-border/60">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 1. Busca textual */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Busca Textual</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome, endereço, bairro, telefone, contato..."
                  className="pl-9 h-9 text-xs bg-background"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                />
              </div>
            </div>

            {/* 2. Filtro por Tipo */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo de Instituição</Label>
              <Select
                value={filterTipo}
                onValueChange={(val) => {
                  setFilterTipo(val)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-9 bg-background text-xs">
                  <SelectValue placeholder="Todos os Tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Tipos</SelectItem>
                  {ESCOLA_TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                  <SelectItem value="sem_tipo">Sem Tipo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Barra inferior de status dos filtros e contagem */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Exibindo <strong>{filteredSchools.length}</strong> de{' '}
                <strong>{schools.length}</strong> escola(s)
              </span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="text-[11px] font-normal">
                  Filtros ativos
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <FilterX className="h-3.5 w-3.5" /> Limpar Filtros
                </Button>
              )}
              <div className="flex items-center gap-1.5">
                <span>Linhas:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val))
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="h-7 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo: Tabela de Escolas em Linhas */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando escolas do banco...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[260px] font-semibold text-foreground">
                    Escola / Instituição
                  </TableHead>
                  <TableHead className="w-[100px] font-semibold text-foreground">Tipo</TableHead>
                  <TableHead className="w-[80px] text-right font-semibold text-foreground">
                    Alunos
                  </TableHead>
                  <TableHead className="w-[130px] font-semibold text-foreground">
                    Telefone
                  </TableHead>
                  <TableHead className="w-[170px] font-semibold text-foreground">E-mail</TableHead>
                  <TableHead className="w-[140px] font-semibold text-foreground">Contato</TableHead>
                  <TableHead className="min-w-[220px] font-semibold text-foreground">
                    Endereço & Bairro
                  </TableHead>
                  <TableHead className="w-[95px] text-right font-semibold text-foreground">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSchools.map((school) => {
                  // Montagem de endereço + bairro na mesma linha: "Rua X, 123 — Bairro Y"
                  const fullAddressDisplay = (() => {
                    const addr = (school.address || '').trim()
                    const b = (school.bairro || '').trim()
                    if (addr && b) {
                      if (addr.toLowerCase().includes(b.toLowerCase())) return addr
                      return `${addr} — Bairro ${b}`
                    }
                    if (addr) return addr
                    if (b) return `Bairro ${b}`
                    return ''
                  })()

                  return (
                    <TableRow
                      key={school.id}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => handleOpenDetails(school)}
                    >
                      {/* 1. Nome da Escola */}
                      <TableCell className="font-medium align-middle">
                        <div className="flex items-start gap-2 py-0.5">
                          <div className="p-1.5 bg-primary/10 text-primary rounded-md shrink-0 mt-0.5">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <span
                              className="font-semibold text-foreground block truncate max-w-[230px]"
                              title={school.name}
                            >
                              {school.name}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Tipo */}
                      <TableCell className="align-middle">
                        {school.tipo ? (
                          <Badge
                            variant="secondary"
                            className="text-[11px] font-normal whitespace-nowrap"
                          >
                            {school.tipo}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/60 italic">—</span>
                        )}
                      </TableCell>

                      {/* 3. Nº de Alunos */}
                      <TableCell className="text-right align-middle">
                        {school.alunos !== undefined && school.alunos !== null ? (
                          <span className="font-mono text-xs text-foreground/90 font-medium">
                            {school.alunos}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>

                      {/* 4. Telefone */}
                      <TableCell className="align-middle text-xs">
                        {school.contact ? (
                          <span className="flex items-center gap-1 text-foreground/90 whitespace-nowrap font-mono text-[11px]">
                            <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                            {school.contact}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">—</span>
                        )}
                      </TableCell>

                      {/* 5. E-mail */}
                      <TableCell className="align-middle text-xs">
                        {school.email ? (
                          <span
                            className="flex items-center gap-1 text-foreground/90 truncate max-w-[160px]"
                            title={school.email}
                          >
                            <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{school.email}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">—</span>
                        )}
                      </TableCell>

                      {/* 6. Contato / Responsável */}
                      <TableCell className="align-middle text-xs">
                        {school.contatoResponsavel ? (
                          <span
                            className="text-foreground/90 block truncate max-w-[135px]"
                            title={school.contatoResponsavel}
                          >
                            {school.contatoResponsavel}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">—</span>
                        )}
                      </TableCell>

                      {/* 7. Endereço + Bairro */}
                      <TableCell className="align-middle text-xs">
                        {fullAddressDisplay ? (
                          <div
                            className="flex items-start gap-1 text-muted-foreground truncate max-w-[260px]"
                            title={fullAddressDisplay}
                          >
                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                            <span className="truncate text-foreground/90">
                              {fullAddressDisplay}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 italic">—</span>
                        )}
                      </TableCell>

                      {/* 8. Ações */}
                      <TableCell
                        className="text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Ver detalhes da escola"
                            onClick={() => handleOpenDetails(school)}
                          >
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Button>

                          {isAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title="Editar dados cadastrais"
                                onClick={() => handleOpenEdit(school)}
                              >
                                <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                                title="Excluir escola"
                                onClick={() => handleOpenDelete(school)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}

                {filteredSchools.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      <div className="space-y-2">
                        <p className="text-sm">
                          {hasActiveFilters
                            ? 'Nenhuma escola encontrada com os filtros informados.'
                            : 'Nenhuma escola cadastrada no sistema.'}
                        </p>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearFilters}
                            className="text-xs"
                          >
                            Limpar filtros
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {filteredSchools.length > pageSize && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground px-1">
              <div>
                Página <strong>{safeCurrentPage}</strong> de <strong>{totalPages}</strong> (
                {filteredSchools.length} escolas no total)
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-medium text-foreground">
                  {safeCurrentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diálogo de Visão Detalhada da Escola Selecionada */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          {detailsSchool && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-xl font-bold leading-tight">
                        {detailsSchool.name}
                      </DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">
                      Ficha detalhada do cadastro mestre e histórico de vínculos contratuais.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 pt-2">
                {/* Badges de Destaque */}
                <div className="flex flex-wrap items-center gap-2">
                  {detailsSchool.tipo && (
                    <Badge variant="secondary" className="text-xs">
                      {detailsSchool.tipo}
                    </Badge>
                  )}
                  {detailsSchool.alunos !== undefined && detailsSchool.alunos !== null && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Users className="h-3 w-3 text-primary" />
                      {detailsSchool.alunos} alunos matriculados
                    </Badge>
                  )}
                </div>

                {/* Bloco de Informações Cadastrais */}
                <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-primary" /> Dados do Cadastro Mestre
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">Endereço</span>
                      <p className="flex items-start gap-1.5 text-foreground/90">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span>{detailsSchool.address || 'Endereço não informado'}</span>
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">Bairro</span>
                      <p className="flex items-center gap-1.5 text-foreground/90">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{detailsSchool.bairro || 'Bairro não informado'}</span>
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">
                        Telefone / WhatsApp
                      </span>
                      <p className="flex items-center gap-1.5 text-foreground/90">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{detailsSchool.contact || 'Telefone não informado'}</span>
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">
                        Pessoa de Contato / Responsável
                      </span>
                      <p className="flex items-center gap-1.5 text-foreground/90">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{detailsSchool.contatoResponsavel || 'Contato não informado'}</span>
                      </p>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <span className="text-xs text-muted-foreground block">
                        E-mail Institucional
                      </span>
                      <p className="flex items-center gap-1.5 text-foreground/90 truncate">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{detailsSchool.email || 'E-mail não informado'}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-border flex flex-col sm:flex-row gap-2">
                {isAdmin && (
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setDetailsDialogOpen(false)
                      handleOpenEdit(detailsSchool)
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Editar Cadastro Mestre
                  </Button>
                )}
                <Button variant="default" onClick={() => setDetailsDialogOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Criar / Editar Escola */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingSchool ? 'Editar Escola' : 'Cadastrar Nova Escola'}</DialogTitle>
            <DialogDescription>
              {editingSchool
                ? 'Atualize as informações cadastrais da instituição no cadastro mestre.'
                : 'Preencha os dados da nova escola parceira atendida pela cooperativa.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="school-name">
                Nome da Instituição Escolar <span className="text-destructive">*</span>
              </Label>
              <Input
                id="school-name"
                placeholder="Ex: E.M. Darcy Ribeiro"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                O nome é normalizado para evitar duplicidades no cadastro mestre global.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="school-tipo">Tipo</Label>
                <Select
                  value={tipo || 'none'}
                  onValueChange={(val) => setTipo(val === 'none' ? '' : val)}
                >
                  <SelectTrigger id="school-tipo">
                    <SelectValue placeholder="Selecione o tipo (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (Vazio)</SelectItem>
                    {ESCOLA_TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="school-alunos">Nº de Alunos</Label>
                <Input
                  id="school-alunos"
                  type="number"
                  min="0"
                  placeholder="Ex: 250"
                  value={alunos}
                  onChange={(e) => setAlunos(e.target.value)}
                />
              </div>

              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="school-contact">Telefone / WhatsApp</Label>
                <Input
                  id="school-contact"
                  placeholder="Ex: (11) 98765-4321"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="school-contact-person">Contato / Responsável</Label>
                <Input
                  id="school-contact-person"
                  placeholder="Ex: Diretora Ana Silva / (21) 99999-0000"
                  value={contatoResponsavel}
                  onChange={(e) => setContatoResponsavel(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="school-bairro">Bairro</Label>
                <Input
                  id="school-bairro"
                  placeholder="Ex: Centro / Várzea / Zona Rural"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="school-email">E-mail Institucional</Label>
              <Input
                id="school-email"
                type="email"
                placeholder="Ex: escola.darcy@educacao.gov.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school-address">Endereço Completo</Label>
              <Input
                id="school-address"
                placeholder="Ex: Rua das Palmeiras, 100"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : editingSchool ? (
                  'Salvar Alterações'
                ) : (
                  'Cadastrar Escola'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Excluir Escola */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Exclusão de Escola
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Tem certeza de que deseja excluir a escola{' '}
                <strong className="text-foreground">{schoolToDelete?.name}</strong>?
              </p>

              {isCheckingDeps ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Verificando vínculos com contratos e
                  pedidos...
                </span>
              ) : dependencyWarning &&
                (dependencyWarning.contractsCount > 0 || dependencyWarning.ordersCount > 0) ? (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1 mt-2">
                  <p className="font-semibold">Atenção aos dados vinculados:</p>
                  {dependencyWarning.contractsCount > 0 && (
                    <p>
                      • {dependencyWarning.contractsCount} contrato(s) registrado(s) para esta
                      escola.
                    </p>
                  )}
                  {dependencyWarning.ordersCount > 0 && (
                    <p>
                      • {dependencyWarning.ordersCount} pedido(s) registrado(s) para esta escola.
                    </p>
                  )}
                  <p className="text-foreground/80 mt-1">
                    A exclusão pode falhar ou afetar a integridade relacional desses registros.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Esta escola não possui contratos ou pedidos vinculados.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...
                </>
              ) : (
                'Excluir Escola'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Importação CSV / Planilha */}
      <SchoolImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        schools={schools}
        onSuccess={async () => {
          await refreshData()
        }}
      />
    </div>
  )
}
