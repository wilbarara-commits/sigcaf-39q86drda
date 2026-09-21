import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Sprout,
  School,
  FileText,
  Map,
  ShoppingCart,
  FileCheck,
  Bell,
  Search,
  Menu,
  LogOut,
  ShieldCheck,
  UserCheck,
  BookOpen,
  BarChart3,
  KeyRound,
  Grid,
  History,
  Activity,
  MessageSquare,
  Upload,
  User,
  Users,
  Settings,
  Crown,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'
import { useApp } from '@/context/app-context'
import { toast } from 'sonner'
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog'

interface NavItem {
  name: string
  path: string
  icon: any
  adminOnly?: boolean
  masterOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Produtos', path: '/produtos', icon: Sprout, adminOnly: true },
  { name: 'Escolas', path: '/escolas', icon: School, adminOnly: true },
  { name: 'Contratos', path: '/contratos', icon: FileText, adminOnly: true },
  { name: 'Pedidos', path: '/pedidos', icon: ShoppingCart },
  { name: 'Importação Excel', path: '/importacao', icon: Upload },
  { name: 'Consolidação', path: '/consolidacao', icon: Grid },
  { name: 'Rotas de Entrega', path: '/rotas', icon: Map },
  { name: 'Monitoramento', path: '/monitoramento', icon: Activity },
  { name: 'Comunicação WhatsApp', path: '/comunicacao', icon: MessageSquare },
  { name: 'Histórico de Ciclos', path: '/historico-ciclos', icon: History },
  { name: 'Atestos', path: '/atestos', icon: FileCheck },
  { name: 'Relatórios', path: '/relatorios', icon: BarChart3 },
  { name: 'Meu Perfil', path: '/perfil', icon: User },
  { name: 'Usuários', path: '/usuarios', icon: Users, masterOnly: true },
  { name: 'Configurações', path: '/configuracoes', icon: Settings, masterOnly: true },
  { name: 'Documento de Requisitos', path: '/requisitos', icon: BookOpen, adminOnly: true },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isMaster, isAdmin, logout } = useAuth()
  const { config, logoUrl } = useApp()
  const [logoError, setLogoError] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  const coopNomeExibicao = config?.sigla || config?.nome_cooperativa || 'CoopGestão'
  const temLogoValido = Boolean(logoUrl && !logoError)

  const handleLogout = () => {
    logout()
    toast.info('Você saiu da sua conta.')
    navigate('/login', { replace: true })
  }

  // Filtrar itens do menu de acordo com o perfil
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.masterOnly && !isMaster) {
      return false
    }
    if (item.adminOnly && !isAdmin && !isMaster) {
      return false
    }
    return true
  })

  const displayName = user?.nome || user?.name || user?.email || 'Usuário'
  const rawPerfil = String(user?.perfil || 'SECRETARIA').toUpperCase()
  const isPerfilMaster = rawPerfil === 'MASTER'
  const isPerfilAdmin = rawPerfil === 'ADMINISTRADOR'
  const perfilLabel = isPerfilMaster ? 'MASTER' : isPerfilAdmin ? 'Administrador' : 'Secretária'

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('') || 'U'

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="space-y-1 p-4">
      {visibleNavItems.map((item) => {
        const isActive = location.pathname === item.path
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClick}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon
              className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')}
            />
            <span>{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card shadow-sm z-10">
        <div className="flex h-16 items-center gap-3 px-5 border-b">
          {temLogoValido ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-md bg-white border border-border/80 flex items-center justify-center p-0.5 shrink-0 shadow-xs overflow-hidden">
                <img
                  src={logoUrl}
                  alt={coopNomeExibicao}
                  onError={() => setLogoError(true)}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  className="font-bold text-sm tracking-tight text-foreground truncate leading-tight"
                  title={coopNomeExibicao}
                >
                  {coopNomeExibicao}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">
                  CooperGestão
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sprout className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-base tracking-tight text-primary truncate leading-tight">
                  {coopNomeExibicao}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>{' '}
        {/* Rodapé do Sidebar com perfil do usuário */}
        <div className="p-4 border-t bg-muted/20">
          <Link
            to="/perfil"
            className="flex items-center gap-3 p-1 rounded-md hover:bg-muted/50 transition-colors"
            title="Ir para Meu Perfil"
          >
            <Avatar className="h-9 w-9 border border-border">
              {user?.avatar ? (
                <AvatarImage src={user.avatar} alt={displayName} />
              ) : (
                <AvatarImage
                  src={
                    isPerfilMaster
                      ? 'https://img.usecurling.com/ppl/thumbnail?gender=male&seed=42'
                      : isPerfilAdmin
                        ? 'https://img.usecurling.com/ppl/thumbnail?gender=male&seed=77'
                        : 'https://img.usecurling.com/ppl/thumbnail?gender=female&seed=1'
                  }
                  alt={displayName}
                />
              )}
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight text-foreground">
                {displayName}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <Badge
                  variant={isPerfilMaster ? 'default' : isPerfilAdmin ? 'default' : 'secondary'}
                  className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                    isPerfilMaster ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
                  }`}
                >
                  {isPerfilMaster ? (
                    <Crown className="h-2.5 w-2.5 mr-0.5 inline" />
                  ) : isPerfilAdmin ? (
                    <ShieldCheck className="h-2.5 w-2.5 mr-0.5 inline" />
                  ) : (
                    <UserCheck className="h-2.5 w-2.5 mr-0.5 inline" />
                  )}
                  {perfilLabel}
                </Badge>
              </div>
            </div>
          </Link>
        </div>
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden w-full">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col justify-between">
                <div>
                  <SheetTitle className="sr-only">Menu de Navegação</SheetTitle>
                  <div className="flex h-16 items-center gap-3 px-5 border-b">
                    {temLogoValido ? (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-md bg-white border border-border/80 flex items-center justify-center p-0.5 shrink-0 shadow-xs overflow-hidden">
                          <img
                            src={logoUrl}
                            alt={coopNomeExibicao}
                            onError={() => setLogoError(true)}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-sm tracking-tight text-foreground truncate leading-tight">
                            {coopNomeExibicao}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">
                            CooperGestão
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Sprout className="h-5 w-5 text-primary" />
                        </div>
                        <span className="font-bold text-base text-primary truncate">
                          {coopNomeExibicao}
                        </span>
                      </div>
                    )}
                  </div>
                  <NavLinks onClick={() => setMobileOpen(false)} />
                </div>
                {/* Rodapé Mobile Drawer */}
                <div className="p-4 border-t bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <p className="text-xs font-medium leading-tight">{displayName}</p>
                        <span className="text-[10px] text-muted-foreground">{perfilLabel}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setMobileOpen(false)
                          setChangePasswordOpen(true)
                        }}
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title="Alterar Senha"
                      >
                        <KeyRound className="h-3.5 w-3.5 mr-1" /> Senha
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="text-destructive h-8 px-2 text-xs"
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1" /> Sair
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Header Mobile: logotipo ou sigla da cooperativa visível no topo mobile */}
            <div className="flex md:hidden items-center gap-2 min-w-0">
              {temLogoValido ? (
                <div className="h-8 w-8 rounded-md bg-white border border-border/80 flex items-center justify-center p-0.5 shrink-0 overflow-hidden shadow-xs">
                  <img
                    src={logoUrl}
                    alt={coopNomeExibicao}
                    onError={() => setLogoError(true)}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <Sprout className="h-5 w-5 text-primary shrink-0" />
              )}
              <span className="font-bold text-sm tracking-tight text-foreground truncate max-w-[130px] sm:max-w-[200px]">
                {coopNomeExibicao}
              </span>
            </div>

            <div className="hidden sm:flex items-center relative w-64 md:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar pedidos, rotas..."
                className="pl-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary rounded-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador visual de perfil no header */}
            <div className="hidden sm:flex items-center gap-2 text-right">
              <div>
                <Link to="/perfil" className="hover:underline">
                  <p className="text-xs font-medium leading-none text-foreground">{displayName}</p>
                </Link>
                <p className="text-[11px] text-muted-foreground mt-0.5">{user?.email}</p>
              </div>
              <Badge
                variant={isPerfilMaster ? 'default' : isPerfilAdmin ? 'default' : 'secondary'}
                className={`text-[11px] px-2 py-0.5 font-normal capitalize ${
                  isPerfilMaster ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
                }`}
              >
                {perfilLabel}
              </Badge>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="relative text-muted-foreground hover:text-primary"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-secondary"></span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full ring-offset-background"
                >
                  <Avatar className="h-9 w-9 border border-border">
                    {user?.avatar ? (
                      <AvatarImage src={user.avatar} alt={displayName} />
                    ) : (
                      <AvatarImage
                        src={
                          isPerfilAdmin
                            ? 'https://img.usecurling.com/ppl/thumbnail?gender=male&seed=42'
                            : 'https://img.usecurling.com/ppl/thumbnail?gender=female&seed=1'
                        }
                        alt={displayName}
                      />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none text-foreground">
                      {displayName}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    <div className="pt-1">
                      <Badge
                        variant={isPerfilAdmin ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0 h-4 font-normal inline-flex items-center"
                      >
                        {isPerfilAdmin ? (
                          <ShieldCheck className="h-2.5 w-2.5 mr-1" />
                        ) : (
                          <UserCheck className="h-2.5 w-2.5 mr-1" />
                        )}
                        Perfil: {perfilLabel}
                      </Badge>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4 text-primary" />
                  <span>Meu Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setChangePasswordOpen(true)}
                  className="cursor-pointer"
                >
                  <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Alterar Senha</span>
                </DropdownMenuItem>
                {isPerfilMaster && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => navigate('/usuarios')}
                      className="cursor-pointer"
                    >
                      <Users className="mr-2 h-4 w-4 text-amber-600" />
                      <span>Gestão de Usuários</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => navigate('/configuracoes')}
                      className="cursor-pointer"
                    >
                      <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>Configurações</span>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair da conta</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Modal de Alterar Senha */}
        <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
