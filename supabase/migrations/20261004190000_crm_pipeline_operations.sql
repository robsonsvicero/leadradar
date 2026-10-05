create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  color text not null default '#64748b',
  position integer not null check (position >= 0),
  probability integer not null default 0 check (probability between 0 and 100),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, slug),
  check (not (is_won and is_lost))
);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in (
    'lead_created', 'stage_changed', 'score_changed', 'ai_analyzed', 'task_created',
    'task_completed', 'email_draft_created', 'email_approved', 'message_sent',
    'message_delivered', 'message_replied', 'meeting_scheduled', 'meeting_completed',
    'proposal_created', 'proposal_sent', 'proposal_viewed', 'note_added',
    'lead_assigned', 'lead_reassigned'
  )),
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists pipeline_stage_id uuid references public.pipeline_stages(id) on delete set null,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists last_contact_at timestamptz,
  add column if not exists last_response_at timestamptz,
  add column if not exists qualified_at timestamptz,
  add column if not exists won_at timestamptz,
  add column if not exists won_reason text,
  add column if not exists won_service text,
  add column if not exists lost_at timestamptz,
  add column if not exists lost_reason text,
  add column if not exists lost_notes text,
  add column if not exists next_best_action text,
  add column if not exists next_best_action_reason text,
  add column if not exists next_best_action_score integer check (next_best_action_score between 0 and 100),
  add column if not exists ai_updated_at timestamptz,
  add column if not exists source text,
  add column if not exists prospecting_job_id uuid references public.prospecting_jobs(id) on delete set null;

alter table public.tasks
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists completed_at timestamptz;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in (
    'new', 'qualified', 'contact_pending', 'contacted', 'replied', 'meeting',
    'proposal', 'negotiation', 'won', 'lost'
  ));

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('open', 'pending', 'in_progress', 'done', 'completed', 'cancelled'));
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));
alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check
  check (type in ('contact', 'follow_up', 'call', 'meeting', 'proposal', 'research', 'review', 'other'));
alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('manual', 'ai', 'system'));

create or replace function public.seed_default_pipeline_stages(target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pipeline_stages (
    organization_id, name, slug, description, color, position, probability, is_won, is_lost
  )
  values
    (target_organization_id, 'Novo', 'new', 'Lead recém-adicionado ao pipeline.', '#64748b', 0, 5, false, false),
    (target_organization_id, 'Qualificado', 'qualified', 'Lead qualificado para contato.', '#0ea5e9', 1, 10, false, false),
    (target_organization_id, 'Contato pendente', 'contact_pending', 'Aguardando primeiro contato.', '#6366f1', 2, 15, false, false),
    (target_organization_id, 'Contatado', 'contacted', 'Primeiro contato realizado.', '#8b5cf6', 3, 20, false, false),
    (target_organization_id, 'Respondeu', 'replied', 'O prospect respondeu.', '#d946ef', 4, 30, false, false),
    (target_organization_id, 'Reunião', 'meeting', 'Reunião agendada ou em andamento.', '#f59e0b', 5, 45, false, false),
    (target_organization_id, 'Proposta', 'proposal', 'Proposta comercial em avaliação.', '#f97316', 6, 60, false, false),
    (target_organization_id, 'Negociação', 'negotiation', 'Condições comerciais em negociação.', '#ef4444', 7, 75, false, false),
    (target_organization_id, 'Ganho', 'won', 'Oportunidade convertida em venda.', '#16a34a', 8, 100, true, false),
    (target_organization_id, 'Perdido', 'lost', 'Oportunidade encerrada sem venda.', '#475569', 9, 0, false, true)
  on conflict (organization_id, slug) do nothing;
end;
$$;
revoke all on function public.seed_default_pipeline_stages(uuid) from public;

create or replace function public.is_member_of_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
  );
$$;
revoke all on function public.is_member_of_organization(uuid) from public;
grant execute on function public.is_member_of_organization(uuid) to authenticated, service_role;

create or replace function public.get_organization_member_roster(target_organization_ids uuid[])
returns table (
  organization_id uuid,
  user_id uuid,
  member_role text,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select member.organization_id, member.user_id, member.role, profile.full_name
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id
  where member.organization_id = any(target_organization_ids)
    and public.is_member_of_organization(member.organization_id);
$$;
revoke all on function public.get_organization_member_roster(uuid[]) from public;
grant execute on function public.get_organization_member_roster(uuid[]) to authenticated;

create or replace function public.seed_organization_pipeline_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_pipeline_stages(new.id);
  return new;
end;
$$;

drop trigger if exists seed_organization_pipeline_stages on public.organizations;
create trigger seed_organization_pipeline_stages
after insert on public.organizations
for each row execute function public.seed_organization_pipeline_stages();

do $$
declare
  organization_row record;
begin
  for organization_row in select id from public.organizations loop
    perform public.seed_default_pipeline_stages(organization_row.id);
  end loop;
end;
$$;

update public.leads lead
set pipeline_stage_id = stage.id
from public.pipeline_stages stage
where stage.organization_id = lead.organization_id
  and stage.slug = case lead.status
    when 'new' then 'new'
    when 'qualified' then 'qualified'
    when 'contacted' then 'contacted'
    when 'proposal' then 'proposal'
    when 'won' then 'won'
    when 'lost' then 'lost'
    else 'new'
  end
  and lead.pipeline_stage_id is null;

update public.leads
set source = 'google_places'
where source is null
  and company_id in (select id from public.companies where source = 'google_places');

create or replace function public.validate_lead_pipeline_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role text;
  stage_is_won boolean := false;
  stage_is_lost boolean := false;
  stage_is_active boolean := false;
  stage_changed boolean := false;
  closing_event boolean := false;
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'A lead cannot be moved between organizations'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
    and new.pipeline_stage_id is not distinct from old.pipeline_stage_id then
    select stage.id into new.pipeline_stage_id
    from public.pipeline_stages stage
    where stage.organization_id = new.organization_id
      and stage.slug = new.status
      and stage.is_active
    limit 1;
  end if;

  if tg_op = 'INSERT' then
    stage_changed := true;
    closing_event := true;
  else
    stage_changed := new.pipeline_stage_id is distinct from old.pipeline_stage_id;
    closing_event := stage_changed or new.status is distinct from old.status;
  end if;

  if new.pipeline_stage_id is null then
    select stage.id into new.pipeline_stage_id
    from public.pipeline_stages stage
    where stage.organization_id = new.organization_id
      and stage.slug = coalesce(new.status, 'new')
      and stage.is_active
    limit 1;
  end if;

  if new.pipeline_stage_id is not null and not exists (
    select 1 from public.pipeline_stages stage
    where stage.id = new.pipeline_stage_id
      and stage.organization_id = new.organization_id
  ) then
    raise exception 'Pipeline stage must be active and belong to the lead organization'
      using errcode = '23514';
  end if;

  if new.pipeline_stage_id is not null then
    select stage.is_won, stage.is_lost, stage.is_active
      into stage_is_won, stage_is_lost, stage_is_active
    from public.pipeline_stages stage
    where stage.id = new.pipeline_stage_id
      and stage.organization_id = new.organization_id;
  end if;

  if not stage_is_active and new.pipeline_stage_id is not null and stage_changed then
    raise exception 'A lead can only be moved to an active pipeline stage'
      using errcode = '23514';
  end if;

  if closing_event then
    if stage_is_won or new.status = 'won' then
      if nullif(btrim(new.won_service), '') is null
        or nullif(btrim(new.won_reason), '') is null then
        raise exception 'Record the sold service and win reason before closing as won'
          using errcode = '23514';
      end if;
    end if;
    if stage_is_lost or new.status = 'lost' then
      if new.lost_reason is null
        or new.lost_reason not in ('price', 'timing', 'competitor', 'no_budget', 'no_need', 'no_response', 'bad_fit', 'other') then
        raise exception 'Select a valid loss reason before closing as lost'
          using errcode = '23514';
      end if;
    end if;
  end if;

  if new.owner_id is not null and not exists (
    select 1 from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.owner_id
  ) then
    raise exception 'Lead owner must belong to the same organization'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.owner_id is not null and auth.uid() is not null
    and new.owner_id is distinct from auth.uid() then
    select member.role into member_role
    from public.organization_members member
    where member.organization_id = new.organization_id and member.user_id = auth.uid();
    if member_role not in ('owner', 'admin') then
      raise exception 'Only organization owners and admins can assign leads to other members'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id and auth.uid() is not null then
    select member.role into member_role
    from public.organization_members member
    where member.organization_id = new.organization_id and member.user_id = auth.uid();
    if member_role is null then
      raise exception 'Organization membership is required to reassign a lead'
        using errcode = '42501';
    end if;
    if member_role = 'member' then
      raise exception 'Only organization owners and admins can reassign leads'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_lead_pipeline_assignment on public.leads;
create trigger validate_lead_pipeline_assignment
before insert or update of organization_id, pipeline_stage_id, owner_id, status on public.leads
for each row execute function public.validate_lead_pipeline_assignment();

create or replace function public.record_lead_pipeline_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_stage_name text;
  new_stage_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (organization_id, lead_id, user_id, type, title)
    values (new.organization_id, new.id, auth.uid(), 'lead_created', 'Lead adicionado ao CRM');
    return new;
  end if;

  if new.pipeline_stage_id is distinct from old.pipeline_stage_id then
    select name into old_stage_name from public.pipeline_stages where id = old.pipeline_stage_id;
    select name into new_stage_name from public.pipeline_stages where id = new.pipeline_stage_id;
    insert into public.lead_activities (
      organization_id, lead_id, user_id, type, title, description, metadata
    )
    values (
      new.organization_id, new.id, auth.uid(), 'stage_changed', 'Etapa do pipeline alterada',
      concat(coalesce(old_stage_name, 'Sem etapa'), ' → ', coalesce(new_stage_name, 'Sem etapa')),
      jsonb_build_object(
        'from_stage_id', old.pipeline_stage_id,
        'to_stage_id', new.pipeline_stage_id,
        'won_reason', new.won_reason,
        'won_service', new.won_service,
        'lost_reason', new.lost_reason,
        'lost_notes', new.lost_notes
      )
    );
  end if;

  if new.owner_id is distinct from old.owner_id then
    insert into public.lead_activities (
      organization_id, lead_id, user_id, type, title, metadata
    )
    values (
      new.organization_id, new.id, auth.uid(),
      case when old.owner_id is null then 'lead_assigned' else 'lead_reassigned' end,
      case when old.owner_id is null then 'Responsável atribuído' else 'Responsável alterado' end,
      jsonb_build_object('from_owner_id', old.owner_id, 'to_owner_id', new.owner_id)
    );
  end if;

  if new.action_score is distinct from old.action_score then
    insert into public.lead_activities (
      organization_id, lead_id, user_id, type, title, description, metadata
    )
    values (
      new.organization_id, new.id, auth.uid(), 'score_changed', 'Action Score atualizado',
      concat('Pontuação: ', old.action_score, ' → ', new.action_score),
      jsonb_build_object('from_score', old.action_score, 'to_score', new.action_score)
    );
  end if;

  if new.ai_updated_at is distinct from old.ai_updated_at then
    insert into public.lead_activities (
      organization_id, lead_id, user_id, type, title, description, metadata
    )
    values (
      new.organization_id, new.id, auth.uid(), 'ai_analyzed', 'Inteligência comercial atualizada',
      'A análise assistida por IA foi atualizada.',
      jsonb_build_object('ai_updated_at', new.ai_updated_at)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_lead_pipeline_activity on public.leads;
create trigger record_lead_pipeline_activity
after insert or update of pipeline_stage_id, owner_id, action_score, ai_updated_at on public.leads
for each row execute function public.record_lead_pipeline_activity();

create or replace function public.record_task_pipeline_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.lead_id is not null then
      insert into public.lead_activities (organization_id, lead_id, user_id, type, title, description, metadata)
      values (
        new.organization_id, new.lead_id, auth.uid(), 'task_created', 'Tarefa criada', new.title,
        jsonb_build_object('task_id', new.id, 'source', new.source)
      );
    end if;
  elsif new.lead_id is not null and new.status in ('done', 'completed')
    and old.status not in ('done', 'completed') then
    insert into public.lead_activities (organization_id, lead_id, user_id, type, title, description, metadata)
    values (
      new.organization_id, new.lead_id, auth.uid(), 'task_completed', 'Tarefa concluída', new.title,
      jsonb_build_object('task_id', new.id)
    );
  end if;
  return new;
end;
$$;

create or replace function public.validate_task_pipeline_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'A task cannot be moved between organizations'
      using errcode = '42501';
  end if;

  if new.lead_id is not null and not exists (
    select 1 from public.leads lead
    where lead.id = new.lead_id and lead.organization_id = new.organization_id
  ) then
    raise exception 'Task lead must belong to the same organization'
      using errcode = '23514';
  end if;

  if new.assigned_to is not null and not exists (
    select 1 from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.assigned_to
  ) then
    raise exception 'Task assignee must belong to the same organization'
      using errcode = '23514';
  end if;

  if new.status in ('done', 'completed') then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_task_pipeline_assignment on public.tasks;
create trigger validate_task_pipeline_assignment
before insert or update of organization_id, lead_id, assigned_to, status on public.tasks
for each row execute function public.validate_task_pipeline_assignment();

drop trigger if exists record_task_pipeline_activity on public.tasks;
create trigger record_task_pipeline_activity
after insert or update of status on public.tasks
for each row execute function public.record_task_pipeline_activity();

create index if not exists pipeline_stages_org_position_idx
  on public.pipeline_stages (organization_id, position) where is_active;
create index if not exists leads_org_stage_idx on public.leads (organization_id, pipeline_stage_id);
create index if not exists leads_org_owner_idx on public.leads (organization_id, owner_id);
create index if not exists leads_org_next_action_idx on public.leads (organization_id, next_action_at);
create index if not exists lead_activities_org_lead_created_idx
  on public.lead_activities (organization_id, lead_id, created_at desc);
create index if not exists tasks_org_assignee_due_idx
  on public.tasks (organization_id, assigned_to, due_at);
create index if not exists tasks_open_lead_action_idx
  on public.tasks (organization_id, lead_id, type, status)
  where status in ('open', 'pending', 'in_progress');

drop trigger if exists pipeline_stages_updated_at on public.pipeline_stages;
create trigger pipeline_stages_updated_at
before update on public.pipeline_stages
for each row execute function public.update_updated_at();

create or replace function public.prevent_pipeline_stage_organization_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A pipeline stage cannot be moved between organizations'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_pipeline_stage_organization_change on public.pipeline_stages;
create trigger prevent_pipeline_stage_organization_change
before update of organization_id on public.pipeline_stages
for each row execute function public.prevent_pipeline_stage_organization_change();

alter table public.pipeline_stages enable row level security;
alter table public.lead_activities enable row level security;

drop policy if exists "members can read organization pipeline stages" on public.pipeline_stages;
create policy "members can read organization pipeline stages"
on public.pipeline_stages for select
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = pipeline_stages.organization_id
    and member.user_id = auth.uid()
));

drop policy if exists "organization admins can manage pipeline stages" on public.pipeline_stages;
drop policy if exists "organization admins can insert pipeline stages" on public.pipeline_stages;
create policy "organization admins can insert pipeline stages"
on public.pipeline_stages for insert
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = pipeline_stages.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

drop policy if exists "organization admins can update pipeline stages" on public.pipeline_stages;
create policy "organization admins can update pipeline stages"
on public.pipeline_stages for update
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = pipeline_stages.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
))
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = pipeline_stages.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

drop policy if exists "members can read lead activities" on public.lead_activities;
create policy "members can read lead activities"
on public.lead_activities for select
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = lead_activities.organization_id
    and member.user_id = auth.uid()
));

drop policy if exists "members can record lead activities" on public.lead_activities;
create policy "members can record lead activities"
on public.lead_activities for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.organization_members member
    join public.leads lead on lead.id = lead_activities.lead_id
      and lead.organization_id = member.organization_id
    where member.organization_id = lead_activities.organization_id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "members can manage leads in organization" on public.leads;
drop policy if exists "members can create leads in organization" on public.leads;
create policy "members can create leads in organization"
on public.leads for insert
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = leads.organization_id and member.user_id = auth.uid()
));

drop policy if exists "members can update leads in organization" on public.leads;
create policy "members can update leads in organization"
on public.leads for update
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = leads.organization_id and member.user_id = auth.uid()
))
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = leads.organization_id and member.user_id = auth.uid()
));

drop policy if exists "organization admins can delete leads" on public.leads;
create policy "organization admins can delete leads"
on public.leads for delete
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = leads.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

drop policy if exists "members can manage tasks in organization" on public.tasks;
drop policy if exists "members can create tasks in organization" on public.tasks;
create policy "members can create tasks in organization"
on public.tasks for insert
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = tasks.organization_id and member.user_id = auth.uid()
));

drop policy if exists "members can update tasks in organization" on public.tasks;
create policy "members can update tasks in organization"
on public.tasks for update
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = tasks.organization_id and member.user_id = auth.uid()
))
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = tasks.organization_id and member.user_id = auth.uid()
));

drop policy if exists "organization admins can delete tasks" on public.tasks;
create policy "organization admins can delete tasks"
on public.tasks for delete
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = tasks.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

drop policy if exists "members can read coworker memberships" on public.organization_members;
