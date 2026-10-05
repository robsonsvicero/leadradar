import { appEnv } from '../../config/env'

export type LogContext = {
  requestId?: string
  organizationId?: string
  userId?: string
  function?: string
  action?: string
  durationMs?: number
  status?: string | number
}

export type ErrorReporter = {
  captureException(error: unknown, eventId: string, context: LogContext): void
  captureMessage(message: string, eventId: string, context: LogContext): void
}

let errorReporter: ErrorReporter | undefined

export function setErrorReporter(reporter: ErrorReporter | undefined) {
  errorReporter = reporter
}

function write(level: 'debug' | 'info' | 'warn' | 'error', event: string, context: LogContext = {}) {
  if (level === 'debug' && appEnv.isProduction) return

  const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context })
  if (level === 'error') console.error(payload)
  else console.warn(payload)
}

export const logger = {
  debug: (event: string, context?: LogContext) => write('debug', event, context),
  info: (event: string, context?: LogContext) => write('info', event, context),
  warn: (event: string, context?: LogContext) => write('warn', event, context),
  error: (event: string, context?: LogContext) => write('error', event, context),
}

function createEventId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function captureException(error: unknown, context: LogContext = {}) {
  const eventId = createEventId()
  logger.error('captured_exception', {
    ...context,
    requestId: context.requestId ?? eventId,
    status: error instanceof Error ? error.name : 'UnknownError',
  })
  errorReporter?.captureException(error, eventId, context)
  return eventId
}

export function captureMessage(message: string, context: LogContext = {}) {
  const eventId = createEventId()
  logger.warn('captured_message', { ...context, requestId: context.requestId ?? eventId })
  errorReporter?.captureMessage(message, eventId, context)
  return eventId
}
