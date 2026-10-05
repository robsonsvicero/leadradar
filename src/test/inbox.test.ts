import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  addConversationMessage,
  createConversation,
  getConversationMessages,
  normalizeConversationMessage,
  updateConversationStatus,
} from '../services/inbox/inboxService'
import type { Lead } from '../types'

describe('normalizeConversationMessage', () => {
  it('trims and preserves a manually received message', () => {
    expect(normalizeConversationMessage({
      direction: 'inbound',
      status: 'logged',
      body: '  Olá, podemos conversar?  ',
    })).toEqual({
      direction: 'inbound',
      status: 'logged',
      body: 'Olá, podemos conversar?',
    })
  })

  describe('manual Inbox persistence in demo mode', () => {
    const lead: Lead = {
      id: 'demo-lead-1',
      organization_id: 'demo-org',
      company_id: 'demo-company-1',
      company_name: 'Empresa Demonstração',
      city: 'São Paulo',
      segment: 'Serviços',
      score: 70,
      technical_score: 60,
      ai_score: 65,
      action_score: 70,
      icp_match: 80,
      classification: 'warm',
      status: 'new',
      opportunity: 'Presença digital',
      opportunity_reason: 'Site desatualizado',
      ai_summary: 'Resumo de demonstração',
      recommended_service: 'Criação de site',
      confidence: 0.8,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }

    beforeEach(() => {
      localStorage.clear()
      localStorage.setItem('lead-radar-demo-leads', JSON.stringify([lead]))
    })

    afterEach(() => {
      localStorage.clear()
    })

    it('creates a thread, persists a manual message, and archives the thread', async () => {
      const conversation = await createConversation({ lead, title: '  Primeiro contato  ', channel: 'email' })
      expect(conversation.title).toBe('Primeiro contato')

      const message = await addConversationMessage(conversation, {
        direction: 'inbound',
        status: 'logged',
        body: 'Olá, gostaria de receber mais informações.',
      })
      expect((await getConversationMessages(conversation.id)).map((item) => item.id)).toEqual([message.id])

      const archived = await updateConversationStatus(conversation.id, 'archived')
      expect(archived?.status).toBe('archived')
      await expect(addConversationMessage({ ...conversation, status: 'archived' }, {
        direction: 'outbound',
        status: 'draft',
        body: 'Uma resposta em rascunho.',
      })).rejects.toThrow('Reabra a conversa antes de adicionar mensagens.')
    })
  })

  it('rejects an empty message', () => {
    expect(() => normalizeConversationMessage({
      direction: 'outbound',
      status: 'draft',
      body: '   ',
    })).toThrow('Escreva o conteúdo da mensagem antes de salvar.')
  })

  it('does not allow received messages to be marked as drafts', () => {
    expect(() => normalizeConversationMessage({
      direction: 'inbound',
      status: 'draft',
      body: 'Mensagem recebida',
    })).toThrow('Somente uma mensagem de saída pode ser salva como rascunho.')
  })

  it('enforces the database message-length limit', () => {
    expect(() => normalizeConversationMessage({
      direction: 'outbound',
      status: 'logged',
      body: 'x'.repeat(10001),
    })).toThrow('A mensagem deve ter no máximo 10.000 caracteres.')
  })
})
