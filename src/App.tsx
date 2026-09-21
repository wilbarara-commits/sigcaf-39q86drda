import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/auth-context'
import { AppProvider } from '@/context/app-context'
import ProtectedRoute from '@/components/ProtectedRoute'

import Layout from './components/Layout'
import Login from './pages/Login'
import Index from './pages/Index'
import NotFound from './pages/NotFound'
import Products from './pages/Products'
import Schools from './pages/Schools'
import Contracts from './pages/Contracts'
import Orders from './pages/Orders'
import DeliveryRoutes from './pages/DeliveryRoutes'
import Atestos from './pages/Atestos'
import Reports from './pages/Reports'
import Requirements from './pages/Requirements'
import Consolidation from './pages/Consolidation'
import CycleHistory from './pages/CycleHistory'
import Monitoring from './pages/Monitoring'
import WhatsappCommunication from './pages/WhatsappCommunication'
import ExcelImport from './pages/ExcelImport'
import Profile from './pages/Profile'
import UsersPage from './pages/Users'
import SettingsPage from './pages/Settings'

const App = () => (
  <AuthProvider>
    <AppProvider>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Rota pública de login */}
            <Route path="/login" element={<Login />} />

            {/* Rotas protegidas dentro do Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Rotas operacionais gerais (MASTER, ADMINISTRADOR, SECRETÁRIA) */}
              <Route path="/" element={<Index />} />
              <Route path="/pedidos" element={<Orders />} />
              <Route path="/rotas" element={<DeliveryRoutes />} />
              <Route path="/consolidacao" element={<Consolidation />} />
              <Route path="/historico-ciclos" element={<CycleHistory />} />
              <Route path="/monitoramento" element={<Monitoring />} />
              <Route path="/comunicacao" element={<WhatsappCommunication />} />
              <Route path="/importacao" element={<ExcelImport />} />
              <Route path="/atestos" element={<Atestos />} />
              <Route path="/relatorios" element={<Reports />} />

              {/* Meu Perfil (acessível por qualquer perfil autenticado) */}
              <Route path="/perfil" element={<Profile />} />

              {/* Rotas administrativas (acessíveis por MASTER e ADMINISTRADOR) */}
              <Route
                path="/produtos"
                element={
                  <ProtectedRoute requiredRole="ADMINISTRADOR">
                    <Products />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/escolas"
                element={
                  <ProtectedRoute requiredRole="ADMINISTRADOR">
                    <Schools />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contratos"
                element={
                  <ProtectedRoute requiredRole="ADMINISTRADOR">
                    <Contracts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/requisitos"
                element={
                  <ProtectedRoute requiredRole="ADMINISTRADOR">
                    <Requirements />
                  </ProtectedRoute>
                }
              />

              {/* Rotas exclusivas de MASTER (Gestão de Usuários e Configurações) */}
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute requiredRole="MASTER">
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <ProtectedRoute requiredRole="MASTER">
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </BrowserRouter>
    </AppProvider>
  </AuthProvider>
)

export default App
