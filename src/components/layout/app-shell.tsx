import { Activity, Bell, Bot, BriefcaseBusiness, Building2, CalendarDays, FileText, Inbox, LayoutDashboard, ListTodo, Menu, Settings, Sparkles, Users, Workflow, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { Button } from '../ui/button'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { useAuth } from '../../hooks/useAuth'
import { featureFlags, type FeatureFlagName } from '../../config/featureFlags'

const navItems: Array<{ label: string; to: string; icon: typeof LayoutDashboard; feature?: FeatureFlagName }> = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'AI SDR', to: '/ai-sdr', icon: Bot, feature: 'aiSdr' },
  { label: 'Uso de IA', to: '/ai-usage', icon: Activity, feature: 'advancedAnalytics' },
  { label: 'Radar', to: '/prospecting/new', icon: Sparkles },
  { label: 'Leads', to: '/leads', icon: Users },
  { label: 'Empresas', to: '/companies', icon: Building2 },
  { label: 'Pipeline', to: '/pipeline', icon: BriefcaseBusiness },
  { label: 'Inbox', to: '/inbox', icon: Inbox, feature: 'inbox' },
  { label: 'Reuniões', to: '/meetings', icon: CalendarDays },
  { label: 'Propostas', to: '/proposals', icon: FileText, feature: 'proposals' },
  { label: 'Cadências', to: '/cadences', icon: Workflow, feature: 'automatedCadences' },
  { label: 'Tarefas', to: '/tasks', icon: ListTodo },
  { label: 'Integrações', to: '/integrations', icon: Settings },
  { label: 'Configurações', to: '/settings', icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  const initials = user?.full_name
    ?.split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() ?? user?.email.slice(0, 2).toUpperCase() ?? 'LR'

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside
          className={[
            'fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-slate-950 text-slate-200 transition-transform duration-200 md:static md:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          ].join(' ')}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-800 px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-sky-400">Lead Radar</p>
              <h1 className="text-lg font-semibold text-white">AI Prospecting</h1>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-200 md:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <nav className="space-y-1 p-4">
            {navItems.filter(({ feature }) => !feature || featureFlags[feature]).map(({ label, to, icon: Icon }) => {
              const active = location.pathname === to ||
                (to === '/dashboard' && location.pathname === '/') ||
                (to === '/pipeline' && location.pathname === '/crm')

              return (
                <NavLink
                  key={label}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={[
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-sky-500/15 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
            <div className="flex h-16 items-center justify-between px-4 md:px-8">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Sistema operacional
                </div>
              </div>

              <div className="hidden items-center gap-4 md:flex">
                <div className="relative">
                  <input
                    aria-label="Buscar"
                    placeholder="Buscar empresas ou leads"
                    className="h-10 w-[280px] rounded-full border border-slate-200 bg-slate-50 pl-3 pr-10 text-sm outline-none focus:border-sky-500"
                  />
                  <span className="pointer-events-none absolute right-3 top-3 text-slate-400">⌕</span>
                </div>
                <Button variant="ghost" size="icon" aria-label="Notificações">
                  <Bell className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden text-right md:block">
                  <p className="text-sm font-medium text-slate-900">{user?.full_name ?? user?.email ?? 'Usuário'}</p>
                  <p className="text-xs text-slate-500">Perfil ativo</p>
                </div>
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void logout()
                  }}
                >
                  Sair
                </Button>
              </div>
            </div>
          </header>

          <main className="p-4 md:p-8">{children}</main>
        </div>
      </div>
      {open ? <button className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu overlay" /> : null}
    </div>
  )
}
