import { Component, type ErrorInfo, type ReactNode } from 'react'

import { captureException } from '../lib/observability/logger'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    captureException(error, { function: 'react_error_boundary', action: 'render' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-secondary p-6">
          <section className="max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-foreground">Não foi possível carregar esta página.</h1>
            <p className="mt-2 text-sm text-muted-foreground">O problema foi registrado. Tente recarregar a aplicação.</p>
            <button
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => window.location.reload()}
            >
              Recarregar
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
