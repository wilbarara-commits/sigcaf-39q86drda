import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Sprout,
  Lock,
  Mail,
  Loader2,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { configuracoesService } from '@/services/configuracoes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, requestPasswordReset } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Controle de atalhos demo vindo das configurações da cooperativa
  const [showDemoShortcuts, setShowDemoShortcuts] = useState<boolean>(true)
  const [coopName, setCoopName] = useState<string>('CooperGestão')
  const [coopLogoUrl, setCoopLogoUrl] = useState<string>('')
  const [logoLoadFailed, setLogoLoadFailed] = useState<boolean>(false)

  // Modal Esqueci minha senha
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [resetSentSuccess, setResetSentSuccess] = useState(false)

  // Carregar configurações de visibilidade demo
  useEffect(() => {
    configuracoesService
      .get()
      .then((config) => {
        if (config) {
          setShowDemoShortcuts(config.exibir_atalhos_demo !== false)
          if (config.nome_cooperativa) {
            setCoopName(config.nome_cooperativa)
          }
          const url = configuracoesService.getLogoUrl(config)
          if (url) {
            setCoopLogoUrl(url)
            // Atualizar favicon também na tela de login
            if (typeof document !== 'undefined') {
              let linkIcon = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null
              if (linkIcon) {
                linkIcon.href = url
              }
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Configurações não carregadas no login:', err)
        setShowDemoShortcuts(true)
      })
  }, [])

  // Se já autenticado, redireciona
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || '/'
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email.trim() || !password) {
      setErrorMessage('Por favor, informe seu e-mail e sua senha.')
      return
    }

    setIsLoading(true)

    try {
      const user = await login(email.trim(), password)
      toast.success(`Bem-vindo(a), ${user.nome || user.name || 'usuário'}!`)
      const from = (location.state as any)?.from?.pathname || '/'
      navigate(from, { replace: true })
    } catch (err: any) {
      console.error('Erro de autenticação:', err)
      const rawMsg = err?.data?.message || err?.message || ''
      if (rawMsg.toLowerCase().includes('desativada')) {
        setErrorMessage(rawMsg)
      } else if (rawMsg.toLowerCase().includes('failed to authenticate') || err?.status === 400) {
        setErrorMessage('Credenciais inválidas. Verifique seu e-mail e senha e tente novamente.')
      } else {
        setErrorMessage(
          'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail.trim()) {
      toast.error('Informe o e-mail cadastrado.')
      return
    }

    setIsSendingReset(true)
    try {
      await requestPasswordReset(resetEmail.trim())
      setResetSentSuccess(true)
      toast.success('Instruções de redefinição de senha enviadas!')
    } catch (err: any) {
      console.error('Erro ao solicitar reset:', err)
      // Por segurança e padrão PB, confirmamos o envio mesmo em caso de erro sutil ou avisamos
      toast.info('Se o e-mail estiver cadastrado no sistema, você receberá o link de recuperação.')
      setResetSentSuccess(true)
    } finally {
      setIsSendingReset(false)
    }
  }

  // Preencher credenciais de teste para facilidade de demonstração
  const fillCredentials = (type: 'master' | 'secretaria') => {
    if (type === 'master') {
      setEmail('admin@coop.local')
      setPassword('admin123')
    } else {
      setEmail('secretaria@coop.local')
      setPassword('secretaria123')
    }
    setErrorMessage(null)
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-gradient-to-b from-primary/10 via-background to-background p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Marca / Logotipo CoopGestão */}
        <div className="flex flex-col items-center text-center space-y-2">
          {coopLogoUrl && !logoLoadFailed ? (
            <div className="h-20 w-auto max-w-[200px] px-3 py-1.5 rounded-xl bg-white/95 dark:bg-card border border-border/80 flex items-center justify-center shadow-sm">
              <img
                src={coopLogoUrl}
                alt={coopName}
                onError={() => setLogoLoadFailed(true)}
                className="max-h-16 max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm">
              <Sprout className="h-9 w-9 text-primary" />
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>CoopGestão</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm px-2">
            {coopName} • Gestão Integrada de Cooperativas Agrícolas (PNAE / PAA)
          </p>
        </div>

        {/* Card de Login */}
        <Card className="border-border shadow-md backdrop-blur-sm bg-card/95">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold tracking-tight text-center">
              Acesse sua conta
            </CardTitle>
            <CardDescription className="text-center text-sm">
              Entre com suas credenciais para acessar os módulos do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage && (
              <Alert variant="destructive" className="py-2.5">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm ml-2">{errorMessage}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail corporativo</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu.email@coop.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    autoComplete="username"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email || '')
                      setResetSentSuccess(false)
                      setForgotPasswordOpen(true)
                    }}
                    className="text-xs text-primary hover:underline font-medium cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    autoComplete="current-password"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full font-medium h-10 mt-2" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar no Sistema'
                )}
              </Button>
            </form>
          </CardContent>

          {/* Atalhos Demo (Controlados pelo Master nas Configurações) */}
          {showDemoShortcuts && (
            <CardFooter className="flex flex-col border-t pt-4 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between w-full">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Contas de demonstração:
                </p>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 px-1.5 h-4 font-normal text-muted-foreground"
                >
                  Modo Demo Ativo
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fillCredentials('master')}
                  className="text-xs h-auto py-2 px-2.5 flex flex-col items-start border-primary/30 hover:bg-primary/5 hover:border-primary"
                >
                  <div className="flex items-center gap-1.5 w-full font-medium text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    <span>Master / Admin</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Poderes Totais</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fillCredentials('secretaria')}
                  className="text-xs h-auto py-2 px-2.5 flex flex-col items-start border-blue-400/40 hover:bg-blue-50/50 hover:border-blue-500 dark:hover:bg-blue-950/20"
                >
                  <div className="flex items-center gap-1.5 w-full font-medium text-foreground">
                    <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Secretária</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Operacional</span>
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>

        {/* Rodapé institucional */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>
            © {new Date().getFullYear()} {coopName}
          </p>
          <div className="flex justify-center items-center gap-2 pt-1">
            <Badge
              variant="outline"
              className="text-[11px] font-normal text-muted-foreground border-border"
            >
              Autenticação Segura Skip Cloud
            </Badge>
          </div>
        </div>
      </div>

      {/* Modal de Recuperação de Senha */}
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <span>Recuperação de Senha</span>
            </DialogTitle>
            <DialogDescription>
              Informe o e-mail cadastrado na cooperativa para receber o link de redefinição de
              senha.
            </DialogDescription>
          </DialogHeader>

          {resetSentSuccess ? (
            <div className="py-4 space-y-3">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-900 dark:text-emerald-200">
                    E-mail de recuperação enviado!
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                    Se o endereço <strong>{resetEmail}</strong> estiver cadastrado na plataforma,
                    você receberá uma mensagem com o link para criar uma nova senha.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Verifique sua caixa de entrada e pasta de spam.
              </p>
              <DialogFooter className="mt-4 sm:justify-center">
                <Button
                  type="button"
                  onClick={() => {
                    setForgotPasswordOpen(false)
                    setResetSentSuccess(false)
                  }}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao Login
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleRequestPasswordReset}>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">E-mail cadastrado</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="resetEmail"
                      type="email"
                      placeholder="seu.email@coop.local"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="pl-9"
                      required
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-4 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotPasswordOpen(false)}
                  disabled={isSendingReset}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSendingReset}>
                  {isSendingReset ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar link de recuperação'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
