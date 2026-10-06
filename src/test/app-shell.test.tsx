import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { logout, getNotifications } = vi.hoisted(() => ({
  logout: vi.fn(),
  getNotifications: vi.fn(async () => ({ notifications: [], unreadCount: 0 })),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { full_name: 'Robson Vicero', email: 'robson@example.com' },
    logout,
  }),
}))

vi.mock('../services/notifications/notificationService', () => ({
  getOrganizationNotifications: getNotifications,
  markOrganizationNotificationRead: vi.fn(),
}))

import { AppShell } from '../components/layout/app-shell'

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppShell><div>Conteúdo da página</div></AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('app shell navigation', () => {
  beforeEach(() => {
    logout.mockReset()
    getNotifications.mockClear()
  })

  it('keeps the sidebar fixed with its own scrollable navigation', () => {
    renderApp()

    const sidebar = screen.getByRole('complementary')
    expect(sidebar).toHaveClass('fixed', 'h-dvh', 'flex-col')
    expect(screen.getByRole('navigation')).toHaveClass('overflow-y-auto', 'overscroll-contain')
    expect(screen.getByRole('main').parentElement).toHaveClass('md:ml-72')
    expect(screen.getByRole('link', { name: 'Radar Diário' })).toHaveAttribute('href', '/radar-diario')
  })

  it('shows the animated radar logo beside the product name', () => {
    renderApp()

    expect(screen.getByText('LEAD RADAR')).toBeInTheDocument()
    const logo = document.querySelector<HTMLImageElement>('img[src="/favicon.svg"]')
    expect(logo).not.toBeNull()
    expect(logo).toHaveClass('animate-radar-sweep')
    expect(screen.getByRole('main')).toHaveClass('animate-fade-in-up')
    expect(document.querySelector('.pulse-ring')).toBeInTheDocument()
  })

  it('moves the mobile sign-out action into the menu and keeps desktop sign-out in the header', () => {
    renderApp()

    const signOutButtons = screen.getAllByRole('button', { name: 'Sair' })
    expect(signOutButtons).toHaveLength(2)
    expect(signOutButtons[0]).toHaveClass('w-full')
    expect(signOutButtons[1]).toHaveClass('hidden', 'md:inline-flex')

    fireEvent.click(signOutButtons[0])
    expect(logout).toHaveBeenCalledOnce()
  })
})
