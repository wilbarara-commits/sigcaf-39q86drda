import { useState, useMemo, useRef } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  FilterX,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  Phone,
  User,
  Users,
  Calendar,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { fornecedoresService } from '@/services/fornecedores'
import type { FornecedorRecord, FornecedorVinculo, FornecedorSexo } from '@/lib/types'
import {
  formatarDocumentoIdentidade,
  validarDocumentoIdentidade,
  formatarWhatsApp,
  formatarCEP,
  limparDocumento,
} from '@/lib/documentoUtils'

type CafStatus = 'valido' | 'vencido' | 'nao_informado'

function getCafStatus(dataValidade?: string): {
  status: CafStatus
  label: string
  isVencido: boolean
} {
  if (!dataValidade || !dataValidade.trim()) {
    return { status: 'nao_informado', label: '—', isVencido: false }
  }

  // Compara apenas a data (YYYY-MM-DD) sem horário para evitar falsos vencidos no próprio dia
  const hojeStr = new Date().toISOString().split('T')[0]
  const cafStr = dataValidade.includes('T') ? dataValidade.split('T')[0] : dataValidade

  if (cafStr < hojeStr) {
    return { status: 'vencido', label: 'Vencido', isVencido: true }
  }
  return { status: 'valido', label: 'Válido', isVencido: false }
}

function formatarDataBR(isoDate?: string): string {
  if (!isoDate) return ''
  const clean = isoDate.includes('T') ? isoDate.split('T')[0] : isoDate
  const parts = clean.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return isoDate
}

export default function Fornecedores() {
  const { fornecedores, isLoading, refreshData } = useApp()
  const { isAdmin, isMaster } = useAuth()
  const podeGerenciar = isAdmin || isMaster

  // Filtros
  const [search, setSearch] = useState('')
  const [filterVinculo, setFilterVinculo] = useState<string>('todos')

  // Modais de Criação / Edição
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFornecedor, setEditingFornecedor] = useState<FornecedorRecord | null>(null)

  // Campos do formulário
  const [nome, setNome] = useState('')
  const [sexo, setSexo] = useState<string>('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [vinculo, setVinculo] = useState<FornecedorVinculo>('COOPERADO')
  const [identidade, setIdentidade] = useState('')
  const [dataValidadeCaf, setDataValidadeCaf] = useState('')
  const [endereco, setEndereco] = useState('')
  const [bairro, setBairro] = useState('')
  const [cep, setCep] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  // Foto
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string>('')
  const [removerFoto, setRemoverFoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Submissão
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Modal de Exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fornecedorToDelete, setFornecedorToDelete] = useState<FornecedorRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Limpar filtros
  const handleClearFilters = () => {
    setSearch('')
    setFilterVinculo('todos')
  }

  const hasActiveFilters = search.trim() !== '' || filterVinculo !== 'todos'

  // Lista filtrada
  const filteredFornecedores = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fornecedores.filter((f) => {
      const matchNome =
        !q ||
        f.nome.toLowerCase().includes(q) ||
        (f.identidade && f.identidade.toLowerCase().includes(q)) ||
        (f.whatsapp && f.whatsapp.toLowerCase().includes(q))

      const matchVinculo = filterVinculo === 'todos' ? true : f.vinculo === filterVinculo

      return matchNome && matchVinculo
    })
  }, [fornecedores, search, filterVinculo])

  // Contadores
  const contadores = useMemo(() => {
    let cooperados = 0
    let externos = 0
    let cafVencidos = 0
    let cafValidos = 0

    fornecedores.forEach((f) => {
      if (f.vinculo === 'COOPERADO') cooperados++
      else externos++

      const caf = getCafStatus(f.data_validade_caf)
      if (caf.status === 'vencido') cafVencidos++
      else if (caf.status === 'valido') cafValidos++
    })

    return {
      total: fornecedores.length,
      cooperados,
      externos,
      cafVencidos,
      cafValidos,
    }
  }, [fornecedores])

  // Abrir modal de criação
  const handleOpenCreate = () => {
    setEditingFornecedor(null)
    setNome('')
    setSexo('')
    setDataNascimento('')
    setVinculo('COOPERADO')
    setIdentidade('')
    setDataValidadeCaf('')
    setEndereco('')
    setBairro('')
    setCep('')
    setLatitude('')
    setLongitude('')
    setWhatsapp('')
    setFotoFile(null)
    setFotoPreview('')
    setRemoverFoto(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setDialogOpen(true)
  }

  // Abrir modal de edição
  const handleOpenEdit = (f: FornecedorRecord) => {
    setEditingFornecedor(f)
    setNome(f.nome)
    setSexo(f.sexo || '')
    setDataNascimento(f.data_nascimento ? f.data_nascimento.split('T')[0] : '')
    setVinculo(f.vinculo || 'COOPERADO')
    setIdentidade(f.identidade ? formatarDocumentoIdentidade(f.identidade) : '')
    setDataValidadeCaf(f.data_validade_caf ? f.data_validade_caf.split('T')[0] : '')
    setEndereco(f.endereco || '')
    setBairro(f.bairro || '')
    setCep(f.cep ? formatarCEP(f.cep) : '')
    setLatitude(f.latitude !== undefined && f.latitude !== null ? String(f.latitude) : '')
    setLongitude(f.longitude !== undefined && f.longitude !== null ? String(f.longitude) : '')
    setWhatsapp(f.whatsapp ? formatarWhatsApp(f.whatsapp) : '')
    setFotoFile(null)
    setFotoPreview(f.fotoUrl || '')
    setRemoverFoto(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setDialogOpen(true)
  }

  // Foto change
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('A imagem deve ter no máximo 5MB.')
        return
      }
      setFotoFile(file)
      setRemoverFoto(false)
      const reader = new FileReader()
      reader.onload = () => {
        setFotoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoverFoto = () => {
    setFotoFile(null)
    setFotoPreview('')
    setRemoverFoto(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Validação em tempo real do CAF no formulário
  const formCafStatus = getCafStatus(dataValidadeCaf)

  // Submissão do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedNome = nome.trim()
    if (!trimmedNome) {
      toast.error('Informe o nome do fornecedor.')
      return
    }

    // Validação de CPF ou CNPJ se preenchido
    const docLimpo = limparDocumento(identidade)
    if (docLimpo) {
      if (docLimpo.length !== 11 && docLimpo.length !== 14) {
        toast.error('A identidade deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
        return
      }
      if (!validarDocumentoIdentidade(docLimpo)) {
        toast.error(
          docLimpo.length === 11
            ? 'CPF inválido. Verifique os dígitos verificadores digitados.'
            : 'CNPJ inválido. Verifique os dígitos verificadores digitados.',
        )
        return
      }
    }

    // Latitude e longitude numéricas
    let parsedLat: number | null = null
    let parsedLng: number | null = null
    if (latitude.trim()) {
      const normLat = Number(latitude.replace(',', '.'))
      if (isNaN(normLat)) {
        toast.error('Latitude inválida. Digite um valor numérico.')
        return
      }
      parsedLat = normLat
    }
    if (longitude.trim()) {
      const normLng = Number(longitude.replace(',', '.'))
      if (isNaN(normLng)) {
        toast.error('Longitude inválida. Digite um valor numérico.')
        return
      }
      parsedLng = normLng
    }

    setIsSubmitting(true)
    try {
      if (editingFornecedor) {
        await fornecedoresService.update(editingFornecedor.id, {
          nome: trimmedNome,
          vinculo,
          sexo: sexo || undefined,
          data_nascimento: dataNascimento || undefined,
          identidade: docLimpo ? formatarDocumentoIdentidade(docLimpo) : '',
          data_validade_caf: dataValidadeCaf || undefined,
          endereco: endereco.trim() || undefined,
          bairro: bairro.trim() || undefined,
          cep: cep.trim() ? formatarCEP(cep) : undefined,
          latitude: parsedLat,
          longitude: parsedLng,
          whatsapp: whatsapp.trim() ? formatarWhatsApp(whatsapp) : undefined,
          fotoFile,
          removerFoto,
        })
        toast.success(`Fornecedor "${trimmedNome}" atualizado com sucesso!`)
      } else {
        await fornecedoresService.create({
          nome: trimmedNome,
          vinculo,
          sexo: sexo || undefined,
          data_nascimento: dataNascimento || undefined,
          identidade: docLimpo ? formatarDocumentoIdentidade(docLimpo) : '',
          data_validade_caf: dataValidadeCaf || undefined,
          endereco: endereco.trim() || undefined,
          bairro: bairro.trim() || undefined,
          cep: cep.trim() ? formatarCEP(cep) : undefined,
          latitude: parsedLat,
          longitude: parsedLng,
          whatsapp: whatsapp.trim() ? formatarWhatsApp(whatsapp) : undefined,
          fotoFile,
        })
        toast.success(`Fornecedor "${trimmedNome}" cadastrado com sucesso!`)
      }

      setDialogOpen(false)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao salvar fornecedor:', err)
      const msg = err?.response?.message || err?.message || 'Falha ao salvar dados do fornecedor'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Abrir diálogo de exclusão
  const handleOpenDelete = (f: FornecedorRecord) => {
    setFornecedorToDelete(f)
    setDeleteDialogOpen(true)
  }

  // Confirmar exclusão
  const handleConfirmDelete = async () => {
    if (!fornecedorToDelete) return
    setIsDeleting(true)
    try {
      await fornecedoresService.delete(fornecedorToDelete.id)
      toast.success(`Fornecedor "${fornecedorToDelete.nome}" excluído com sucesso!`)
      setDeleteDialogOpen(false)
      setFornecedorToDelete(null)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao excluir fornecedor:', err)
      const msg = err?.response?.message || err?.message || 'Falha ao excluir fornecedor'
      toast.error(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span role="img" aria-label="Fornecedores" className="text-2xl">
              🚜
            </span>
            Fornecedores
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cadastro mestre de produtores cooperados e fornecedores externos com controle de CAF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeGerenciar && (
            <Button onClick={handleOpenCreate} className="gap-2 shadow-xs">
              <Plus className="h-4 w-4" />
              Novo Fornecedor
            </Button>
          )}
        </div>
      </div>

      {/* Cards de Métricas / Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total de Fornecedores</p>
              <p className="text-xl font-bold text-foreground">{contadores.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Cooperados</p>
              <p className="text-xl font-bold text-foreground">{contadores.cooperados}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Externos</p>
              <p className="text-xl font-bold text-foreground">{contadores.externos}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                contadores.cafVencidos > 0
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {contadores.cafVencidos > 0 ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">CAF Vencidos</p>
              <p
                className={`text-xl font-bold ${
                  contadores.cafVencidos > 0 ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {contadores.cafVencidos}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Campo de Busca */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF/CNPJ ou WhatsApp..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filtro por Vínculo */}
            <div className="w-full sm:w-56">
              <Select value={filterVinculo} onValueChange={setFilterVinculo}>
                <SelectTrigger>
                  <SelectValue placeholder="Vínculo: Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Vínculos</SelectItem>
                  <SelectItem value="COOPERADO">Cooperado</SelectItem>
                  <SelectItem value="EXTERNO">Externo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botão limpar filtros */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                onClick={handleClearFilters}
                className="gap-1.5 text-muted-foreground shrink-0"
              >
                <FilterX className="h-4 w-4" />
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Listagem */}
      <Card className="shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-12 text-center">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-36">Vínculo</TableHead>
                <TableHead className="w-44">WhatsApp</TableHead>
                <TableHead className="w-48">Situação do CAF</TableHead>
                <TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>Carregando fornecedores...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredFornecedores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {hasActiveFilters ? (
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Nenhum fornecedor encontrado</p>
                        <p className="text-xs">Tente ajustar seus termos de busca ou filtros.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-medium text-foreground">Nenhum fornecedor cadastrado</p>
                        <p className="text-xs">
                          Comece cadastrando um novo produtor cooperado ou externo.
                        </p>
                        {podeGerenciar && (
                          <Button size="sm" onClick={handleOpenCreate} className="gap-1 mt-1">
                            <Plus className="h-3.5 w-3.5" />
                            Cadastrar Fornecedor
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredFornecedores.map((f) => {
                  const caf = getCafStatus(f.data_validade_caf)
                  const iniciais = f.nome
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0].toUpperCase())
                    .join('')

                  return (
                    <TableRow key={f.id} className="hover:bg-muted/30 transition-colors">
                      {/* Avatar */}
                      <TableCell className="text-center py-2">
                        <Avatar className="h-9 w-9 mx-auto border border-border">
                          {f.fotoUrl ? (
                            <AvatarImage src={f.fotoUrl} alt={f.nome} className="object-cover" />
                          ) : null}
                          <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                            {iniciais || 'F'}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>

                      {/* Nome e documento */}
                      <TableCell className="py-2.5">
                        <div className="font-medium text-foreground leading-tight">{f.nome}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          {f.identidade && (
                            <span className="font-mono text-[11px]">{f.identidade}</span>
                          )}
                          {f.bairro && <span>• {f.bairro}</span>}
                          {f.sexo && <span className="capitalize">• {f.sexo.toLowerCase()}</span>}
                        </div>
                      </TableCell>

                      {/* Vínculo */}
                      <TableCell className="py-2.5">
                        <Badge
                          variant={f.vinculo === 'COOPERADO' ? 'default' : 'secondary'}
                          className={`font-medium ${
                            f.vinculo === 'COOPERADO'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {f.vinculo === 'COOPERADO' ? 'Cooperado' : 'Externo'}
                        </Badge>
                      </TableCell>

                      {/* WhatsApp */}
                      <TableCell className="py-2.5">
                        {f.whatsapp ? (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-foreground">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{f.whatsapp}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Situação do CAF */}
                      <TableCell className="py-2.5">
                        {caf.status === 'vencido' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-300">
                            <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                            <span>Vencido</span>
                            {f.data_validade_caf && (
                              <span className="text-[11px] font-normal text-red-600">
                                ({formatarDataBR(f.data_validade_caf)})
                              </span>
                            )}
                          </div>
                        ) : caf.status === 'valido' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>Válido</span>
                            {f.data_validade_caf && (
                              <span className="text-[11px] font-normal text-emerald-700">
                                ({formatarDataBR(f.data_validade_caf)})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs font-mono">—</span>
                        )}
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="text-right py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {podeGerenciar ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(f)}
                                title="Editar fornecedor"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDelete(f)}
                                title="Excluir fornecedor"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Excluir</span>
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
            <DialogDescription>
              {editingFornecedor
                ? 'Atualize os dados cadastrais e as informações do CAF do fornecedor.'
                : 'Preencha os dados abaixo para cadastrar um novo fornecedor no sistema.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Foto e Dados Básicos */}
            <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-muted/30 rounded-lg border">
              <div className="relative">
                <Avatar className="h-20 w-20 border-2 border-border shadow-xs">
                  {fotoPreview ? (
                    <AvatarImage src={fotoPreview} alt="Preview" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {nome ? nome.slice(0, 2).toUpperCase() : 'FT'}
                  </AvatarFallback>
                </Avatar>
                {fotoPreview && (
                  <button
                    type="button"
                    onClick={handleRemoverFoto}
                    className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-1 shadow-xs hover:bg-destructive/90"
                    title="Remover foto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex-1 space-y-1 text-center sm:text-left">
                <Label htmlFor="foto-upload" className="text-xs font-medium cursor-pointer">
                  Foto do Fornecedor
                </Label>
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <Input
                    ref={fileInputRef}
                    id="foto-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFotoChange}
                    className="max-w-xs text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Formatos aceitos: JPG, PNG, WEBP (máx. 5MB).
                </p>
              </div>
            </div>

            {/* Linha 1: Nome e Vínculo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="fornecedor-nome" className="text-xs font-semibold">
                  Nome do Fornecedor <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fornecedor-nome"
                  required
                  placeholder="Nome completo ou Razão Social"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="fornecedor-vinculo" className="text-xs font-semibold">
                  Vínculo <span className="text-destructive">*</span>
                </Label>
                <Select value={vinculo} onValueChange={(val: FornecedorVinculo) => setVinculo(val)}>
                  <SelectTrigger id="fornecedor-vinculo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COOPERADO">Cooperado</SelectItem>
                    <SelectItem value="EXTERNO">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 2: Sexo e Data de Nascimento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fornecedor-sexo" className="text-xs">
                  Sexo
                </Label>
                <Select value={sexo} onValueChange={setSexo}>
                  <SelectTrigger id="fornecedor-sexo">
                    <SelectValue placeholder="Selecione o sexo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MASCULINO">Masculino</SelectItem>
                    <SelectItem value="FEMININO">Feminino</SelectItem>
                    <SelectItem value="OUTRO">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="fornecedor-nascimento" className="text-xs">
                  Data de Nascimento
                </Label>
                <Input
                  id="fornecedor-nascimento"
                  type="date"
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                />
              </div>
            </div>

            {/* Linha 3: Identidade (CPF ou CNPJ) e WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fornecedor-identidade" className="text-xs">
                  Identidade (CPF ou CNPJ)
                </Label>
                <Input
                  id="fornecedor-identidade"
                  placeholder="000.000.000-00 ou CNPJ"
                  value={identidade}
                  onChange={(e) => setIdentidade(formatarDocumentoIdentidade(e.target.value))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Validação automática de dígitos verificadores de CPF e CNPJ.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="fornecedor-whatsapp" className="text-xs">
                  WhatsApp
                </Label>
                <Input
                  id="fornecedor-whatsapp"
                  placeholder="(00) 00000-0000"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(formatarWhatsApp(e.target.value))}
                />
              </div>
            </div>

            {/* Linha 4: Data de Validade do CAF com destaque para Vencido */}
            <div
              className={`p-3 rounded-lg border transition-colors ${
                formCafStatus.isVencido
                  ? 'bg-red-50/80 border-red-300 dark:bg-red-950/30 dark:border-red-800'
                  : 'bg-muted/20 border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <Label
                  htmlFor="fornecedor-caf"
                  className={`text-xs font-semibold ${
                    formCafStatus.isVencido ? 'text-red-700 dark:text-red-400' : ''
                  }`}
                >
                  Data de Validade do CAF (Opcional)
                </Label>
                {formCafStatus.isVencido && (
                  <Badge
                    variant="destructive"
                    className="gap-1 font-semibold text-[10px] uppercase"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    CAF Vencido
                  </Badge>
                )}
                {formCafStatus.status === 'valido' && (
                  <Badge
                    variant="outline"
                    className="gap-1 text-emerald-700 border-emerald-300 text-[10px]"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    CAF Válido
                  </Badge>
                )}
              </div>
              <Input
                id="fornecedor-caf"
                type="date"
                value={dataValidadeCaf}
                onChange={(e) => setDataValidadeCaf(e.target.value)}
                className={
                  formCafStatus.isVencido ? 'border-red-400 focus-visible:ring-red-400' : ''
                }
              />
              <p
                className={`text-[11px] mt-1 ${
                  formCafStatus.isVencido ? 'text-red-600 font-medium' : 'text-muted-foreground'
                }`}
              >
                {formCafStatus.isVencido
                  ? 'Atenção: A data informada indica que o CAF deste fornecedor está vencido.'
                  : 'Preencha apenas caso o produtor possua CAF ativo/registrado.'}
              </p>
            </div>

            {/* Linha 5: Endereço, Bairro e CEP */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="fornecedor-endereco" className="text-xs">
                  Endereço / Propriedade
                </Label>
                <Input
                  id="fornecedor-endereco"
                  placeholder="Linha, Estrada, Rua, Comunidade..."
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="fornecedor-bairro" className="text-xs">
                  Bairro / Localidade
                </Label>
                <Input
                  id="fornecedor-bairro"
                  placeholder="Distrito ou Bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fornecedor-cep" className="text-xs">
                  CEP
                </Label>
                <Input
                  id="fornecedor-cep"
                  placeholder="00000-000"
                  value={cep}
                  onChange={(e) => setCep(formatarCEP(e.target.value))}
                />
              </div>

              {/* Coordenadas (campos numéricos simples) */}
              <div className="space-y-1">
                <Label htmlFor="fornecedor-latitude" className="text-xs">
                  Latitude
                </Label>
                <Input
                  id="fornecedor-latitude"
                  placeholder="Ex: -27.5954"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="fornecedor-longitude" className="text-xs">
                  Longitude
                </Label>
                <Input
                  id="fornecedor-longitude"
                  placeholder="Ex: -48.5480"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </div>
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
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingFornecedor ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Exclusão de Fornecedor
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-1 text-sm text-foreground/80">
              <p>
                Tem certeza de que deseja excluir o cadastro do fornecedor{' '}
                <strong className="text-foreground font-semibold">
                  "{fornecedorToDelete?.nome}"
                </strong>
                ?
              </p>
              <p className="text-xs text-muted-foreground">
                Esta ação removerá permanentemente o cadastro e sua respectiva foto do banco de
                dados do sistema.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-white gap-2"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir Fornecedor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
