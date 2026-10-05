alter table public.lead_activities
  drop constraint if exists lead_activities_type_check;
alter table public.lead_activities
  add constraint lead_activities_type_check
  check (type in (
    'lead_created', 'stage_changed', 'score_changed', 'ai_analyzed', 'task_created',
    'task_completed', 'email_draft_created', 'email_approved', 'message_sent',
    'message_delivered', 'message_replied', 'message_draft_created', 'meeting_scheduled',
    'meeting_completed', 'meeting_cancelled', 'meeting_rescheduled', 'proposal_created', 'proposal_sent',
    'proposal_viewed', 'note_added', 'lead_assigned', 'lead_reassigned'
  ));

create table if not exists public.sales_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  starts_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  meeting_url text check (
    meeting_url is null
    or (
      char_length(meeting_url) <= 2048
      and meeting_url ~* '^https?://'
    )
  ),
  notes text check (notes is null or char_length(notes) <= 4000),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint sales_meetings_organization_lead_fkey
    foreign key (organization_id, lead_id)
    references public.leads (organization_id, id)
    on delete cascade,
  constraint sales_meetings_completion_consistency
    check (
      (status = 'completed' and completed_at is not null)
      or (status <> 'completed' and completed_at is null)
    )
);

create index if not exists sales_meetings_org_status_start_idx
  on public.sales_meetings (organization_id, status, starts_at);
create index if not exists sales_meetings_org_lead_start_idx
  on public.sales_meetings (organization_id, lead_id, starts_at desc);

alter table public.sales_meetings enable row level security;

drop policy if exists "members can read organization sales meetings" on public.sales_meetings;
create policy "members can read organization sales meetings"
on public.sales_meetings for select
using (public.is_member_of_organization(organization_id));

drop policy if exists "members can create organization sales meetings" on public.sales_meetings;
create policy "members can create organization sales meetings"
on public.sales_meetings for insert
with check (
  public.is_member_of_organization(organization_id)
  and created_by = auth.uid()
);

drop policy if exists "members can update organization sales meetings" on public.sales_meetings;
create policy "members can update organization sales meetings"
on public.sales_meetings for update
using (public.is_member_of_organization(organization_id))
with check (public.is_member_of_organization(organization_id));

drop policy if exists "organization admins can delete sales meetings" on public.sales_meetings;
create policy "organization admins can delete sales meetings"
on public.sales_meetings for delete
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = sales_meetings.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

create or replace function public.prevent_sales_meeting_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.lead_id is distinct from old.lead_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Meeting identity and organization cannot be changed'
      using errcode = '42501';
  end if;

  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prevent_sales_meeting_identity_change on public.sales_meetings;
create trigger prevent_sales_meeting_identity_change
before update on public.sales_meetings
for each row execute function public.prevent_sales_meeting_identity_change();

drop trigger if exists sales_meetings_updated_at on public.sales_meetings;

create or replace function public.record_sales_meeting_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_type text;
  activity_title text;
  activity_description text;
begin
  if tg_op = 'INSERT' then
    activity_type := 'meeting_scheduled';
    activity_title := 'Reunião agendada';
    activity_description := to_char(new.starts_at at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC · ' ||
      new.duration_minutes || ' minutos · ' || new.title;
  elsif new.status is distinct from old.status and new.status in ('completed', 'cancelled') then
    activity_type := case
      when new.status = 'completed' then 'meeting_completed'
      else 'meeting_cancelled'
    end;
    activity_title := case
      when new.status = 'completed' then 'Reunião concluída'
      else 'Reunião cancelada'
    end;
    activity_description := new.title || ' · ' ||
      to_char(new.starts_at at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC';
  elsif new.status = 'scheduled' and (
    new.starts_at is distinct from old.starts_at
    or new.duration_minutes is distinct from old.duration_minutes
    or new.meeting_url is distinct from old.meeting_url
    or new.title is distinct from old.title
    or new.notes is distinct from old.notes
  ) then
    activity_type := 'meeting_rescheduled';
    activity_title := 'Reunião atualizada';
    activity_description := new.title || ' · ' ||
      to_char(new.starts_at at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC';
  else
    return new;
  end if;

  insert into public.lead_activities (
    organization_id, lead_id, user_id, type, title, description, metadata
  ) values (
    new.organization_id, new.lead_id, auth.uid(), activity_type, activity_title,
    activity_description,
    jsonb_build_object('meeting_id', new.id, 'starts_at', new.starts_at, 'status', new.status)
  );
  return new;
end;
$$;
revoke all on function public.record_sales_meeting_activity() from public;

drop trigger if exists record_sales_meeting_activity on public.sales_meetings;
create trigger record_sales_meeting_activity
after insert or update of status, starts_at, duration_minutes, meeting_url, title, notes on public.sales_meetings
for each row execute function public.record_sales_meeting_activity();
