create unique index if not exists leads_organization_id_id_unique
  on public.leads (organization_id, id);

alter table public.lead_activities
  drop constraint if exists lead_activities_type_check;
alter table public.lead_activities
  add constraint lead_activities_type_check
  check (type in (
    'lead_created', 'stage_changed', 'score_changed', 'ai_analyzed', 'task_created',
    'task_completed', 'email_draft_created', 'email_approved', 'message_sent',
    'message_delivered', 'message_replied', 'message_draft_created', 'meeting_scheduled',
    'meeting_completed', 'proposal_created', 'proposal_sent', 'proposal_viewed',
    'note_added', 'lead_assigned', 'lead_reassigned'
  ));

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin', 'instagram', 'phone', 'other')),
  status text not null default 'open' check (status in ('open', 'archived')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  last_message_at timestamptz,
  last_message_excerpt text,
  last_message_direction text check (last_message_direction in ('inbound', 'outbound')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint conversations_organization_lead_fkey
    foreign key (organization_id, lead_id)
    references public.leads (organization_id, id)
    on delete cascade
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null check (status in ('draft', 'logged')),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversation_messages_organization_conversation_fkey
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete cascade,
  constraint conversation_messages_draft_must_be_outbound
    check (status <> 'draft' or direction = 'outbound')
);

create index if not exists conversations_org_status_activity_idx
  on public.conversations (organization_id, status, last_message_at desc nulls last);
create index if not exists conversation_messages_org_thread_activity_idx
  on public.conversation_messages (organization_id, conversation_id, occurred_at);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

drop policy if exists "members can read organization conversations" on public.conversations;
create policy "members can read organization conversations"
on public.conversations for select
using (public.is_member_of_organization(organization_id));

drop policy if exists "members can create organization conversations" on public.conversations;
create policy "members can create organization conversations"
on public.conversations for insert
with check (
  public.is_member_of_organization(organization_id)
  and created_by = auth.uid()
  and (
    assigned_to is null
    or exists (
      select 1 from public.organization_members member
      where member.organization_id = conversations.organization_id
        and member.user_id = conversations.assigned_to
    )
  )
);

drop policy if exists "members can update organization conversations" on public.conversations;
create policy "members can update organization conversations"
on public.conversations for update
using (public.is_member_of_organization(organization_id))
with check (
  public.is_member_of_organization(organization_id)
  and (
    assigned_to is null
    or exists (
      select 1 from public.organization_members member
      where member.organization_id = conversations.organization_id
        and member.user_id = conversations.assigned_to
    )
  )
);

drop policy if exists "organization admins can delete conversations" on public.conversations;
create policy "organization admins can delete conversations"
on public.conversations for delete
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = conversations.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

drop policy if exists "members can read organization conversation messages" on public.conversation_messages;
create policy "members can read organization conversation messages"
on public.conversation_messages for select
using (
  public.is_member_of_organization(organization_id)
  and exists (
    select 1 from public.conversations conversation
    where conversation.id = conversation_messages.conversation_id
      and conversation.organization_id = conversation_messages.organization_id
  )
);

drop policy if exists "members can record organization conversation messages" on public.conversation_messages;
create policy "members can record organization conversation messages"
on public.conversation_messages for insert
with check (
  created_by = auth.uid()
  and public.is_member_of_organization(organization_id)
  and exists (
    select 1 from public.conversations conversation
    where conversation.id = conversation_messages.conversation_id
      and conversation.organization_id = conversation_messages.organization_id
      and conversation.status = 'open'
  )
);

create or replace function public.prevent_conversation_identity_change()
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
    raise exception 'Conversation identity and ownership fields cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_conversation_identity_change on public.conversations;
create trigger prevent_conversation_identity_change
before update on public.conversations
for each row execute function public.prevent_conversation_identity_change();

create or replace function public.record_conversation_message()
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
  update public.conversations
  set last_message_at = case
        when last_message_at is null or new.occurred_at >= last_message_at then new.occurred_at
        else last_message_at
      end,
      last_message_excerpt = case
        when last_message_at is null or new.occurred_at >= last_message_at
          then left(regexp_replace(new.body, '[[:space:]]+', ' ', 'g'), 180)
        else last_message_excerpt
      end,
      last_message_direction = case
        when last_message_at is null or new.occurred_at >= last_message_at then new.direction
        else last_message_direction
      end,
      updated_at = now()
  where id = new.conversation_id
    and organization_id = new.organization_id;

  if new.status = 'draft' then
    activity_type := 'message_draft_created';
    activity_title := 'Rascunho de mensagem registrado';
    activity_description := 'Rascunho salvo para revisão. Nenhuma mensagem foi enviada.';
  elsif new.direction = 'inbound' then
    activity_type := 'message_replied';
    activity_title := 'Resposta recebida registrada';
    activity_description := 'Resposta adicionada manualmente ao histórico.';
    update public.leads
    set last_response_at = case
          when last_response_at is null or new.occurred_at >= last_response_at then new.occurred_at
          else last_response_at
        end,
        updated_at = now()
    where id = (
      select conversation.lead_id
      from public.conversations conversation
      where conversation.id = new.conversation_id
        and conversation.organization_id = new.organization_id
    )
      and organization_id = new.organization_id;
  else
    activity_type := 'message_sent';
    activity_title := 'Mensagem enviada registrada';
    activity_description := 'Envio realizado fora do Lead Radar e registrado manualmente.';
    update public.leads
    set last_contact_at = case
          when last_contact_at is null or new.occurred_at >= last_contact_at then new.occurred_at
          else last_contact_at
        end,
        updated_at = now()
    where id = (
      select conversation.lead_id
      from public.conversations conversation
      where conversation.id = new.conversation_id
        and conversation.organization_id = new.organization_id
    )
      and organization_id = new.organization_id;
  end if;

  insert into public.lead_activities (
    organization_id, lead_id, user_id, type, title, description, metadata
  )
  select new.organization_id, conversation.lead_id, new.created_by,
    activity_type, activity_title, activity_description,
    jsonb_build_object(
      'conversation_id', new.conversation_id,
      'message_id', new.id,
      'channel', conversation.channel,
      'source', 'manual'
    )
  from public.conversations conversation
  where conversation.id = new.conversation_id
    and conversation.organization_id = new.organization_id;

  return new;
end;
$$;
revoke all on function public.record_conversation_message() from public;

drop trigger if exists record_conversation_message on public.conversation_messages;
create trigger record_conversation_message
after insert on public.conversation_messages
for each row execute function public.record_conversation_message();
