import { describe, expect, it } from 'vitest'

import { extractPublicEmail } from '../services/prospecting/email'

describe('public website email extraction', () => {
  it('extracts and normalizes a public email address', () => {
    expect(extractPublicEmail('<a href="mailto:Contato@Empresa.com.br">Fale conosco</a>')).toBe('contato@empresa.com.br')
  })

  it('recognizes common HTML-encoded email separators', () => {
    expect(extractPublicEmail('contato&#64;empresa&#46;com.br')).toBe('contato@empresa.com.br')
  })

  it('returns null when the page does not expose an email address', () => {
    expect(extractPublicEmail('<p>Entre em contato pelo formulário.</p>')).toBeNull()
  })
})
