import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  analyzeLeadDeep,
  analyzeLead,
  approveFollowUp,
  approveOutreach,
  editFollowUpDraft,
  editOutreachDraft,
  generateReplyAssistant,
  generateFollowUp,
  generateOutreach,
  getLeadFollowUpDrafts,
  getLeadReplyAssistantHistory,
  getLatestDeepAnalysis,
  getLatestLeadAIAnalysis,
  getLeadOutreachDrafts,
  submitAIFeedback,
} from '../services/ai/aiService'
import type { FollowUpDraft, OutreachDraft } from '../services/ai/aiService'

export function useLeadIntelligence(leadId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['ai-analysis', leadId],
    queryFn: () => getLatestLeadAIAnalysis(leadId),
    enabled: Boolean(leadId),
    retry: false,
  })
  const analyze = useMutation({
    mutationFn: (force: boolean) => analyzeLead(leadId, force),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-analysis', leadId] }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['company-lead'] }),
      ])
    },
  })
  return { ...query, analyze }
}

export function useLeadOutreach(leadId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['ai-outreach', leadId],
    queryFn: () => getLeadOutreachDrafts(leadId),
    enabled: Boolean(leadId),
    retry: false,
  })
  const generate = useMutation({
    mutationFn: (input: { channel: OutreachDraft['channel']; tone?: string }) => generateOutreach(leadId, input.channel, input.tone),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-outreach', leadId] })
    },
  })
  const approve = useMutation({
    mutationFn: (input: { draftId: string; variantIndex: number }) => approveOutreach(input.draftId, input.variantIndex),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-outreach', leadId] })
    },
  })
  const edit = useMutation({
    mutationFn: (input: { draftId: string; variantIndex: number; subject: string | null; body: string }) =>
      editOutreachDraft(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-outreach', leadId] })
    },
  })
  return { ...query, generate, approve, edit }
}

export function useLeadFollowUp(leadId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['ai-follow-up', leadId],
    queryFn: () => getLeadFollowUpDrafts(leadId),
    enabled: Boolean(leadId),
    retry: false,
  })
  const generate = useMutation({
    mutationFn: (input: { channel: FollowUpDraft['channel']; interactionContext: string; tone?: string }) =>
      generateFollowUp({ leadId, ...input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-follow-up', leadId] })
    },
  })
  const approve = useMutation({
    mutationFn: (input: { draftId: string; variantIndex: number }) => approveFollowUp(input.draftId, input.variantIndex),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-follow-up', leadId] })
    },
  })
  const edit = useMutation({
    mutationFn: (input: { draftId: string; variantIndex: number; subject: string | null; body: string }) =>
      editFollowUpDraft(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-follow-up', leadId] })
    },
  })
  return { ...query, generate, approve, edit }
}

export function useLeadReplyAssistant(leadId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['ai-reply-assistant', leadId],
    queryFn: () => getLeadReplyAssistantHistory(leadId),
    enabled: Boolean(leadId),
    retry: false,
  })
  const analyze = useMutation({
    mutationFn: (input: { channel: 'email' | 'whatsapp' | 'instagram' | 'linkedin'; receivedMessage: string }) =>
      generateReplyAssistant({ leadId, ...input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-reply-assistant', leadId] })
    },
  })
  return { ...query, analyze }
}

export function useLeadDeepAnalysis(leadId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['ai-deep-analysis', leadId],
    queryFn: () => getLatestDeepAnalysis(leadId),
    enabled: Boolean(leadId),
    retry: false,
  })
  const analyze = useMutation({
    mutationFn: () => analyzeLeadDeep(leadId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-deep-analysis', leadId] })
    },
  })
  return { ...query, analyze }
}

export function useAIFeedback(leadId: string) {
  return useMutation({
    mutationFn: (input: { analysisLogId: string; feedbackType: 'helpful' | 'unhelpful' | 'correct' | 'incorrect' }) =>
      submitAIFeedback({ leadId, ...input }),
  })
}
