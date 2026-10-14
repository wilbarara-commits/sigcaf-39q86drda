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
import { compressFornecedorFoto } from '@/lib/imageCompressor'
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
  const [fotoOriginalInfo, setFotoOriginalInfo] = useState<{
    originalSize: number
    compressedSize: number
    width: number
    height: number
  } | null>(null)
  const [isCompressingFoto, setIsCompressingFoto] = useState(false)
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
    setFotoOriginalInfo(null)
    setIsCompressingFoto(false)
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
    setFotoOriginalInfo(null)
    setIsCompressingFoto(false)
    setRemoverFoto(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setDialogOpen(true)
  }

  // Foto change com compressão imediata no cliente (máx 300x300 JPEG)
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limite prévio de 15MB para rejeitar arquivos gigantes que travariam o navegador
    if (file.size > 15 * 1024 * 1024) {
      toast.error('O arquivo selecionado é excessivamente grande (máx. 15MB para processamento).')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsCompressingFoto(true)
    try {
      const originalSize = file.size
      // Comprime e redimensiona para no máximo 300x300 em JPEG (0.85), sem upscale
      const compressed = await compressFornecedorFoto(file, file.name)

      // Se mesmo após comprimir estourar 5MB (o que é praticamente impossível em 300x300 JPEG)
      if (compressed.sizeBytes > 5 * 1024 * 1024) {
        toast.error('A imagem comprimida ainda excede a cota permitida de 5MB. Escolha outra foto.')
        return
      }

      setFotoFile(compressed.file)
      setFotoPreview(compressed.dataUrl)
      setFotoOriginalInfo({
        originalSize,
        compressedSize: compressed.sizeBytes,
        width: compressed.width,
        height: compressed.height,
      })
      setRemoverFoto(false)

      const origKb = Math.round(originalSize / 1024)
      const compKb = Math.max(1, Math.round(compressed.sizeBytes / 1024))
      toast.success(
        `Foto reduzida: ${compressed.width}x${compressed.height}px JPEG (${origKb} KB → ${compKb} KB)`,
      )
    } catch (err: any) {
      console.error('Erro ao comprimir imagem:', err)
      toast.error(
        'Falha ao redimensionar a foto. Certifique-se de que é uma imagem válida (JPG, PNG ou WEBP).',
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setIsCompressingFoto(false)
    }
  }

  const handleRemoverFoto = () => {
    setFotoFile(null)
    setFotoPreview('')
    setFotoOriginalInfo(null)
    setIsCompressingFoto(false)
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
      // Mensagem clara: nunca falhar silenciosamente nem omitir erros de cota/limite
      const msg =
        err?.friendlyMessage ||
        err?.response?.message ||
        err?.message ||
        'Falha ao salvar dados do fornecedor. Se o armazenamento estiver próximo do limite, contate o administrador.'
      toast.error(msg, { duration: 6000 })
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

      {/* MODAL DE CRIAÇÃO / EDIÇÃO - Layout compacto sem scroll vertical em desktop */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl sm:max-w-3xl w-[96vw] max-h-[96vh] flex flex-col p-4 sm:p-5 gap-3">
          <DialogHeader className="space-y-1 pb-1 border-b">
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span role="img" aria-label="Fornecedor">
                  🚜
                </span>
                {editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </DialogTitle>
              {editingFornecedor && (
                <Badge
                  variant={vinculo === 'COOPERADO' ? 'default' : 'secondary'}
                  className="text-[11px] font-semibold"
                >
                  {vinculo === 'COOPERADO' ? 'Cooperado' : 'Externo'}
                </Badge>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {editingFornecedor
                ? 'Atualize os dados cadastrais, contato e validade do CAF deste fornecedor.'
                : 'Cadastre os dados completos do fornecedor cooperado ou externo.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 space-y-3">
            {/* Área de campos: cabe em desktop 1366x768 sem scroll; scroll interno apenas se a tela for muito baixa (ex.: mobile/landscape estreito) */}
            <div className="flex-1 overflow-y-auto sm:overflow-y-visible pr-0.5 space-y-3">
              {/* Bloco Superior: Foto compacta + Identificação Geral */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start p-2.5 bg-muted/20 rounded-lg border border-border/70">
                {/* Coluna da Foto (compacta) */}
                <div className="sm:col-span-4 flex items-center gap-2.5">
                  <div className="relative shrink-0">
                    <Avatar className="h-14 w-14 border-2 border-border shadow-xs">
                      {fotoPreview ? (
                        <AvatarImage src={fotoPreview} alt="Preview" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                        {nome ? nome.slice(0, 2).toUpperCase() : 'FT'}
                      </AvatarFallback>
                    </Avatar>
                    {fotoPreview && !isCompressingFoto && (
                      <button
                        type="button"
                        onClick={handleRemoverFoto}
                        className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 shadow-xs hover:bg-destructive/90"
                        title="Remover foto"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {isCompressingFoto && (
                      <div className="absolute inset-0 bg-background/80 rounded-full flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Label
                        htmlFor="foto-upload"
                        className="text-[11px] font-semibold cursor-pointer"
                      >
                        Foto (Perfil)
                      </Label>
                      {fotoOriginalInfo ? (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 text-emerald-700 border-emerald-300"
                        >
                          {fotoOriginalInfo.width}×{fotoOriginalInfo.height}
                        </Badge>
                      ) : null}
                    </div>
                    <Input
                      ref={fileInputRef}
                      id="foto-upload"
                      type="file"
                      accept="image/*"
                      disabled={isCompressingFoto || isSubmitting}
                      onChange={handleFotoChange}
                      className="h-7 text-[11px] file:mr-1.5 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[10px] file:bg-primary file:text-primary-foreground"
                    />
                    <p className="text-[10px] text-muted-foreground truncate">
                      {isCompressingFoto
                        ? 'Otimizando JPEG...'
                        : fotoOriginalInfo
                          ? `${Math.round(fotoOriginalInfo.originalSize / 1024)}KB → ${Math.max(1, Math.round(fotoOriginalInfo.compressedSize / 1024))}KB (JPEG)`
                          : 'Auto 300×300 JPEG'}
                    </p>
                  </div>
                </div>

                {/* Coluna de Identificação (Nome + Vínculo) */}
                <div className="sm:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="fornecedor-nome" className="text-[11px] font-semibold">
                      Nome do Fornecedor <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="fornecedor-nome"
                      required
                      placeholder="Nome completo ou Razão Social"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="fornecedor-vinculo" className="text-[11px] font-semibold">
                      Vínculo <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={vinculo}
                      onValueChange={(val: FornecedorVinculo) => setVinculo(val)}
                    >
                      <SelectTrigger id="fornecedor-vinculo" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COOPERADO">Cooperado</SelectItem>
                        <SelectItem value="EXTERNO">Externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Linha 2: Documento (CPF/CNPJ), WhatsApp, Sexo e Nascimento */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="fornecedor-identidade" className="text-[11px] font-medium">
                    CPF ou CNPJ
                  </Label>
                  <Input
                    id="fornecedor-identidade"
                    placeholder="000.000.000-00 ou CNPJ"
                    value={identidade}
                    onChange={(e) => setIdentidade(formatarDocumentoIdentidade(e.target.value))}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fornecedor-whatsapp" className="text-[11px] font-medium">
                    WhatsApp
                  </Label>
                  <Input
                    id="fornecedor-whatsapp"
                    placeholder="(00) 00000-0000"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(formatarWhatsApp(e.target.value))}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fornecedor-sexo" className="text-[11px] font-medium">
                    Sexo
                  </Label>
                  <Select value={sexo} onValueChange={setSexo}>
                    <SelectTrigger id="fornecedor-sexo" className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MASCULINO">Masculino</SelectItem>
                      <SelectItem value="FEMININO">Feminino</SelectItem>
                      <SelectItem value="OUTRO">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fornecedor-nascimento" className="text-[11px] font-medium">
                    Nascimento
                  </Label>
                  <Input
                    id="fornecedor-nascimento"
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Linha 3: Endereço (Propriedade) + Bairro */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="fornecedor-endereco" className="text-[11px] font-medium">
                    Endereço / Propriedade Rural
                  </Label>
                  <Input
                    id="fornecedor-endereco"
                    placeholder="Linha, Estrada, Rua, Comunidade..."
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fornecedor-bairro" className="text-[11px] font-medium">
                    Bairro / Localidade
                  </Label>
                  <Input
                    id="fornecedor-bairro"
                    placeholder="Distrito ou Bairro"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Linha 4: CEP, Latitude, Longitude + Validade do CAF integrado */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end">
                <div className="space-y-1">
                  <Label htmlFor="fornecedor-cep" className="text-[11px] font-medium">
                    CEP
                  </Label>
                  <Input
                    id="fornecedor-cep"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => setCep(formatarCEP(e.target.value))}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fornecedor-latitude" className="text-[11px] font-medium">
                    Latitude
                  </Label>
                  <Input
                    id="fornecedor-latitude"
                    placeholder="Ex: -27.5954"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fornecedor-longitude" className="text-[11px] font-medium">
                    Longitude
                  </Label>
                  <Input
                    id="fornecedor-longitude"
                    placeholder="Ex: -48.5480"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Validade do CAF com destaque compacto para vencido */}
                <div
                  className={`space-y-1 p-1.5 rounded-md border transition-colors ${
                    formCafStatus.isVencido
                      ? 'bg-red-50/90 border-red-300 dark:bg-red-950/40 dark:border-red-800'
                      : formCafStatus.status === 'valido'
                        ? 'bg-emerald-50/60 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800'
                        : 'bg-muted/10 border-border/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <Label
                      htmlFor="fornecedor-caf"
                      className={`text-[11px] font-semibold truncate ${
                        formCafStatus.isVencido ? 'text-red-700 dark:text-red-400' : ''
                      }`}
                    >
                      Validade CAF
                    </Label>
                    {formCafStatus.isVencido && (
                      <Badge
                        variant="destructive"
                        className="text-[9px] px-1 py-0 uppercase shrink-0"
                      >
                        Vencido
                      </Badge>
                    )}
                    {formCafStatus.status === 'valido' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 text-emerald-700 border-emerald-300 shrink-0"
                      >
                        Válido
                      </Badge>
                    )}
                  </div>
                  <Input
                    id="fornecedor-caf"
                    type="date"
                    value={dataValidadeCaf}
                    onChange={(e) => setDataValidadeCaf(e.target.value)}
                    className={`h-8 text-xs ${
                      formCafStatus.isVencido
                        ? 'border-red-400 focus-visible:ring-red-400 bg-white dark:bg-background'
                        : ''
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Footer Fixo: sempre visível sem rolagem */}
            <DialogFooter className="pt-2 border-t mt-1 shrink-0 flex-row justify-end gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || isCompressingFoto}
                className="gap-1.5 shadow-xs font-semibold"
              >
                {(isSubmitting || isCompressingFoto) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
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
