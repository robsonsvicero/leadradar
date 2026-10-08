import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NewProspectingPage } from '../features/prospecting/new-prospecting-page'
import { ProspectingJobPage } from '../features/prospecting/prospecting-job-page'

function renderProspectingFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/prospecting/new']}>
        <Routes>
          <Route path="/prospecting/new" element={<NewProspectingPage />} />
          <Route path="/prospecting/jobs/:jobId" element={<ProspectingJobPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'demo-user', email: 'demo@example.com' } }),
}))

describe('prospecting flow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('creates a demo prospecting job and displays its results', async () => {
    renderProspectingFlow()

    const submitButton = screen.getByRole('button', { name: /iniciar prospecção demo/i })
    await waitFor(() => expect(submitButton).not.toBeDisabled())
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Dentistas' })))
    expect(screen.getByLabelText('Segmento')).toHaveValue('Dentistas')
    fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'clínicas odontológicas' } })
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'São Paulo, SP' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'SP' } })
    fireEvent.click(screen.getByRole('button', { name: '25' }))
    fireEvent.click(submitButton)

    await screen.findByText(/Prospecção de clínicas odontológicas/)
    expect(screen.getByText('São Paulo, SP, Brasil · até 25 empresas')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Empresa de demonstração A')).toBeInTheDocument())
    expect(screen.getByText(/os resultados exibidos são fictícios/i)).toBeInTheDocument()
    expect(screen.getByText('Empresa de demonstração B')).toBeInTheDocument()
    expect(screen.getByText('Empresa de demonstração C')).toBeInTheDocument()
  })

  it.each([
    ['estado selecionado', 'SP', 'SP, Brasil'],
    ['todos os estados', '', 'Brasil'],
  ])('permite buscar sem cidade em %s', async (_scope, stateCode, expectedLocation) => {
    renderProspectingFlow()

    const submitButton = screen.getByRole('button', { name: /iniciar prospecção demo/i })
    await waitFor(() => expect(submitButton).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'clínicas odontológicas' } })
    if (stateCode) {
      fireEvent.change(screen.getByLabelText('Estado'), { target: { value: stateCode } })
    }
    fireEvent.click(submitButton)

    expect(await screen.findByText(`${expectedLocation} · até 20 empresas`)).toBeInTheDocument()
  })
})
