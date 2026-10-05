alter table public.lead_activities
  drop constraint if exists lead_activities_type_check;
alter table public.lead_activities
  add constraint lead_activities_type_check
  check (type in (
    'lead_created', 'stage_changed', 'score_changed', 'ai_analyzed', 'task_created',
    'task_completed', 'email_draft_created', 'email_approved', 'message_sent',
    'message_delivered', 'message_replied', 'message_draft_created', 'meeting_scheduled',
    'meeting_completed', 'meeting_cancelled', 'meeting_rescheduled', 'proposal_created',
    'proposal_sent', 'proposal_viewed', 'proposal_accepted', 'proposal_rejected',
    'proposal_cancelled', 'cadence_enrolled', 'cadence_completed', 'cadence_cancelled',
    'note_added', 'lead_assigned', 'lead_reassigned'
  ));

create table if not exists public.sales_cadences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table if not exists public.sales_cadence_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cadence_id uuid not null,
  position integer not null check (position between 0 and 19),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  task_type text not null default 'follow_up'
    check (task_type in ('contact', 'follow_up', 'call', 'meeting', 'proposal', 'research', 'review', 'other')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, cadence_id, position),
  constraint sales_cadence_steps_cadence_fkey
    foreign key (organization_id, cadence_id)
    references public.sales_cadences (organization_id, id)
    on delete cascade
);

create table if not exists public.sales_cadence_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cadence_id uuid not null,
  lead_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  enrolled_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint sales_cadence_enrollments_cadence_fkey
    foreign key (organization_id, cadence_id)
    references public.sales_cadences (organization_id, id),
  constraint sales_cadence_enrollments_lead_fkey
    foreign key (organization_id, lead_id)
    references public.leads (organization_id, id)
    on delete cascade,
  constraint sales_cadence_enrollments_state_consistency
    check (
      (status = 'active' and completed_at is null and cancelled_at is null)
      or (status = 'completed' and completed_at is not null and cancelled_at is null)
      or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    )
);

alter table public.tasks
  add column if not exists cadence_enrollment_id uuid,
  add column if not exists cadence_step_id uuid;

alter table public.tasks
  drop constraint if exists tasks_cadence_enrollment_fkey;
alter table public.tasks
  add constraint tasks_cadence_enrollment_fkey
  foreign key (organization_id, cadence_enrollment_id)
  references public.sales_cadence_enrollments (organization_id, id);

alter table public.tasks
  drop constraint if exists tasks_cadence_step_fkey;
alter table public.tasks
  add constraint tasks_cadence_step_fkey
  foreign key (organization_id, cadence_step_id)
  references public.sales_cadence_steps (organization_id, id);

create unique index if not exists sales_cadence_enrollments_one_active_idx
  on public.sales_cadence_enrollments (organization_id, cadence_id, lead_id)
  where status = 'active';
create unique index if not exists tasks_cadence_step_once_idx
  on public.tasks (organization_id, cadence_enrollment_id, cadence_step_id)
  where cadence_enrollment_id is not null and cadence_step_id is not null;
create index if not exists sales_cadences_org_status_name_idx
  on public.sales_cadences (organization_id, status, name);
create index if not exists sales_cadence_steps_org_cadence_position_idx
  on public.sales_cadence_steps (organization_id, cadence_id, position);
create index if not exists sales_cadence_enrollments_org_cadence_status_idx
  on public.sales_cadence_enrollments (organization_id, cadence_id, status);
create index if not exists sales_cadence_enrollments_org_lead_idx
  on public.sales_cadence_enrollments (organization_id, lead_id, created_at desc);

alter table public.sales_cadences enable row level security;
alter table public.sales_cadence_steps enable row level security;
alter table public.sales_cadence_enrollments enable row level security;

drop policy if exists "members can read organization sales cadences" on public.sales_cadences;
create policy "members can read organization sales cadences"
on public.sales_cadences for select
using (public.is_member_of_organization(organization_id));

drop policy if exists "members can read organization cadence steps" on public.sales_cadence_steps;
create policy "members can read organization cadence steps"
on public.sales_cadence_steps for select
using (public.is_member_of_organization(organization_id));

drop policy if exists "members can read organization cadence enrollments" on public.sales_cadence_enrollments;
create policy "members can read organization cadence enrollments"
on public.sales_cadence_enrollments for select
using (public.is_member_of_organization(organization_id));

create or replace function public.prevent_sales_cadence_template_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Cadence identity cannot be changed'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status = 'archived' then
    raise exception 'Archived cadences are read-only'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_sales_cadence_template_change on public.sales_cadences;
create trigger prevent_sales_cadence_template_change
before update or delete on public.sales_cadences
for each row execute function public.prevent_sales_cadence_template_change();

create or replace function public.prevent_sales_cadence_step_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_cadence_id uuid;
  parent_organization_id uuid;
  has_enrollment boolean;
begin
  if tg_op = 'DELETE' then
    parent_cadence_id := old.cadence_id;
    parent_organization_id := old.organization_id;
  else
    parent_cadence_id := new.cadence_id;
    parent_organization_id := new.organization_id;
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.cadence_id is distinct from old.cadence_id
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Cadence step identity cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  select exists (
    select 1 from public.sales_cadence_enrollments enrollment
    where enrollment.organization_id = parent_organization_id
      and enrollment.cadence_id = parent_cadence_id
  ) into has_enrollment;
  if has_enrollment then
    raise exception 'A cadence with enrollments cannot be changed'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_sales_cadence_step_change on public.sales_cadence_steps;
create trigger prevent_sales_cadence_step_change
before update or delete on public.sales_cadence_steps
for each row execute function public.prevent_sales_cadence_step_change();

create or replace function public.create_sales_cadence(
  p_organization_id uuid,
  p_name text,
  p_description text,
  p_steps jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cadence_id uuid;
  item jsonb;
  item_position integer := 0;
begin
  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Organization membership is required'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'A cadence must have between 1 and 20 steps'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 20 then
    raise exception 'A cadence must have between 1 and 20 steps'
      using errcode = '22023';
  end if;

  insert into public.sales_cadences (organization_id, name, description)
  values (p_organization_id, p_name, coalesce(p_description, ''))
  returning id into cadence_id;

  for item in select value from jsonb_array_elements(p_steps)
  loop
    insert into public.sales_cadence_steps (
      organization_id, cadence_id, position, title, description, task_type, priority, delay_days
    ) values (
      p_organization_id,
      cadence_id,
      item_position,
      item ->> 'title',
      coalesce(item ->> 'description', ''),
      coalesce(item ->> 'task_type', 'follow_up'),
      coalesce(item ->> 'priority', 'medium'),
      coalesce((item ->> 'delay_days')::integer, 0)
    );
    item_position := item_position + 1;
  end loop;

  return cadence_id;
end;
$$;

create or replace function public.enroll_lead_in_sales_cadence(
  p_cadence_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_cadence public.sales_cadences%rowtype;
  selected_lead public.leads%rowtype;
  enrollment_id uuid;
  enrollment_time timestamptz := now();
  cadence_step public.sales_cadence_steps%rowtype;
begin
  select * into selected_cadence
  from public.sales_cadences cadence
  where cadence.id = p_cadence_id
    and cadence.status = 'active'
    and public.is_member_of_organization(cadence.organization_id)
  for share;
  if not found then
    raise exception 'Active cadence not found in your organization'
      using errcode = '42501';
  end if;

  select * into selected_lead
  from public.leads lead
  where lead.id = p_lead_id
    and lead.organization_id = selected_cadence.organization_id;
  if not found then
    raise exception 'Lead must belong to the cadence organization'
      using errcode = '23514';
  end if;

  insert into public.sales_cadence_enrollments (
    organization_id, cadence_id, lead_id
  ) values (
    selected_cadence.organization_id, selected_cadence.id, selected_lead.id
  ) returning id into enrollment_id;

  for cadence_step in
    select * from public.sales_cadence_steps step
    where step.organization_id = selected_cadence.organization_id
      and step.cadence_id = selected_cadence.id
    order by step.position
  loop
    insert into public.tasks (
      organization_id, lead_id, title, description, type, priority, status,
      assigned_to, source, due_at, cadence_enrollment_id, cadence_step_id
    ) values (
      selected_cadence.organization_id,
      selected_lead.id,
      cadence_step.title,
      concat_ws(E'\n\n', 'Cadência: ' || selected_cadence.name, nullif(cadence_step.description, '')),
      cadence_step.task_type,
      cadence_step.priority,
      'pending',
      coalesce(selected_lead.owner_id, auth.uid()),
      'system',
      enrollment_time + make_interval(days => cadence_step.delay_days),
      enrollment_id,
      cadence_step.id
    );
  end loop;

  return enrollment_id;
end;
$$;

create or replace function public.cancel_sales_cadence_enrollment(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
begin
  select enrollment.organization_id into target_organization_id
  from public.sales_cadence_enrollments enrollment
  where enrollment.id = p_enrollment_id
    and enrollment.status = 'active'
    and public.is_member_of_organization(enrollment.organization_id)
  for update;
  if target_organization_id is null then
    raise exception 'Active cadence enrollment not found in your organization'
      using errcode = '42501';
  end if;

  update public.sales_cadence_enrollments
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = p_enrollment_id and organization_id = target_organization_id;
  update public.tasks
  set status = 'cancelled'
  where organization_id = target_organization_id
    and cadence_enrollment_id = p_enrollment_id
    and status in ('open', 'pending', 'in_progress');
end;
$$;

create or replace function public.archive_sales_cadence(p_cadence_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
begin
  select cadence.organization_id into target_organization_id
  from public.sales_cadences cadence
  where cadence.id = p_cadence_id
    and cadence.status = 'active'
    and public.is_member_of_organization(cadence.organization_id)
  for update;
  if target_organization_id is null then
    raise exception 'Active cadence not found in your organization'
      using errcode = '42501';
  end if;

  update public.sales_cadences
  set status = 'archived', updated_at = now()
  where id = p_cadence_id and organization_id = target_organization_id;
end;
$$;

revoke all on function public.create_sales_cadence(uuid, text, text, jsonb) from public, anon;
revoke all on function public.enroll_lead_in_sales_cadence(uuid, uuid) from public, anon;
revoke all on function public.cancel_sales_cadence_enrollment(uuid) from public, anon;
revoke all on function public.archive_sales_cadence(uuid) from public, anon;
grant execute on function public.create_sales_cadence(uuid, text, text, jsonb) to authenticated;
grant execute on function public.enroll_lead_in_sales_cadence(uuid, uuid) to authenticated;
grant execute on function public.cancel_sales_cadence_enrollment(uuid) to authenticated;
grant execute on function public.archive_sales_cadence(uuid) to authenticated;

create or replace function public.validate_sales_cadence_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  enrollment_lead_id uuid;
  enrollment_status text;
begin
  if (new.cadence_enrollment_id is null) is distinct from (new.cadence_step_id is null) then
    raise exception 'Cadence enrollment and step must be set together'
      using errcode = '23514';
  end if;

  if new.cadence_enrollment_id is not null then
    if tg_op = 'UPDATE' and (
      new.cadence_enrollment_id is distinct from old.cadence_enrollment_id
      or new.cadence_step_id is distinct from old.cadence_step_id
      or new.lead_id is distinct from old.lead_id
      or new.organization_id is distinct from old.organization_id
    ) then
      raise exception 'Cadence task identity cannot be changed'
        using errcode = '42501';
    end if;

    select enrollment.lead_id, enrollment.status
    into enrollment_lead_id, enrollment_status
    from public.sales_cadence_enrollments enrollment
    join public.sales_cadence_steps step
      on step.organization_id = enrollment.organization_id
      and step.cadence_id = enrollment.cadence_id
      and step.id = new.cadence_step_id
    where enrollment.id = new.cadence_enrollment_id
      and enrollment.organization_id = new.organization_id;

    if enrollment_lead_id is null or enrollment_lead_id is distinct from new.lead_id then
      raise exception 'Cadence task must match its enrollment lead'
        using errcode = '23514';
    end if;
    if tg_op = 'INSERT' and enrollment_status <> 'active' then
      raise exception 'Tasks can only be created for active cadence enrollments'
        using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status
      and (
        enrollment_status = 'completed'
        or (enrollment_status = 'cancelled' and new.status <> 'cancelled')
      ) then
      raise exception 'Tasks cannot be reopened after their cadence has ended'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_sales_cadence_task() from public;

drop trigger if exists validate_sales_cadence_task on public.tasks;
create trigger validate_sales_cadence_task
before insert or update on public.tasks
for each row execute function public.validate_sales_cadence_task();

create or replace function public.prevent_sales_cadence_task_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cadence_enrollment_id is not null then
    raise exception 'Tasks linked to a cadence enrollment cannot be deleted'
      using errcode = '23514';
  end if;
  return old;
end;
$$;
revoke all on function public.prevent_sales_cadence_task_delete() from public;

drop trigger if exists prevent_sales_cadence_task_delete on public.tasks;
create trigger prevent_sales_cadence_task_delete
before delete on public.tasks
for each row execute function public.prevent_sales_cadence_task_delete();

create or replace function public.update_sales_cadence_enrollment_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_count integer;
  completed_task_count integer;
begin
  if new.cadence_enrollment_id is null or old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'cancelled' then
    update public.sales_cadence_enrollments
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where organization_id = new.organization_id
      and id = new.cadence_enrollment_id
      and status = 'active';
    update public.tasks task
    set status = 'cancelled'
    where task.organization_id = new.organization_id
      and task.cadence_enrollment_id = new.cadence_enrollment_id
      and task.id <> new.id
      and task.status in ('open', 'pending', 'in_progress');
  elsif new.status in ('done', 'completed') then
    select count(*), count(*) filter (where task.status in ('done', 'completed'))
    into task_count, completed_task_count
    from public.tasks task
    where task.organization_id = new.organization_id
      and task.cadence_enrollment_id = new.cadence_enrollment_id;
    if task_count > 0 and task_count = completed_task_count then
      update public.sales_cadence_enrollments
      set status = 'completed', completed_at = now(), updated_at = now()
      where organization_id = new.organization_id
        and id = new.cadence_enrollment_id
        and status = 'active';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.update_sales_cadence_enrollment_from_task() from public;

drop trigger if exists update_sales_cadence_enrollment_from_task on public.tasks;
create trigger update_sales_cadence_enrollment_from_task
after update of status on public.tasks
for each row execute function public.update_sales_cadence_enrollment_from_task();

create or replace function public.record_sales_cadence_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cadence_name text;
  activity_type text;
  activity_title text;
begin
  select cadence.name into cadence_name
  from public.sales_cadences cadence
  where cadence.organization_id = new.organization_id
    and cadence.id = new.cadence_id;

  if tg_op = 'INSERT' then
    activity_type := 'cadence_enrolled';
    activity_title := 'Lead inscrito em cadência';
  elsif new.status is distinct from old.status then
    activity_type := case new.status
      when 'completed' then 'cadence_completed'
      when 'cancelled' then 'cadence_cancelled'
      else null
    end;
    activity_title := case new.status
      when 'completed' then 'Cadência concluída'
      when 'cancelled' then 'Cadência cancelada'
      else null
    end;
    if activity_type is null then return new; end if;
  else
    return new;
  end if;

  insert into public.lead_activities (
    organization_id, lead_id, user_id, type, title, description, metadata
  ) values (
    new.organization_id, new.lead_id, auth.uid(), activity_type, activity_title,
    cadence_name,
    jsonb_build_object('cadence_id', new.cadence_id, 'enrollment_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;
revoke all on function public.record_sales_cadence_activity() from public;

drop trigger if exists record_sales_cadence_activity on public.sales_cadence_enrollments;
create trigger record_sales_cadence_activity
after insert or update of status on public.sales_cadence_enrollments
for each row execute function public.record_sales_cadence_activity();
