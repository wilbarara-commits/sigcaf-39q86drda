import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  MapPin,
  Sparkles,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { normalizeName } from '@/lib/excelImporter'
import pb from '@/lib/pocketbase/client'
import { escolasService } from '@/services/escolas'
import { contratosService } from '@/services/contratos'
import type { School, Contract } from '@/lib/types'
import { RouteSchoolBatchImportModal } from '@/components/RouteSchoolBatchImportModal'

export interface ContractRouteInfo {
  id?: string
  nome: string
  ordem?: number
}

interface ContractRouteSchoolEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: Contract | null
  route: ContractRouteInfo | null
  allContracts: Contract[]
  masterSchools: School[]
  onSuccess: () => Promise<void> | void
}

export function ContractRouteSchoolEditorDialog({
  open,
  onOpenChange,
  contract,
  route,
  allContracts,
  masterSchools,
  onSuccess,
}: ContractRouteSchoolEditorDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [newSchoolName, setNewSchoolName] = useState('')
  const [newSchoolAddress, setNewSchoolAddress] = useState('')
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [batchImportOpen, setBatchImportOpen] = useState(false)

  // Identificação do nome da rota selecionada
  const currentRouteName = route?.nome || ''

  // Escolas atualmente vinculadas a ESTA rota no contrato atual
  const schoolsInCurrentRoute = useMemo(() => {
    if (!contract || !currentRouteName) return []
    return contract.escolas.filter((e) => {
      const r = (e.rotaPlanilha || e.rotaNome || '').trim().toLowerCase()
      return r === currentRouteName.trim().toLowerCase()
    })
  }, [contract, currentRouteName])

  // Mapeamento de escolas e suas rotas atuais para a REGRA DE EXCLUSIVIDADE:
  // "Uma escola só pode ser incluída em uma rota se não estiver alocada a outra rota."
  // Verificamos vínculos no contrato atual e em outros contratos.
  const schoolAllocationMap = useMemo(() => {
    const map = new Map<
      string,
      {
        contratoId: string
        contratoNumero: string
        isCurrentContract: boolean
        rotaNome: string
        contratoEscolaId?: string
      }
    >()

    for (const c of allContracts) {
      const isCur = c.id === contract?.id
      for (const e of c.escolas) {
        const rNome = (e.rotaPlanilha || e.rotaNome || '').trim()
        if (rNome && rNome !== 'Sem Rota') {
          // Salva ou prioriza o contrato atual
          if (!map.has(e.escolaId) || isCur) {
            map.set(e.escolaId, {
              contratoId: c.id,
              contratoNumero: c.numero,
              isCurrentContract: isCur,
              rotaNome: rNome,
              contratoEscolaId: e.id,
            })
          }
        }
      }
    }

    return map
  }, [allContracts, contract])

  // Filtragem e busca de escolas mestres para inclusão
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const currentSchoolIds = new Set(schoolsInCurrentRoute.map((s) => s.escolaId))

    return masterSchools
      .filter((s) => {
        // Exclui escolas já presentes na rota atual
        if (currentSchoolIds.has(s.id)) return false
        return (
          s.name.toLowerCase().includes(q) ||
          (s.address && s.address.toLowerCase().includes(q)) ||
          (s.tipo && s.tipo.toLowerCase().includes(q))
        )
      })
      .slice(0, 10)
  }, [searchQuery, schoolsInCurrentRoute, masterSchools])

  // Resetar estado quando fecha
  const handleClose = () => {
    setSearchQuery('')
    setNewSchoolName('')
    setNewSchoolAddress('')
    setShowQuickCreate(false)
    onOpenChange(false)
  }

  // 1. Incluir escola existente na rota
  const handleIncludeSchool = async (school: School) => {
    if (!contract || !currentRouteName) return

    // REGRA DE EXCLUSIVIDADE
    const allocation = schoolAllocationMap.get(school.id)
    if (allocation) {
      if (
        allocation.isCurrentContract &&
        allocation.rotaNome.toLowerCase() === currentRouteName.toLowerCase()
      ) {
        toast.info(`A escola "${school.name}" já está incluída nesta aba.`)
        return
      }

      if (allocation.isCurrentContract) {
        toast.error(
          `Bloqueio de Exclusividade: A escola "${school.name}" já está alocada na aba "${allocation.rotaNome}" deste contrato. Retire-a da outra aba antes de incluir aqui.`,
        )
        return
      }

      // Se está em outro contrato ativo
      toast.error(
        `Bloqueio de Exclusividade: A escola "${school.name}" já está alocada na aba "${allocation.rotaNome}" do Contrato ${allocation.contratoNumero}. Desvincule-a primeiro para incluir nesta aba.`,
      )
      return
    }

    setIsProcessing(true)
    try {
      // Cria ou atualiza o vínculo contrato_escolas
      await contratosService.linkEscola({
        contrato_id: contract.id,
        escola_id: school.id,
        rota_id: route?.id || undefined,
        rota: currentRouteName,
      })

      toast.success(`Escola "${school.name}" incluída na aba "${currentRouteName}" com sucesso!`)
      setSearchQuery('')
      await onSuccess()
    } catch (err: any) {
      console.error('Erro ao incluir escola na aba:', err)
      toast.error(err?.message || 'Falha ao incluir escola na aba do contrato.')
    } finally {
      setIsProcessing(false)
    }
  }

  // 2. Criar nova escola no cadastro mestre e incluir na rota
  const handleCreateAndIncludeSchool = async () => {
    if (!contract || !currentRouteName) return
    const trimmed = newSchoolName.trim()
    if (!trimmed) {
      toast.error('Informe o nome da escola.')
      return
    }

    setIsProcessing(true)
    try {
      // Normalização sem acentos/maiúsculas para checar duplicados igual ao importador
      const normalizedTarget = normalizeName(trimmed)
      let targetSchool = masterSchools.find((s) => normalizeName(s.name) === normalizedTarget)

      if (targetSchool) {
        // Já existe no cadastro mestre: verificar exclusividade
        const allocation = schoolAllocationMap.get(targetSchool.id)
        if (allocation) {
          toast.error(
            `A escola "${targetSchool.name}" já existe no cadastro mestre e está alocada na aba "${allocation.rotaNome}" (${allocation.isCurrentContract ? 'deste contrato' : `Contrato ${allocation.contratoNumero}`}).`,
          )
          setIsProcessing(false)
          return
        }
      } else {
        // Criar no cadastro mestre
        const created = await escolasService.create({
          nome: trimmed,
          endereco: newSchoolAddress.trim(),
          telefone: '',
          rota: '',
        })
        targetSchool = {
          id: created.id,
          name: created.nome,
          address: created.endereco || '',
          contact: created.telefone || '',
          email: created.email || '',
          bairro: created.bairro || '',
          contatoResponsavel: created.contato || '',
          tipo: created.tipo || '',
          alunos: created.alunos || 0,
          route: '',
        }
        toast.success(`Escola "${trimmed}" cadastrada no cadastro mestre global!`)
      }

      // Vincular ao contrato na aba atual
      await contratosService.linkEscola({
        contrato_id: contract.id,
        escola_id: targetSchool.id,
        rota_id: route?.id || undefined,
        rota: currentRouteName,
      })

      toast.success(`Escola "${targetSchool.name}" incluída na aba "${currentRouteName}"!`)
      setNewSchoolName('')
      setNewSchoolAddress('')
      setShowQuickCreate(false)
      setSearchQuery('')
      await onSuccess()
    } catch (err: any) {
      console.error('Erro ao cadastrar e incluir escola:', err)
      toast.error('Falha ao registrar e vincular escola.')
    } finally {
      setIsProcessing(false)
    }
  }

  // 3. Retirar escola da rota
  const handleRemoveSchool = async (escolaId: string, escolaNome: string) => {
    if (!contract) return
    setIsProcessing(true)
    try {
      // 1. Buscar os vínculos atuais do banco e deletar cada um, tolerando 404
      const currentLinks = await pb.collection('contrato_escolas').getFullList({
        filter: `contrato_id = "${contract.id}" && escola_id = "${escolaId}"`,
      })

      if (currentLinks.length > 0) {
        for (const cl of currentLinks) {
          try {
            await pb.collection('contrato_escolas').delete(cl.id)
          } catch (err: any) {
            if (err?.status !== 404) throw err
          }
        }
      } else {
        // 2. Fallback: se a busca não retornar nada, tentar deletar pelo link.id em memória, também tolerando 404
        const link = contract.escolas.find((e) => e.escolaId === escolaId)
        if (link?.id) {
          try {
            await pb.collection('contrato_escolas').delete(link.id)
          } catch (err: any) {
            if (err?.status !== 404) throw err
          }
        }
      }

      // 3. Limpeza defensiva do campo legado: pb.collection('escolas').update(escolaId, { rota: '' }) com try/catch silencioso
      try {
        await pb.collection('escolas').update(escolaId, { rota: '' })
      } catch {
        // Silencioso se campo não existir ou falhar
      }

      // 4. toast de sucesso com nome da escola e da rota, e await onSuccess() para refreshData() atualizar
      toast.success(
        `Escola "${escolaNome}" retirada da aba "${currentRouteName}". O cadastro mestre agora reflete o desvínculo.`,
      )
      await onSuccess()
    } catch (err: any) {
      console.error('Erro ao retirar escola da aba:', err)
      toast.error('Falha ao desvincular escola da aba.')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!contract || !route) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Editar Aba: <span className="text-primary">{currentRouteName}</span>
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              Contrato {contract.numero}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            Gerencie as escolas alocadas nesta aba da planilha. As alterações são sincronizadas no
            cadastro mestre global e no contrato. Uma escola só pode pertencer a uma aba por vez.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1 py-1">
          {/* Seção 1: Escolas Atualmente na Aba */}
          <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-primary" />
                Escolas Alocadas nesta Aba ({schoolsInCurrentRoute.length})
              </Label>
              <Badge variant="secondary" className="text-[10px]">
                {schoolsInCurrentRoute.length === 1
                  ? '1 escola'
                  : `${schoolsInCurrentRoute.length} escolas`}
              </Badge>
            </div>

            {schoolsInCurrentRoute.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-md bg-background/50">
                Nenhuma escola alocada nesta aba ainda. Busque ou adicione abaixo para incluir.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                {schoolsInCurrentRoute.map((esc) => {
                  const master = masterSchools.find((s) => s.id === esc.escolaId)
                  return (
                    <div
                      key={esc.id || esc.escolaId}
                      className="flex items-center justify-between p-2 rounded border bg-background text-xs shadow-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground truncate">
                            {esc.escolaNome}
                          </span>
                          {master?.tipo && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1">
                              {master.tipo}
                            </Badge>
                          )}
                        </div>
                        {master?.address && (
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {master.address}
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => handleRemoveSchool(esc.escolaId, esc.escolaNome)}
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 gap-1"
                        title="Retirar escola desta aba"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Retirar
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Seção 2: Incluir Escola na Aba */}
          <div className="space-y-3 p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Incluir Escola nesta Aba
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] gap-1 px-2 border-primary/40 text-primary hover:bg-primary/5"
                  onClick={() => setBatchImportOpen(true)}
                  title="Importar planilha Excel, Word, CSV ou texto simples em lote"
                >
                  <Upload className="h-3 w-3" />
                  Selecionar Arquivo (Excel/Word/CSV/TXT)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-primary p-1"
                  onClick={() => setShowQuickCreate(!showQuickCreate)}
                >
                  {showQuickCreate ? 'Buscar Existente' : '+ Cadastrar Nova'}
                </Button>
              </div>
            </div>

            {/* Painel de busca no cadastro mestre */}
            {!showQuickCreate ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Digite o nome ou endereço da escola para incluir..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs bg-background"
                    disabled={isProcessing}
                  />
                </div>

                {searchQuery.trim() && (
                  <div className="space-y-1.5 max-h-[190px] overflow-y-auto border rounded-md p-1 bg-muted/10">
                    {searchResults.length === 0 ? (
                      <div className="py-3 px-2 text-center text-xs text-muted-foreground">
                        Nenhuma escola encontrada com "{searchQuery}".{' '}
                        <button
                          type="button"
                          className="text-primary underline font-medium hover:opacity-80"
                          onClick={() => {
                            setNewSchoolName(searchQuery.trim())
                            setShowQuickCreate(true)
                          }}
                        >
                          Cadastrar como nova escola
                        </button>
                      </div>
                    ) : (
                      searchResults.map((sch) => {
                        const alloc = schoolAllocationMap.get(sch.id)
                        const isBlocked = Boolean(alloc)

                        return (
                          <div
                            key={sch.id}
                            className={`flex items-center justify-between p-2 rounded text-xs border ${
                              isBlocked
                                ? 'bg-muted/40 opacity-70 border-muted'
                                : 'bg-background hover:border-primary/40'
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-foreground truncate">
                                  {sch.name}
                                </span>
                                {sch.tipo && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1">
                                    {sch.tipo}
                                  </Badge>
                                )}
                              </div>
                              {sch.address && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {sch.address}
                                </p>
                              )}
                              {alloc && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  Alocada na aba "{alloc.rotaNome}" (
                                  {alloc.isCurrentContract
                                    ? 'deste contrato'
                                    : `Contrato ${alloc.contratoNumero}`}
                                  )
                                </p>
                              )}
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant={isBlocked ? 'secondary' : 'default'}
                              disabled={isProcessing || isBlocked}
                              onClick={() => handleIncludeSchool(sch)}
                              className="h-7 text-xs shrink-0 gap-1"
                            >
                              {isBlocked ? (
                                'Já Alocada'
                              ) : (
                                <>
                                  <Plus className="h-3 w-3" /> Incluir
                                </>
                              )}
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Formulário de criação rápida de escola */
              <div className="p-3 rounded-md border border-primary/30 bg-primary/5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Nova Escola no Cadastro Mestre
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Será salva no mestre e alocada nesta aba
                  </span>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="route-new-school-name" className="text-[11px]">
                    Nome da Instituição <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="route-new-school-name"
                    placeholder="Ex: E.M. Paulo Freire"
                    value={newSchoolName}
                    onChange={(e) => setNewSchoolName(e.target.value)}
                    className="h-8 text-xs bg-background"
                    disabled={isProcessing}
                    autoFocus
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="route-new-school-addr" className="text-[11px]">
                    Endereço (opcional)
                  </Label>
                  <Input
                    id="route-new-school-addr"
                    placeholder="Rua, número, bairro..."
                    value={newSchoolAddress}
                    onChange={(e) => setNewSchoolAddress(e.target.value)}
                    className="h-8 text-xs bg-background"
                    disabled={isProcessing}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowQuickCreate(false)}
                    disabled={isProcessing}
                  >
                    Voltar para Busca
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={isProcessing || !newSchoolName.trim()}
                    onClick={handleCreateAndIncludeSchool}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Criar & Incluir na Aba
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t">
          <Button type="button" variant="outline" onClick={handleClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Modal para seleção e importação de arquivo (Excel, Word, CSV, TXT) */}
      <RouteSchoolBatchImportModal
        open={batchImportOpen}
        onOpenChange={setBatchImportOpen}
        targetRouteName={currentRouteName}
        targetRouteId={route?.id}
        targetRouteType="planilha"
        contract={contract}
        allContracts={allContracts}
        masterSchools={masterSchools}
        onSuccess={async () => {
          await onSuccess()
        }}
      />
    </Dialog>
  )
}
