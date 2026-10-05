export type AppUser = {
  id: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  role?: 'owner' | 'admin' | 'member'
  accessStatus?: 'pending' | 'approved' | 'rejected'
  isPlatformAdmin?: boolean
}

export type Organization = {
  id: string
  name: string
  address?: string | null
  email?: string | null
  whatsapp?: string | null
  admin_user_id?: string | null
  admin_invite_sent_at?: string | null
  created_at: string
  updated_at: string
}

export type Company = {
  id: string
  organization_id: string
  name: string
  category: string
  description: string
  address?: string | null
  email?: string | null
  website: string
  phone?: string | null
  city: string
  state: string
  country: string
  rating: number | null
  review_count: number
  source: string
  created_at: string
  updated_at: string
}

export type Lead = {
  id: string
  organization_id: string
  company_id: string
  company_name: string
  city: string
  segment: string
  score: number
  technical_score: number
  ai_score: number
  action_score: number
  icp_match: number
  icp_match_reason?: string | null
  action_score_reason?: string | null
  buying_moment_score?: number | null
  ai_updated_at?: string | null
  classification: 'hot' | 'warm' | 'cold'
  status: string
  pipeline_stage_id?: string | null
  owner_id?: string | null
  next_action?: string | null
  next_action_at?: string | null
  last_contact_at?: string | null
  last_response_at?: string | null
  qualified_at?: string | null
  won_at?: string | null
  won_reason?: string | null
  won_service?: string | null
  lost_at?: string | null
  lost_reason?: string | null
  lost_notes?: string | null
  next_best_action?: string | null
  next_best_action_reason?: string | null
  next_best_action_score?: number | null
  source?: string | null
  prospecting_job_id?: string | null
  opportunity: string
  opportunity_reason: string
  target_fit?: 'matched' | 'unconfirmed' | null
  target_fit_reason?: string | null
  matched_service?: string | null
  ai_summary: string
  recommended_service: string
  confidence: number
  created_at: string
  updated_at: string
}

export type PipelineStage = {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string | null
  color: string
  position: number
  probability: number
  is_won: boolean
  is_lost: boolean
  is_active: boolean
}

export type OrganizationMember = {
  organization_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  full_name: string | null
}

export type LeadActivity = {
  id: string
  organization_id: string
  lead_id: string
  user_id: string | null
  type: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type ConversationChannel = 'email' | 'whatsapp' | 'linkedin' | 'instagram' | 'phone' | 'other'
export type ConversationStatus = 'open' | 'archived'
export type ConversationMessageDirection = 'inbound' | 'outbound'
export type ConversationMessageStatus = 'draft' | 'logged'

export type InboxConversation = {
  id: string
  organization_id: string
  lead_id: string
  title: string
  channel: ConversationChannel
  status: ConversationStatus
  assigned_to: string | null
  created_by: string | null
  last_message_at: string | null
  last_message_excerpt: string | null
  last_message_direction: ConversationMessageDirection | null
  created_at: string
  updated_at: string
  lead_name: string
  lead_company_id: string | null
  organization_name: string
}

export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled'

export type SalesMeeting = {
  id: string
  organization_id: string
  lead_id: string
  title: string
  starts_at: string
  duration_minutes: number
  meeting_url: string | null
  notes: string | null
  status: MeetingStatus
  created_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  lead_name: string
  lead_company_id: string | null
  organization_name: string
}

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'cancelled'

export type SalesProposalItem = {
  id: string
  organization_id: string
  proposal_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  position: number
  created_at: string
}

export type SalesProposal = {
  id: string
  organization_id: string
  lead_id: string
  title: string
  scope: string
  valid_until: string | null
  status: ProposalStatus
  currency: 'BRL'
  total_amount: number
  created_by: string | null
  created_at: string
  updated_at: string
  lead_name: string
  lead_company_id: string | null
  organization_name: string
  items: SalesProposalItem[]
}

export type SalesCadenceStatus = 'active' | 'archived'
export type SalesCadenceEnrollmentStatus = 'active' | 'completed' | 'cancelled'
export type CadenceTaskType = 'contact' | 'follow_up' | 'call' | 'meeting' | 'proposal' | 'research' | 'review' | 'other'

export type SalesCadenceStep = {
  id: string
  organization_id: string
  cadence_id: string
  position: number
  title: string
  description: string
  task_type: CadenceTaskType
  priority: TaskItem['priority']
  delay_days: number
  created_at: string
}

export type SalesCadenceTask = {
  id: string
  title: string
  status: TaskItem['status']
  due_at: string | null
  cadence_step_id: string
}

export type SalesCadence = {
  id: string
  organization_id: string
  name: string
  description: string
  status: SalesCadenceStatus
  created_by: string | null
  created_at: string
  updated_at: string
  steps: SalesCadenceStep[]
}

export type SalesCadenceEnrollment = {
  id: string
  organization_id: string
  cadence_id: string
  lead_id: string
  status: SalesCadenceEnrollmentStatus
  enrolled_at: string
  completed_at: string | null
  cancelled_at: string | null
  enrolled_by: string | null
  created_at: string
  updated_at: string
  lead_name: string
  lead_company_id: string | null
  tasks: SalesCadenceTask[]
}

export type ConversationMessage = {
  id: string
  organization_id: string
  conversation_id: string
  direction: ConversationMessageDirection
  status: ConversationMessageStatus
  body: string
  created_by: string | null
  occurred_at: string
  created_at: string
}

export type TaskItem = {
  id: string
  organization_id: string
  lead_id: string | null
  title: string
  description: string
  type: 'contact' | 'follow_up' | 'call' | 'meeting' | 'proposal' | 'research' | 'review' | 'other' | string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'pending' | 'in_progress' | 'done' | 'completed' | 'cancelled'
  assigned_to?: string | null
  source?: 'manual' | 'ai' | 'system'
  completed_at?: string | null
  due_at: string | null
  cadence_enrollment_id?: string | null
  cadence_step_id?: string | null
  created_at: string
  updated_at: string
}

export type DashboardStats = {
  leadsToday: number
  leadsFound: number
  hotLeads: number
  warmLeads: number
  coldLeads: number
  companiesAnalyzed: number
  prospectingJobs: number
  pendingContacts: number
  meetings: number
  opportunities: number
  isEmpty: boolean
}
