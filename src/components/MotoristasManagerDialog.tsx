import React, { useState, useEffect } from 'react'
import { motoristasService } from '@/services/motoristas'
import type { MotoristaRecord } from '@/lib/types'
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  User,
  Plus,
  Pencil,
  Phone,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface MotoristasManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMotoristasChanged?: () => void
}

export const MotoristasManagerDialog: React.FC<MotoristasManagerDialogProps> = ({
  open,
  onOpenChange,
  onMotoristasChanged,
}) => {
  const [motoristas, setMotoristas] = useState<MotoristaRecord[]>([])
  const [loading, setLoading] = useState(false)

  // Formulário de criação/edição
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)

  const carregarMotoristas = async () => {
    setLoading(true)
    try {
      const lista = await motoristasService.getAll()
      setMotoristas(lista)
    } catch (e) {
      console.error('Erro ao carregar motoristas:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      carregarMotoristas()
    }
  }, [open])

  const handleOpenCreate = () => {
    setEditingId(null)
    setNome('')
    setTelefone('')
    setAtivo(true)
    setObservacoes('')
    setFormOpen(true)
  }

  const handleOpenEdit = (mot: MotoristaRecord) => {
    setEditingId(mot.id)
    setNome(mot.nome)
    setTelefone(mot.telefone || '')
    setAtivo(mot.ativo)
    setObservacoes(mot.observacoes || '')
    setFormOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do motorista.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await motoristasService.update(editingId, {
          nome,
          telefone,
          ativo,
          observacoes,
        })
        toast({ title: 'Motorista atualizado com sucesso!' })
      } else {
        await motoristasService.create({
          nome,
          telefone,
          ativo,
          observacoes,
        })
        toast({ title: 'Motorista cadastrado com sucesso!' })
      }
      setFormOpen(false)
      await carregarMotoristas()
      onMotoristasChanged?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Falha ao salvar motorista',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAtivo = async (mot: MotoristaRecord) => {
    try {
      await motoristasService.toggleAtivo(mot.id, mot.ativo)
      await carregarMotoristas()
      onMotoristasChanged?.()
      toast({
        title: mot.ativo ? 'Motorista desativado' : 'Motorista ativado',
      })
    } catch (err) {
      toast({
        title: 'Erro ao alterar status',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (mot: MotoristaRecord) => {
    if (!confirm(`Deseja realmente excluir o cadastro do motorista "${mot.nome}"?`)) {
      return
    }
    try {
      await motoristasService.delete(mot.id)
      await carregarMotoristas()
      onMotoristasChanged?.()
      toast({ title: 'Motorista removido' })
    } catch (err) {
      toast({
        title: 'Erro ao excluir motorista',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Cadastro de Motoristas
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre os motoristas que realizam as entregas nas rotas. O acesso à rota ocorre
              através do link gerado no despacho (sem senha).
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-xs font-semibold text-muted-foreground">
              {motoristas.length} motorista(s) cadastrado(s)
            </span>
            <Button size="sm" onClick={handleOpenCreate} className="h-8 text-xs gap-1.5 font-bold">
              <Plus className="h-3.5 w-3.5" />
              Novo Motorista
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 min-h-[220px]">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Carregando motoristas...
              </div>
            ) : motoristas.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground">
                Nenhum motorista cadastrado ainda. Clique em "Novo Motorista" para adicionar.
              </div>
            ) : (
              motoristas.map((mot) => (
                <div
                  key={mot.id}
                  className="p-3 rounded-lg border bg-card text-xs flex items-center justify-between gap-3 shadow-xs hover:border-primary/40 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{mot.nome}</span>
                      {mot.ativo ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground text-[10px] px-1.5 py-0"
                        >
                          Inativo
                        </Badge>
                      )}
                    </div>

                    {mot.telefone && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {mot.telefone}
                      </p>
                    )}

                    {mot.observacoes && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 italic">
                        {mot.observacoes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAtivo(mot)}
                      className="h-7 px-2 text-[11px]"
                      title={mot.ativo ? 'Desativar motorista' : 'Ativar motorista'}
                    >
                      {mot.ativo ? 'Desativar' : 'Ativar'}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleOpenEdit(mot)}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Editar motorista"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(mot)}
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      title="Excluir motorista"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {editingId ? 'Editar Motorista' : 'Novo Motorista'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Informe os dados básicos do motorista para despacho das rotas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
              <div className="space-y-1">
                <Label htmlFor="mot-nome" className="font-semibold">
                  Nome Completo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="mot-nome"
                  placeholder="Ex: Carlos Eduardo da Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="mot-tel" className="font-semibold">
                  Telefone / WhatsApp (Opcional)
                </Label>
                <Input
                  id="mot-tel"
                  placeholder="Ex: (41) 98765-4321"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <Label htmlFor="mot-ativo" className="font-semibold cursor-pointer">
                  Motorista Ativo
                </Label>
                <Switch id="mot-ativo" checked={ativo} onCheckedChange={setAtivo} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="mot-obs" className="font-semibold">
                  Observações (Opcional)
                </Label>
                <Textarea
                  id="mot-obs"
                  placeholder="Ex: Veículo HR placa ABC-1234, CNH categoria D..."
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setFormOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !nome.trim()} className="text-xs font-bold">
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Salvando...
                  </>
                ) : (
                  'Salvar Motorista'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
