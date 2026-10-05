import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NewProspectingPage } from '../features/prospecting/new-prospecting-page'
import { ProspectingJobPage } from '../features/prospecting/prospecting-job-page'

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'demo-user', email: 'demo@example.com' } }),
}))

describe('prospecting flow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('creates a demo prospecting job and displays its results', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/prospecting/new']}>
          <Routes>
            <Route path="/prospecting/new" element={<NewProspectingPage />} />
            <Route path="/prospecting/jobs/:jobId" element={<ProspectingJobPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const submitButton = screen.getByRole('button', { name: /gerar dados de demonstração/i })
    await waitFor(() => expect(submitButton).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'clínicas odontológicas' } })
    fireEvent.change(screen.getByLabelText('Localização'), { target: { value: 'São Paulo, SP' } })
    fireEvent.click(submitButton)

    await screen.findByText(/Prospecção de clínicas odontológicas/)
    await waitFor(() => expect(screen.getByText('Empresa de demonstração A')).toBeInTheDocument())
    expect(screen.getByText(/os resultados exibidos são fictícios/i)).toBeInTheDocument()
    expect(screen.getByText('Empresa de demonstração B')).toBeInTheDocument()
    expect(screen.getByText('Empresa de demonstração C')).toBeInTheDocument()
  })
})
