import { supabase } from '../../lib/supabase/client'
import { getLeads } from '../leads/leadService'
import { prospectingMockMode } from '../prospecting/prospectingService'
import type {
  ConversationChannel,
  ConversationMessage,
  ConversationMessageDirection,
  ConversationMessageStatus,
  ConversationStatus,
  InboxConversation,
  Lead,
} from '../../types'

const conversationsStorageKey = 'lead-radar-demo-conversations'
const messagesStorageKey = 'lead-radar-demo-conversation-messages'
const channelTitles: Record<ConversationChannel, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  phone: 'Telefone',
  other: 'Outro',
}

type ConversationRecord = Omit<InboxConversation, 'lead_name' | 'lead_company_id' | 'organization_name'>

type InboxMessageInput = {
  direction: ConversationMessageDirection
  status: ConversationMessageStatus
  body: string
}

export type InboxWorkspace = {
  conversations: InboxConversation[]
  leads: Lead[]
  organizations: Array<{ id: string; name: string }>
}

function readDemoData<T>(key: string): T[] {
  return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]
}

function writeDemoData<T>(key: string, records: T[]) {
  localStorage.setItem(key, JSON.stringify(records))
}

export function normalizeConversationMessage(input: InboxMessageInput): InboxMessageInput {
  const body = input.body.trim()
  if (!body) throw new Error('Escreva o conteúdo da mensagem antes de salvar.')
  if (body.length > 10000) throw new Error('A mensagem deve ter no máximo 10.000 caracteres.')
  if (input.status === 'draft' && input.direction !== 'outbound') {
    throw new Error('Somente uma mensagem de saída pode ser salva como rascunho.')
  }
  return { ...input, body }
}

function buildInboxConversation(
  conversation: ConversationRecord,
  leadsById: Map<string, Lead>,
  organizationsById: Map<string, string>,
): InboxConversation {
  const lead = leadsById.get(conversation.lead_id)
  return {
    ...conversation,
    lead_name: lead?.company_name ?? 'Lead indisponível',
    lead_company_id: lead?.company_id ?? null,
    organization_name: organizationsById.get(conversation.organization_id) ?? 'Organização',
  }
}

export async function getInboxWorkspace(): Promise<InboxWorkspace> {
  const leads = await getLeads()
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]))

  if (prospectingMockMode) {
    const organizations = [...new Set(leads.map((lead) => lead.organization_id))]
      .map((id) => ({ id, name: id === 'demo-org' ? 'Demonstração' : `Organização ${id.slice(0, 8)}` }))
    const organizationsById = new Map(organizations.map((organization) => [organization.id, organization.name]))
    const conversations = readDemoData<ConversationRecord>(conversationsStorageKey)
      .sort((left, right) => (right.last_message_at ?? right.created_at).localeCompare(left.last_message_at ?? left.created_at))
      .map((conversation) => buildInboxConversation(conversation, leadMap, organizationsById))
    return { conversations, leads, organizations }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(0, 499)
  if (error) {
    throw new Error(`Não foi possível carregar o Inbox. Verifique se a migration 20261004200000_inbox_conversations.sql foi aplicada: ${error.message}`)
  }

  const organizationIds = [...new Set(leads.map((lead) => lead.organization_id))]
  const { data: organizationData, error: organizationError } = organizationIds.length
    ? await supabase.from('organizations').select('id,name').in('id', organizationIds).order('name')
    : { data: [], error: null }
  if (organizationError) throw new Error(`Não foi possível carregar as organizações do Inbox: ${organizationError.message}`)

  const organizations = (organizationData ?? []) as Array<{ id: string; name: string }>
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization.name]))
  const conversations = ((data ?? []) as ConversationRecord[])
    .map((conversation) => buildInboxConversation(conversation, leadMap, organizationsById))

  return { conversations, leads, organizations }
}

export async function getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  if (prospectingMockMode) {
    return readDemoData<ConversationMessage>(messagesStorageKey)
      .filter((message) => message.conversation_id === conversationId)
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('occurred_at')
    .range(0, 499)
  if (error) {
    throw new Error(`Não foi possível carregar as mensagens: ${error.message}`)
  }
  return (data ?? []) as ConversationMessage[]
}

export async function createConversation(input: {
  lead: Lead
  title: string
  channel: ConversationChannel
}): Promise<InboxConversation> {
  const title = input.title.trim() || `${input.lead.company_name} · ${channelTitles[input.channel]}`
  if (title.length > 120) throw new Error('O assunto deve ter no máximo 120 caracteres.')

  if (prospectingMockMode) {
    const record: ConversationRecord = {
      id: crypto.randomUUID(),
      organization_id: input.lead.organization_id,
      lead_id: input.lead.id,
      title,
      channel: input.channel,
      status: 'open',
      assigned_to: null,
      created_by: null,
      last_message_at: null,
      last_message_excerpt: null,
      last_message_direction: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    writeDemoData(conversationsStorageKey, [record, ...readDemoData<ConversationRecord>(conversationsStorageKey)])
    return {
      ...record,
      lead_name: input.lead.company_name,
      lead_company_id: input.lead.company_id,
      organization_name: input.lead.organization_id === 'demo-org'
        ? 'Demonstração'
        : `Organização ${input.lead.organization_id.slice(0, 8)}`,
    }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('conversations')
    .insert({
      organization_id: input.lead.organization_id,
      lead_id: input.lead.id,
      title,
      channel: input.channel,
    })
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível criar a conversa: ${error.message}`)

  return {
    ...(data as ConversationRecord),
    lead_name: input.lead.company_name,
    lead_company_id: input.lead.company_id,
    organization_name: 'Organização',
  }
}

export async function addConversationMessage(
  conversation: InboxConversation,
  message: InboxMessageInput,
): Promise<ConversationMessage> {
  const normalized = normalizeConversationMessage(message)
  if (conversation.status !== 'open') {
    throw new Error('Reabra a conversa antes de adicionar mensagens.')
  }
  if (prospectingMockMode) {
    const now = new Date().toISOString()
    const record: ConversationMessage = {
      id: crypto.randomUUID(),
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      direction: normalized.direction,
      status: normalized.status,
      body: normalized.body,
      created_by: null,
      occurred_at: now,
      created_at: now,
    }
    const messages = readDemoData<ConversationMessage>(messagesStorageKey)
    writeDemoData(messagesStorageKey, [...messages, record])
    const conversations = readDemoData<ConversationRecord>(conversationsStorageKey)
    writeDemoData(conversationsStorageKey, conversations.map((item) => item.id === conversation.id
      ? {
          ...item,
          last_message_at: now,
          last_message_excerpt: normalized.body.replace(/\s+/g, ' ').slice(0, 180),
          last_message_direction: normalized.direction,
          updated_at: now,
        }
      : item))
    return record
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('conversation_messages')
    .insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      direction: normalized.direction,
      status: normalized.status,
      body: normalized.body,
    })
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível registrar a mensagem: ${error.message}`)
  return data as ConversationMessage
}

export async function updateConversationStatus(id: string, status: ConversationStatus) {
  if (prospectingMockMode) {
    const conversations = readDemoData<ConversationRecord>(conversationsStorageKey)
    const updated = conversations.map((conversation) => conversation.id === id
      ? { ...conversation, status, updated_at: new Date().toISOString() }
      : conversation)
    writeDemoData(conversationsStorageKey, updated)
    return updated.find((conversation) => conversation.id === id) ?? null
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível atualizar a conversa: ${error.message}`)
  return data as ConversationRecord
}
