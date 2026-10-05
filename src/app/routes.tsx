import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { featureFlags } from '../config/featureFlags'
import { useAuth } from '../hooks/useAuth'

const AuthPage = lazy(() => import('../features/auth/auth-page').then((module) => ({ default: module.AuthPage })))
const CompaniesPage = lazy(() => import('../features/companies/companies-page').then((module) => ({ default: module.CompaniesPage })))
const CompanyDetailPage = lazy(() => import('../features/companies/company-detail-page').then((module) => ({ default: module.CompanyDetailPage })))
const CRMPage = lazy(() => import('../features/crm/crm-page').then((module) => ({ default: module.CRMPage })))
const DashboardPage = lazy(() => import('../features/dashboard/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const AISDRPage = lazy(() => import('../features/ai-sdr/ai-sdr-page').then((module) => ({ default: module.AISDRPage })))
const AIUsagePage = lazy(() => import('../features/ai-usage/ai-usage-page').then((module) => ({ default: module.AIUsagePage })))
const IntegrationsPage = lazy(() => import('../features/integrations/integrations-page').then((module) => ({ default: module.IntegrationsPage })))
const LeadsPage = lazy(() => import('../features/leads/leads-page').then((module) => ({ default: module.LeadsPage })))
const NewProspectingPage = lazy(() => import('../features/prospecting/new-prospecting-page').then((module) => ({ default: module.NewProspectingPage })))
const ProspectingJobPage = lazy(() => import('../features/prospecting/prospecting-job-page').then((module) => ({ default: module.ProspectingJobPage })))
const SettingsPage = lazy(() => import('../features/settings/settings-page').then((module) => ({ default: module.SettingsPage })))
const TasksPage = lazy(() => import('../features/tasks/tasks-page').then((module) => ({ default: module.TasksPage })))
const InboxPage = lazy(() => import('../features/inbox/inbox-page').then((module) => ({ default: module.InboxPage })))
const MeetingsPage = lazy(() => import('../features/meetings/meetings-page').then((module) => ({ default: module.MeetingsPage })))
const ProposalsPage = lazy(() => import('../features/proposals/proposals-page').then((module) => ({ default: module.ProposalsPage })))
const CadencesPage = lazy(() => import('../features/cadences/cadences-page').then((module) => ({ default: module.CadencesPage })))

function ProtectedLayout() {
  const { user, isLoading, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary text-foreground">
        Carregando área de trabalho...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.accessStatus !== 'approved') {
    const rejected = user.accessStatus === 'rejected'

    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>{rejected ? 'Acesso não aprovado' : 'Aguardando aprovação'}</CardTitle>
            <CardDescription>
              {rejected
                ? 'Um administrador recusou este cadastro. Entre em contato com a equipe responsável se acredita que isso foi um engano.'
                : 'Seu cadastro foi recebido e está aguardando a análise de um administrador. Após a aprovação, entre novamente para acessar o aplicativo.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={() => void logout()}>
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export function AppRoutes() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary text-foreground">
        Preparando aplicação...
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Carregando página...</div>}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="login" />} />
          <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="register" />} />
          <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="forgot-password" />} />
          <Route path="/set-password" element={<AuthPage mode="set-password" />} />

          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/ai-sdr" element={featureFlags.aiSdr ? <AISDRPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/ai-usage" element={featureFlags.advancedAnalytics ? <AIUsagePage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/prospecting/new" element={<NewProspectingPage />} />
            <Route path="/prospecting/jobs/:jobId" element={<ProspectingJobPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/crm" element={<CRMPage />} />
            <Route path="/pipeline" element={<CRMPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/inbox" element={featureFlags.inbox ? <InboxPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/meetings" element={<MeetingsPage />} />
            <Route path="/proposals" element={featureFlags.proposals ? <ProposalsPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/cadences" element={featureFlags.automatedCadences ? <CadencesPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
