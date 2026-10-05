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
  Warehouse,
  RotateCcw,
  Navigation,
} from 'lucide-react'
import { configuracoesService } from '@/services/configuracoes'
import type { ConfiguracoesRecord } from '@/lib/types'
import { DEPOSITO_CENTRAL, extrairCoordenadas } from '@/lib/routeOptimization'
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
import { useApp } from '@/context/app-context'

export default function SettingsPage() {
  const { refreshData } = useApp()
  const [config, setConfig] = useState<ConfiguracoesRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Formulário
  const [nomeCooperativa, setNomeCooperativa] = useState(
    'CooperGestão — Cooperativa Agrícola Familiar',
  )
  const [sigla, setSigla] = useState('COOPGESTÃO')
  const [subtituloSistema, setSubtituloSistema] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidadeUf, setCidadeUf] = useState('Região Serrana - RJ')
  const [exibirAtalhosDemo, setExibirAtalhosDemo] = useState(true)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoRemoved, setLogoRemoved] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Depósito Central (origem das rotas)
  const [depositoNome, setDepositoNome] = useState<string>(DEPOSITO_CENTRAL.nome)
  const [depositoLatitude, setDepositoLatitude] = useState(String(DEPOSITO_CENTRAL.latitude))
  const [depositoLongitude, setDepositoLongitude] = useState(String(DEPOSITO_CENTRAL.longitude))

  // Configurações de Emissão de Atestos
  const [atestoVias, setAtestoVias] = useState<number>(2)
  const [atestoVia1Rotulo, setAtestoVia1Rotulo] = useState<string>('Escola')
  const [atestoVia2Rotulo, setAtestoVia2Rotulo] = useState<string>('Cooperativa')

  const loadConfiguracoes = () => {
    return configuracoesService
      .get()
      .then((data) => {
        if (data) {
          setConfig(data)
          setNomeCooperativa(data.nome_cooperativa || '')
          setSigla(data.sigla || '')
          setSubtituloSistema(data.subtitulo_sistema || '')
          setCnpj(data.cnpj || '')
          setTelefone(data.telefone || '')
          setEmail(data.email || '')
          setCidadeUf(data.cidade_uf || '')
          setExibirAtalhosDemo(data.exibir_atalhos_demo !== false)
          const existingUrl = configuracoesService.getLogoUrl(data)
          setLogoPreview(existingUrl || null)
          setLogoRemoved(false)
          setDepositoNome(data.deposito_nome || DEPOSITO_CENTRAL.nome)
          setDepositoLatitude(
            data.deposito_latitude !== undefined && data.deposito_latitude !== ''
              ? String(data.deposito_latitude)
              : String(DEPOSITO_CENTRAL.latitude),
          )
          setDepositoLongitude(
            data.deposito_longitude !== undefined && data.deposito_longitude !== ''
              ? String(data.deposito_longitude)
              : String(DEPOSITO_CENTRAL.longitude),
          )
          setAtestoVias(data.atesto_vias === 1 ? 1 : 2)
          setAtestoVia1Rotulo(
            data.atesto_via1_rotulo !== undefined && data.atesto_via1_rotulo !== null
              ? data.atesto_via1_rotulo
              : 'Escola',
          )
          setAtestoVia2Rotulo(
            data.atesto_via2_rotulo !== undefined && data.atesto_via2_rotulo !== null
              ? data.atesto_via2_rotulo
              : 'Cooperativa',
          )
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

    // Normalização e validação das coordenadas do Depósito Central
    const nomeDepFinal = depositoNome.trim() || DEPOSITO_CENTRAL.nome
    const rawLat = depositoLatitude.trim()
    const rawLon = depositoLongitude.trim()

    let latFinal = String(DEPOSITO_CENTRAL.latitude)
    let lonFinal = String(DEPOSITO_CENTRAL.longitude)

    if (rawLat === '' || rawLon === '') {
      toast.info(
        `Coordenadas em branco: utilizando coordenadas padrão do ${DEPOSITO_CENTRAL.nome} (${DEPOSITO_CENTRAL.latitude}, ${DEPOSITO_CENTRAL.longitude}).`,
      )
      setDepositoLatitude(latFinal)
      setDepositoLongitude(lonFinal)
    } else {
      const parsedCoords = extrairCoordenadas(rawLat, rawLon)
      if (!parsedCoords) {
        toast.warning(
          `Coordenadas inválidas: utilizando coordenadas padrão (${DEPOSITO_CENTRAL.latitude}, ${DEPOSITO_CENTRAL.longitude}). Verifique se latitude [-90 a 90] e longitude [-180 a 180] são válidas.`,
        )
        setDepositoLatitude(latFinal)
        setDepositoLongitude(lonFinal)
      } else {
        latFinal = String(parsedCoords.latitude)
        lonFinal = String(parsedCoords.longitude)
        setDepositoLatitude(latFinal)
        setDepositoLongitude(lonFinal)
      }
    }

    setIsSaving(true)
    try {
      let saved: ConfiguracoesRecord

      // Sempre que houver novo arquivo ou remoção explícita de logotipo, ou para manter coerência multipart
      if (logoFile) {
        const formData = new FormData()
        formData.append('nome_cooperativa', nomeCooperativa.trim())
        formData.append('sigla', sigla.trim())
        formData.append('subtitulo_sistema', subtituloSistema.trim())
        formData.append('cnpj', cnpj.trim())
        formData.append('telefone', telefone.trim())
        formData.append('email', email.trim())
        formData.append('cidade_uf', cidadeUf.trim())
        formData.append('exibir_atalhos_demo', String(exibirAtalhosDemo))
        formData.append('logotipo', logoFile)
        formData.append('deposito_nome', nomeDepFinal)
        formData.append('deposito_latitude', latFinal)
        formData.append('deposito_longitude', lonFinal)
        formData.append('atesto_vias', String(atestoVias))
        formData.append('atesto_via1_rotulo', atestoVia1Rotulo)
        formData.append('atesto_via2_rotulo', atestoVia2Rotulo)
        saved = await configuracoesService.save(formData, config?.id)
      } else if (logoRemoved) {
        // No PocketBase, passar null ou string vazia no campo file remove o arquivo existente
        const formData = new FormData()
        formData.append('nome_cooperativa', nomeCooperativa.trim())
        formData.append('sigla', sigla.trim())
        formData.append('subtitulo_sistema', subtituloSistema.trim())
        formData.append('cnpj', cnpj.trim())
        formData.append('telefone', telefone.trim())
        formData.append('email', email.trim())
        formData.append('cidade_uf', cidadeUf.trim())
        formData.append('exibir_atalhos_demo', String(exibirAtalhosDemo))
        formData.append('logotipo', '')
        formData.append('deposito_nome', nomeDepFinal)
        formData.append('deposito_latitude', latFinal)
        formData.append('deposito_longitude', lonFinal)
        formData.append('atesto_vias', String(atestoVias))
        formData.append('atesto_via1_rotulo', atestoVia1Rotulo)
        formData.append('atesto_via2_rotulo', atestoVia2Rotulo)
        saved = await configuracoesService.save(formData, config?.id)
      } else {
        saved = await configuracoesService.save(
          {
            nome_cooperativa: nomeCooperativa.trim(),
            sigla: sigla.trim(),
            subtitulo_sistema: subtituloSistema.trim(),
            cnpj: cnpj.trim(),
            telefone: telefone.trim(),
            email: email.trim(),
            cidade_uf: cidadeUf.trim(),
            exibir_atalhos_demo: exibirAtalhosDemo,
            deposito_nome: nomeDepFinal,
            deposito_latitude: latFinal,
            deposito_longitude: lonFinal,
            atesto_vias: atestoVias,
            atesto_via1_rotulo: atestoVia1Rotulo,
            atesto_via2_rotulo: atestoVia2Rotulo,
          },
          config?.id,
        )
      }

      setConfig(saved)
      const newUrl = configuracoesService.getLogoUrl(saved)
      setLogoPreview(newUrl || null)
      setLogoFile(null)
      setLogoRemoved(false)
      await refreshData()
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

            <div className="space-y-2">
              <Label htmlFor="subtituloSistema">Subtítulo do Sistema (opcional)</Label>
              <Input
                id="subtituloSistema"
                value={subtituloSistema}
                onChange={(e) => setSubtituloSistema(e.target.value)}
                placeholder="Ex: CooperGestão (padrão)"
              />
              <p className="text-xs text-muted-foreground">
                Texto exibido abaixo da sigla no topo do menu lateral (desktop) e no menu gaveta
                (mobile). Se não informado, o sistema utilizará o padrão &quot;CooperGestão&quot;.
              </p>
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
        </Card>

        {/* Card: Configuração de Emissão de Atestos */}
        <Card className="border-border shadow-sm border-l-4 border-l-emerald-600">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base font-semibold">
                Emissão de Atestos (Termo de Recebimento)
              </CardTitle>
            </div>
            <CardDescription>
              Defina a quantidade de vias impressas por escola e os respectivos rótulos exibidos no
              rodapé do PDF oficial (ex.: &quot;Escola&quot; e &quot;Cooperativa&quot;).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Seletor de 1 ou 2 vias */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Quantidade de Vias por Escola</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAtestoVias(1)}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                    atestoVias === 1
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-600'
                      : 'border-border bg-card hover:border-emerald-500/40'
                  }`}
                >
                  <div
                    className={`h-4 w-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                      atestoVias === 1
                        ? 'border-emerald-600 bg-emerald-600'
                        : 'border-muted-foreground'
                    }`}
                  >
                    {atestoVias === 1 && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-foreground">1 Via (Página Única)</p>
                    <p className="text-xs text-muted-foreground">
                      Gera apenas 1 folha oficial por escola na impressão por rota.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAtestoVias(2)}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                    atestoVias === 2
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-600'
                      : 'border-border bg-card hover:border-emerald-500/40'
                  }`}
                >
                  <div
                    className={`h-4 w-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                      atestoVias === 2
                        ? 'border-emerald-600 bg-emerald-600'
                        : 'border-muted-foreground'
                    }`}
                  >
                    {atestoVias === 2 && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-foreground">
                      2 Vias (Padrão Operacional)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Gera 2 folhas por escola (uma para a escola e outra para a cooperativa).
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Rótulos das vias */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="atestoVia1Rotulo">
                  Rótulo da Via 1{' '}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  id="atestoVia1Rotulo"
                  value={atestoVia1Rotulo}
                  onChange={(e) => setAtestoVia1Rotulo(e.target.value)}
                  placeholder="Escola"
                />
                <p className="text-[11px] text-muted-foreground">
                  Identificador que aparece no rodapé do documento. Padrão: &quot;Escola&quot;. Pode
                  ficar em branco.
                </p>
              </div>

              {atestoVias === 2 && (
                <div className="space-y-2">
                  <Label htmlFor="atestoVia2Rotulo">
                    Rótulo da Via 2{' '}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="atestoVia2Rotulo"
                    value={atestoVia2Rotulo}
                    onChange={(e) => setAtestoVia2Rotulo(e.target.value)}
                    placeholder="Cooperativa"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Identificador da segunda folha no rodapé. Padrão: &quot;Cooperativa&quot;. Pode
                    ficar em branco.
                  </p>
                </div>
              )}
            </div>

            {/* Texto de Ajuda / Exemplo */}
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                Exemplo de rodapé gerado no PDF:
              </p>
              {atestoVias === 2 ? (
                <p className="font-mono text-[11px] text-foreground bg-background p-2 rounded border">
                  Página 1: Ciclo 40/2026 · Contrato C-2026-02-05 · Parada 3 —{' '}
                  {atestoVia1Rotulo.trim() || 'v1'}
                  <br />
                  Página 2: Ciclo 40/2026 · Contrato C-2026-02-05 · Parada 3 —{' '}
                  {atestoVia2Rotulo.trim() || 'v2'}
                </p>
              ) : (
                <p className="font-mono text-[11px] text-foreground bg-background p-2 rounded border">
                  Página 1: Ciclo 40/2026 · Contrato C-2026-02-05 · Parada 3
                  {atestoVia1Rotulo.trim() ? ` — ${atestoVia1Rotulo.trim()}` : ''}
                </p>
              )}
              <p className="text-[11px]">
                O rótulo aparece no rodapé de cada página do PDF. Caso o campo fique em branco em 2
                vias, o sistema utilizará neutralmente &quot;v1&quot; e &quot;v2&quot; para evitar
                confusão entre as vias.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card: Depósito Central & Ponto de Partida das Rotas */}
        <Card className="border-border shadow-sm border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Depósito Central (Origem Fixa das Rotas)
                </CardTitle>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => {
                  setDepositoNome(DEPOSITO_CENTRAL.nome)
                  setDepositoLatitude(String(DEPOSITO_CENTRAL.latitude))
                  setDepositoLongitude(String(DEPOSITO_CENTRAL.longitude))
                  toast.info('Valores padrão do Depósito Central restaurados no formulário.')
                }}
                title="Restaurar valores de fábrica do Depósito Central"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar Padrão
              </Button>
            </div>
            <CardDescription>
              Ponto de partida geográfico utilizado pelo algoritmo de otimização de rotas (vizinho
              mais próximo e 2-opt) e exibido como a primeira origem fixa no diálogo comparativo da
              tela de Roteamento & Despacho.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="depositoNome">Identificação / Nome do Ponto de Partida</Label>
              <div className="relative">
                <Warehouse className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="depositoNome"
                  value={depositoNome}
                  onChange={(e) => setDepositoNome(e.target.value)}
                  placeholder="Ex: Depósito Central"
                  className="pl-9"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Nome exibido com o selo &quot;Origem fixa da rota&quot; no diálogo comparativo de
                otimização de rota.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="depositoLatitude">Latitude</Label>
                <div className="relative">
                  <Navigation className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="depositoLatitude"
                    value={depositoLatitude}
                    onChange={(e) => setDepositoLatitude(e.target.value)}
                    placeholder="Ex: -22.260264"
                    className="pl-9 font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Aceita ponto ou vírgula decimal (ex: -22.260264 ou -22,260264). Intervalo: -90 a
                  90.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="depositoLongitude">Longitude</Label>
                <div className="relative">
                  <Navigation className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="depositoLongitude"
                    value={depositoLongitude}
                    onChange={(e) => setDepositoLongitude(e.target.value)}
                    placeholder="Ex: -42.738042"
                    className="pl-9 font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Aceita ponto ou vírgula decimal (ex: -42.738042 ou -42,738042). Intervalo: -180 a
                  180.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs flex items-start gap-2.5 text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-foreground">Regra de Fallback e Resiliência</p>
                <p className="text-[11px] leading-relaxed">
                  Caso as coordenadas sejam deixadas em branco ou informadas com formato inválido, o
                  sistema manterá automaticamente o padrão da cooperativa (
                  <span className="font-mono text-foreground font-medium">
                    {DEPOSITO_CENTRAL.latitude}, {DEPOSITO_CENTRAL.longitude}
                  </span>
                  ), garantindo que o algoritmo de roteamento nunca seja interrompido.
                </p>
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
