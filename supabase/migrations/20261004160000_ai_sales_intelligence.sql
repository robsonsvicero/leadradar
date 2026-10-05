create table if not exists public.organization_icp_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  target_segments text[] not null default '{}',
  target_locations text[] not null default '{}',
  preferred_services text[] not null default '{}',
  minimum_score integer not null default 0 check (minimum_score between 0 and 100),
  ideal_signals text[] not null default '{}',
  negative_signals text[] not null default '{}',
  weights jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_icp_one_active_per_org_idx
  on public.organization_icp_settings (organization_id)
  where active;

create table if not exists public.organization_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  target_segments text[] not null default '{}',
  selling_points text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.organization_ai_profile (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  company_name text,
  company_description text,
  target_audience text,
  tone text not null default 'consultivo',
  style text not null default 'direto e humano',
  sales_method text,
  forbidden_phrases text[] not null default '{}',
  preferred_phrases text[] not null default '{}',
  signature text,
  preferred_channels text[] not null default '{"email","whatsapp"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_analysis_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_type text not null
    check (analysis_type in ('lead_intelligence', 'deep_analysis', 'outreach', 'follow_up', 'reply_assistant', 'objection_assistant')),
  request_id text not null,
  input_hash text,
  provider text not null default 'openai',
  model text not null,
  prompt_version text not null,
  input_data jsonb not null default '{}'::jsonb,
  output_data jsonb,
  tokens_input integer not null default 0 check (tokens_input >= 0),
  tokens_output integer not null default 0 check (tokens_output >= 0),
  estimated_cost numeric(12, 8),
  latency_ms integer,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  error_code text,
  experiment_id text,
  variant text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, analysis_type, request_id)
);

create index if not exists ai_analysis_logs_org_lead_created_idx
  on public.ai_analysis_logs (organization_id, lead_id, created_at desc);
create index if not exists ai_analysis_logs_org_type_created_idx
  on public.ai_analysis_logs (organization_id, analysis_type, created_at desc);
create index if not exists ai_analysis_logs_cache_idx
  on public.ai_analysis_logs (organization_id, lead_id, analysis_type, input_hash, prompt_version, model, created_at desc)
  where status = 'succeeded';

create table if not exists public.ai_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  ai_analysis_log_id uuid references public.ai_analysis_logs(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'instagram', 'linkedin')),
  tone text not null,
  variants jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_variant integer check (approved_variant between 0 and 2),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, created_by, request_id)
);

create index if not exists ai_outreach_drafts_org_lead_created_idx
  on public.ai_outreach_drafts (organization_id, lead_id, created_at desc);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  ai_analysis_log_id uuid not null references public.ai_analysis_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('helpful', 'unhelpful', 'correct', 'incorrect')),
  rating smallint check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (ai_analysis_log_id, user_id, feedback_type)
);

create table if not exists public.ai_usage_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  operation text not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (organization_id, user_id, usage_date, operation)
);

alter table public.leads
  add column if not exists action_score_reason text,
  add column if not exists icp_match_reason text,
  add column if not exists buying_moment_score integer check (buying_moment_score between 0 and 100),
  add column if not exists ai_updated_at timestamptz;

drop trigger if exists organization_icp_settings_updated_at on public.organization_icp_settings;
create trigger organization_icp_settings_updated_at
before update on public.organization_icp_settings
for each row execute function public.update_updated_at();

drop trigger if exists organization_services_updated_at on public.organization_services;
create trigger organization_services_updated_at
before update on public.organization_services
for each row execute function public.update_updated_at();

drop trigger if exists organization_ai_profile_updated_at on public.organization_ai_profile;
create trigger organization_ai_profile_updated_at
before update on public.organization_ai_profile
for each row execute function public.update_updated_at();

drop trigger if exists ai_outreach_drafts_updated_at on public.ai_outreach_drafts;
create trigger ai_outreach_drafts_updated_at
before update on public.ai_outreach_drafts
for each row execute function public.update_updated_at();

alter table public.organization_icp_settings enable row level security;
alter table public.organization_services enable row level security;
alter table public.organization_ai_profile enable row level security;
alter table public.ai_analysis_logs enable row level security;
alter table public.ai_outreach_drafts enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_usage_counters enable row level security;

drop policy if exists "members can read organization ICP settings" on public.organization_icp_settings;
create policy "members can read organization ICP settings"
on public.organization_icp_settings for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_icp_settings.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "members can read organization services" on public.organization_services;
create policy "members can read organization services"
on public.organization_services for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_services.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "members can read organization AI profile" on public.organization_ai_profile;
create policy "members can read organization AI profile"
on public.organization_ai_profile for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_ai_profile.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "members can read AI analysis logs" on public.ai_analysis_logs;
create policy "members can read AI analysis logs"
on public.ai_analysis_logs for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = ai_analysis_logs.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "members can read AI outreach drafts" on public.ai_outreach_drafts;
create policy "members can read AI outreach drafts"
on public.ai_outreach_drafts for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = ai_outreach_drafts.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "members can read AI feedback" on public.ai_feedback;
create policy "members can read AI feedback"
on public.ai_feedback for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = ai_feedback.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "members can read AI usage counters" on public.ai_usage_counters;
create policy "members can read AI usage counters"
on public.ai_usage_counters for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = ai_usage_counters.organization_id
    and om.user_id = auth.uid()
));

create or replace function public.claim_ai_usage(
  p_organization_id uuid,
  p_user_id uuid,
  p_operation text,
  p_daily_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_count integer;
begin
  if p_daily_limit < 1 or p_operation not in ('lead_intelligence', 'deep_analysis', 'outreach', 'follow_up', 'reply_assistant', 'objection_assistant') then
    return false;
  end if;

  insert into public.ai_usage_counters (organization_id, user_id, usage_date, operation, request_count)
  values (p_organization_id, p_user_id, current_date, p_operation, 1)
  on conflict (organization_id, user_id, usage_date, operation)
  do update set request_count = ai_usage_counters.request_count + 1
  where ai_usage_counters.request_count < p_daily_limit
  returning request_count into claimed_count;

  return claimed_count is not null;
end;
$$;

revoke all on function public.claim_ai_usage(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_usage(uuid, uuid, text, integer) to service_role;
