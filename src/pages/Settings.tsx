import React, { useState, useEffect, useRef } from 'react'
import {
  Settings,
  Building2,
  Sparkles,
  Save,
  Loader2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Crown,
  ShieldAlert,
  Upload,
  Image,
  Trash2,
} from 'lucide-react'
import { configuracoesService } from '@/services/configuracoes'
import type { ConfiguracoesRecord } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfiguracoesRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Formulário
  const [nomeCooperativa, setNomeCooperativa] = useState(
    'CooperGestão — Cooperativa Agrícola Familiar',
  )
  const [sigla, setSigla] = useState('COOPGESTÃO')
  const [cnpj, setCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidadeUf, setCidadeUf] = useState('Região Serrana - RJ')
  const [exibirAtalhosDemo, setExibirAtalhosDemo] = useState(true)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoRemoved, setLogoRemoved] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadConfiguracoes = () => {
    return configuracoesService
      .get()
      .then((data) => {
        if (data) {
          setConfig(data)
          setNomeCooperativa(data.nome_cooperativa || '')
          setSigla(data.sigla || '')
          setCnpj(data.cnpj || '')
          setTelefone(data.telefone || '')
          setEmail(data.email || '')
          setCidadeUf(data.cidade_uf || '')
          setExibirAtalhosDemo(data.exibir_atalhos_demo !== false)
          const existingUrl = configuracoesService.getLogoUrl(data)
          setLogoPreview(existingUrl || null)
          setLogoRemoved(false)
        }
        setIsLoading(false)
      })
      .catch((err) => {
        console.error('Erro ao carregar configurações:', err)
        toast.error('Erro ao carregar parâmetros da cooperativa.')
        setIsLoading(false)
      })
  }

  useEffect(() => {
    loadConfiguracoes()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nomeCooperativa.trim()) {
      toast.error('O nome da cooperativa é obrigatório.')
      return
    }

    setIsSaving(true)
    try {
      let saved: ConfiguracoesRecord

      // Sempre que houver novo arquivo ou remoção explícita de logotipo, ou para manter coerência multipart
      if (logoFile) {
        const formData = new FormData()
        formData.append('nome_cooperativa', nomeCooperativa.trim())
        formData.append('sigla', sigla.trim())
        formData.append('cnpj', cnpj.trim())
        formData.append('telefone', telefone.trim())
        formData.append('email', email.trim())
        formData.append('cidade_uf', cidadeUf.trim())
        formData.append('exibir_atalhos_demo', String(exibirAtalhosDemo))
        formData.append('logotipo', logoFile)
        saved = await configuracoesService.save(formData, config?.id)
      } else if (logoRemoved) {
        // No PocketBase, passar null ou string vazia no campo file remove o arquivo existente
        const formData = new FormData()
        formData.append('nome_cooperativa', nomeCooperativa.trim())
        formData.append('sigla', sigla.trim())
        formData.append('cnpj', cnpj.trim())
        formData.append('telefone', telefone.trim())
        formData.append('email', email.trim())
        formData.append('cidade_uf', cidadeUf.trim())
        formData.append('exibir_atalhos_demo', String(exibirAtalhosDemo))
        formData.append('logotipo', '')
        saved = await configuracoesService.save(formData, config?.id)
      } else {
        saved = await configuracoesService.save(
          {
            nome_cooperativa: nomeCooperativa.trim(),
            sigla: sigla.trim(),
            cnpj: cnpj.trim(),
            telefone: telefone.trim(),
            email: email.trim(),
            cidade_uf: cidadeUf.trim(),
            exibir_atalhos_demo: exibirAtalhosDemo,
          },
          config?.id,
        )
      }

      setConfig(saved)
      const newUrl = configuracoesService.getLogoUrl(saved)
      setLogoPreview(newUrl || null)
      setLogoFile(null)
      setLogoRemoved(false)
      toast.success('Configurações e logotipo da cooperativa salvos com sucesso!')
    } catch (err: any) {
      console.error('Erro detalhado ao salvar configurações:', err)
      const errMsg =
        err?.data?.message ||
        err?.message ||
        'Falha ao salvar configurações. Verifique os dados e permissões.'
      toast.error(errMsg)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Carregando configurações institucionais...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          <span>Configurações da Cooperativa</span>
          <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400 border border-amber-600/20 text-xs ml-2">
            <Crown className="h-3 w-3 mr-1 inline" /> Exclusivo MASTER
          </Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Parâmetros institucionais da cooperativa agrícola exibidos em relatórios, atestos
          timbrados e controle de ambiente de autenticação.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card: Controle de Acesso e Modo Demonstração */}
        <Card className="border-border shadow-sm border-l-4 border-l-amber-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base font-semibold">
                Controle de Atalhos Demo na Tela de Login
              </CardTitle>
            </div>
            <CardDescription>
              Permite ligar ou desligar os botões de preenchimento rápido (Master/Secretária) na
              tela de login. Para uso em produção, recomenda-se desativá-los.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/40 border border-border">
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="demoToggle"
                    className="font-medium text-foreground cursor-pointer"
                  >
                    Exibir botões de login rápido para demonstração
                  </Label>
                  <Badge
                    variant={exibirAtalhosDemo ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {exibirAtalhosDemo ? 'Ativo' : 'Oculto'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, exibe atalhos na tela pública de login. Desative para ambiente de
                  produção real para que cada operador use suas próprias credenciais.
                </p>
              </div>
              <Switch
                id="demoToggle"
                checked={exibirAtalhosDemo}
                onCheckedChange={setExibirAtalhosDemo}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card: Dados Institucionais da Cooperativa */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Dados Institucionais</CardTitle>
            </div>
            <CardDescription>
              Essas informações alimentam os cabeçalhos de Atestos de Entrega, comprovantes e
              exportações contábeis em PDF e Excel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="nomeCooperativa">Razão Social / Nome da Cooperativa</Label>
                <Input
                  id="nomeCooperativa"
                  value={nomeCooperativa}
                  onChange={(e) => setNomeCooperativa(e.target.value)}
                  placeholder="Cooperativa dos Produtores Rurais Familiares"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sigla">Sigla / Nome Fantasia</Label>
                <Input
                  id="sigla"
                  value={sigla}
                  onChange={(e) => setSigla(e.target.value)}
                  placeholder="Ex: COOPGESTÃO"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cidadeUf">Município / Estado</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cidadeUf"
                    value={cidadeUf}
                    onChange={(e) => setCidadeUf(e.target.value)}
                    placeholder="Ex: Nova Friburgo - RJ"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <Separator className="my-2" />

            {/* Campo de Logotipo */}
            <div className="space-y-2 pt-1">
              <Label className="text-sm font-medium">
                Logotipo da Cooperativa (para Termo de Recebimento e Relatórios)
              </Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-lg bg-muted/20 border">
                {logoPreview ? (
                  <div className="relative group border rounded-md p-1 bg-white flex items-center justify-center w-28 h-20 shadow-xs">
                    <img
                      src={logoPreview}
                      alt="Logotipo da Cooperativa"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="border border-dashed rounded-md w-28 h-20 flex flex-col items-center justify-center text-muted-foreground bg-muted/40 text-xs">
                    <Image className="h-6 w-6 mb-1 opacity-50" />
                    <span>Sem logo</span>
                  </div>
                )}

                <div className="space-y-1.5 flex-1">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error('Imagem muito grande. Máximo permitido: 5MB.')
                          return
                        }
                        setLogoFile(file)
                        const reader = new FileReader()
                        reader.onloadend = () => setLogoPreview(reader.result as string)
                        reader.readAsDataURL(file)
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {logoPreview ? 'Alterar Logotipo' : 'Selecionar Imagem'}
                    </Button>
                    {logoPreview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setLogoFile(null)
                          setLogoPreview(null)
                          setLogoRemoved(true)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: PNG, JPG ou WEBP até 5MB. Aplicado no aplicativo (menu lateral
                    desktop, cabeçalho mobile, tela de login, favicon da aba) e no cabeçalho oficial
                    do documento Atesto.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone de Contato</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(21) 2222-3333"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail Institucional</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@cooperativa.org.br"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t pt-4 bg-muted/10">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Modificações terão efeito imediato para todos os usuários</span>
            </div>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
