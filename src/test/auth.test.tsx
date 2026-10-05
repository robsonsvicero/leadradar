import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthPage } from '../features/auth/auth-page'
import { AuthProvider } from '../hooks/useAuth'

describe('AuthPage', () => {
  it('renders the login form', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthPage mode="login" />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
  })

  it('toggles password visibility', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthPage mode="login" />
        </AuthProvider>
      </MemoryRouter>,
    )

    const passwordInput = screen.getByLabelText('Senha')
    expect(passwordInput).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
