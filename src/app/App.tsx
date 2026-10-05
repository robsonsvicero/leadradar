import { AppProviders } from './providers'
import { AppRoutes } from './routes'
import { ErrorBoundary } from '../components/error-boundary'

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </ErrorBoundary>
  )
}
