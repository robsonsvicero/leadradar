create table if not exists public.ai_follow_up_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  ai_analysis_log_id uuid references public.ai_analysis_logs(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'instagram', 'linkedin')),
  tone text not null,
  interaction_context text not null,
  variants jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_variant integer check (approved_variant between 0 and 2),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, created_by, request_id)
);

create index if not exists ai_follow_up_drafts_org_lead_created_idx
  on public.ai_follow_up_drafts (organization_id, lead_id, created_at desc);

drop trigger if exists ai_follow_up_drafts_updated_at on public.ai_follow_up_drafts;
create trigger ai_follow_up_drafts_updated_at
before update on public.ai_follow_up_drafts
for each row execute function public.update_updated_at();

alter table public.ai_follow_up_drafts enable row level security;

drop policy if exists "members can read AI follow-up drafts" on public.ai_follow_up_drafts;
create policy "members can read AI follow-up drafts"
on public.ai_follow_up_drafts for select
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = ai_follow_up_drafts.organization_id
    and om.user_id = auth.uid()
));
