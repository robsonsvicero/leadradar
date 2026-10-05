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
    'proposal_cancelled', 'note_added', 'lead_assigned', 'lead_reassigned'
  ));

create table if not exists public.sales_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  scope text not null default '' check (char_length(scope) <= 4000),
  valid_until date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected', 'cancelled')),
  currency text not null default 'BRL' check (currency = 'BRL'),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint sales_proposals_organization_lead_fkey
    foreign key (organization_id, lead_id)
    references public.leads (organization_id, id)
    on delete cascade
);

create table if not exists public.sales_proposal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  proposal_id uuid not null,
  description text not null check (char_length(btrim(description)) between 1 and 240),
  quantity numeric(10, 2) not null check (quantity > 0 and quantity <= 1000000),
  unit_price numeric(12, 2) not null check (unit_price >= 0 and unit_price <= 1000000000),
  line_total numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  constraint sales_proposal_items_proposal_fkey
    foreign key (organization_id, proposal_id)
    references public.sales_proposals (organization_id, id)
    on delete cascade
);

create index if not exists sales_proposals_org_status_created_idx
  on public.sales_proposals (organization_id, status, created_at desc);
create index if not exists sales_proposals_org_lead_created_idx
  on public.sales_proposals (organization_id, lead_id, created_at desc);
create index if not exists sales_proposal_items_org_proposal_position_idx
  on public.sales_proposal_items (organization_id, proposal_id, position);

alter table public.sales_proposals enable row level security;
alter table public.sales_proposal_items enable row level security;

drop policy if exists "members can read organization sales proposals" on public.sales_proposals;
create policy "members can read organization sales proposals"
on public.sales_proposals for select
using (public.is_member_of_organization(organization_id));

drop policy if exists "members can create organization sales proposals" on public.sales_proposals;
create policy "members can create organization sales proposals"
on public.sales_proposals for insert
with check (
  public.is_member_of_organization(organization_id)
  and created_by = auth.uid()
  and status = 'draft'
);

drop policy if exists "members can update organization sales proposals" on public.sales_proposals;
create policy "members can update organization sales proposals"
on public.sales_proposals for update
using (public.is_member_of_organization(organization_id))
with check (public.is_member_of_organization(organization_id));

drop policy if exists "organization admins can delete sales proposals" on public.sales_proposals;
create policy "organization admins can delete sales proposals"
on public.sales_proposals for delete
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = sales_proposals.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

drop policy if exists "members can read organization proposal items" on public.sales_proposal_items;
create policy "members can read organization proposal items"
on public.sales_proposal_items for select
using (public.is_member_of_organization(organization_id));

drop policy if exists "members can create draft proposal items" on public.sales_proposal_items;
create policy "members can create draft proposal items"
on public.sales_proposal_items for insert
with check (
  public.is_member_of_organization(organization_id)
  and exists (
    select 1 from public.sales_proposals proposal
    where proposal.id = proposal_id
      and proposal.organization_id = sales_proposal_items.organization_id
      and proposal.status = 'draft'
  )
);

drop policy if exists "members can update draft proposal items" on public.sales_proposal_items;
create policy "members can update draft proposal items"
on public.sales_proposal_items for update
using (
  public.is_member_of_organization(organization_id)
  and exists (
    select 1 from public.sales_proposals proposal
    where proposal.id = proposal_id
      and proposal.organization_id = sales_proposal_items.organization_id
      and proposal.status = 'draft'
  )
)
with check (
  public.is_member_of_organization(organization_id)
  and exists (
    select 1 from public.sales_proposals proposal
    where proposal.id = proposal_id
      and proposal.organization_id = sales_proposal_items.organization_id
      and proposal.status = 'draft'
  )
);

drop policy if exists "members can delete draft proposal items" on public.sales_proposal_items;
create policy "members can delete draft proposal items"
on public.sales_proposal_items for delete
using (
  public.is_member_of_organization(organization_id)
  and exists (
    select 1 from public.sales_proposals proposal
    where proposal.id = proposal_id
      and proposal.organization_id = sales_proposal_items.organization_id
      and proposal.status = 'draft'
  )
);

create or replace function public.prevent_sales_proposal_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.lead_id is distinct from old.lead_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.currency is distinct from old.currency then
    raise exception 'Proposal identity and calculated amount cannot be changed'
      using errcode = '42501';
  end if;

  if new.total_amount is distinct from old.total_amount and new.total_amount is distinct from coalesce((
    select sum(item.line_total)
    from public.sales_proposal_items item
    where item.organization_id = old.organization_id
      and item.proposal_id = old.id
  ), 0) then
    raise exception 'Proposal amount must match its items'
      using errcode = '42501';
  end if;

  if old.status <> 'draft' and (
    new.title is distinct from old.title
    or new.scope is distinct from old.scope
    or new.valid_until is distinct from old.valid_until
  ) then
    raise exception 'Only draft proposals can be edited'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('sent', 'cancelled'))
    or (old.status = 'sent' and new.status in ('accepted', 'rejected', 'cancelled'))
  ) then
    raise exception 'Invalid proposal status transition'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prevent_sales_proposal_identity_change on public.sales_proposals;
create trigger prevent_sales_proposal_identity_change
before update on public.sales_proposals
for each row execute function public.prevent_sales_proposal_identity_change();

create or replace function public.refresh_sales_proposal_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_organization_id uuid;
  target_proposal_id uuid;
begin
  target_organization_id := coalesce(new.organization_id, old.organization_id);
  target_proposal_id := coalesce(new.proposal_id, old.proposal_id);

  update public.sales_proposals proposal
  set total_amount = coalesce((
    select sum(item.line_total)
    from public.sales_proposal_items item
    where item.organization_id = target_organization_id
      and item.proposal_id = target_proposal_id
  ), 0)
  where proposal.organization_id = target_organization_id
    and proposal.id = target_proposal_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists refresh_sales_proposal_total on public.sales_proposal_items;
create trigger refresh_sales_proposal_total
after insert or update or delete on public.sales_proposal_items
for each row execute function public.refresh_sales_proposal_total();

create or replace function public.prevent_sales_proposal_item_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_status text;
  target_organization_id uuid;
  target_proposal_id uuid;
begin
  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    target_proposal_id := old.proposal_id;
  else
    target_organization_id := new.organization_id;
    target_proposal_id := new.proposal_id;
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.proposal_id is distinct from old.proposal_id
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Proposal item identity cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  select proposal.status into parent_status
  from public.sales_proposals proposal
  where proposal.id = target_proposal_id
    and proposal.organization_id = target_organization_id
  for update;
  if parent_status is distinct from 'draft' then
    raise exception 'Only draft proposal items can be changed'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_sales_proposal_item_identity_change on public.sales_proposal_items;
create trigger prevent_sales_proposal_item_identity_change
before insert or update or delete on public.sales_proposal_items
for each row execute function public.prevent_sales_proposal_item_identity_change();

create or replace function public.create_sales_proposal(
  p_organization_id uuid,
  p_lead_id uuid,
  p_title text,
  p_scope text,
  p_valid_until date,
  p_items jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  proposal_id uuid;
  item jsonb;
  item_position integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'A proposta deve ter de 1 a 30 itens'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'A proposta deve ter de 1 a 30 itens'
      using errcode = '22023';
  end if;

  insert into public.sales_proposals (organization_id, lead_id, title, scope, valid_until)
  values (p_organization_id, p_lead_id, p_title, coalesce(p_scope, ''), p_valid_until)
  returning id into proposal_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.sales_proposal_items (
      organization_id, proposal_id, description, quantity, unit_price, position
    ) values (
      p_organization_id,
      proposal_id,
      item ->> 'description',
      (item ->> 'quantity')::numeric,
      (item ->> 'unit_price')::numeric,
      item_position
    );
    item_position := item_position + 1;
  end loop;

  return proposal_id;
end;
$$;

revoke all on function public.create_sales_proposal(uuid, uuid, text, text, date, jsonb) from public, anon;
grant execute on function public.create_sales_proposal(uuid, uuid, text, text, date, jsonb) to authenticated;

create or replace function public.record_sales_proposal_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_type text;
  activity_title text;
begin
  if tg_op = 'INSERT' then
    activity_type := 'proposal_created';
    activity_title := 'Proposta criada';
  elsif new.status is distinct from old.status then
    activity_type := case new.status
      when 'sent' then 'proposal_sent'
      when 'accepted' then 'proposal_accepted'
      when 'rejected' then 'proposal_rejected'
      when 'cancelled' then 'proposal_cancelled'
      else null
    end;
    activity_title := case new.status
      when 'sent' then 'Envio de proposta registrado'
      when 'accepted' then 'Proposta aceita'
      when 'rejected' then 'Proposta recusada'
      when 'cancelled' then 'Proposta cancelada'
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
    new.title,
    jsonb_build_object('proposal_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;
revoke all on function public.record_sales_proposal_activity() from public;

drop trigger if exists record_sales_proposal_activity on public.sales_proposals;
create trigger record_sales_proposal_activity
after insert or update of status on public.sales_proposals
for each row execute function public.record_sales_proposal_activity();
