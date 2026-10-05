-- Lead Radar AI – Supabase schema scaffold
-- Run this in the Supabase SQL editor for the project database.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  email text,
  whatsapp text,
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_invite_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  description text,
  email text,
  website text,
  city text,
  state text,
  country text,
  rating numeric,
  review_count integer not null default 0,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  company_name text not null,
  city text,
  segment text,
  score integer not null default 0,
  technical_score integer not null default 0,
  ai_score integer not null default 0,
  action_score integer not null default 0,
  classification text not null default 'cold' check (classification in ('hot', 'warm', 'cold')),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  opportunity text,
  opportunity_reason text,
  target_fit text check (target_fit in ('matched', 'unconfirmed')),
  target_fit_reason text,
  matched_service text,
  ai_summary text,
  recommended_service text,
  confidence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  description text,
  type text not null default 'follow_up',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at
before update on public.organizations
for each row execute function public.update_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at();

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at
before update on public.companies
for each row execute function public.update_updated_at();

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
before update on public.leads
for each row execute function public.update_updated_at();

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
before update on public.tasks
for each row execute function public.update_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.companies
  add column if not exists email text, enable row level security;
alter table public.leads enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "users can view their organization memberships" on public.organization_members;
create policy "users can view their organization memberships"
on public.organization_members
for select
using (user_id = auth.uid());

drop policy if exists "users can see organizations they belong to" on public.organizations;
create policy "users can see organizations they belong to"
on public.organizations
for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = organizations.id and om.user_id = auth.uid()
  )
);

drop policy if exists "users can view their profile" on public.profiles;
create policy "users can view their profile"
on public.profiles
for select
using (id = auth.uid());

drop policy if exists "users can update their profile" on public.profiles;
create policy "users can update their profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "members can view companies in organization" on public.companies;
create policy "members can view companies in organization"
on public.companies
for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = companies.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members can manage companies in organization" on public.companies;
create policy "members can manage companies in organization"
on public.companies
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = companies.organization_id and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = companies.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members can view leads in organization" on public.leads;
create policy "members can view leads in organization"
on public.leads
for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = leads.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members can manage leads in organization" on public.leads;
create policy "members can manage leads in organization"
on public.leads
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = leads.organization_id and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = leads.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members can view tasks in organization" on public.tasks;
create policy "members can view tasks in organization"
on public.tasks
for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = tasks.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members can manage tasks in organization" on public.tasks;
create policy "members can manage tasks in organization"
on public.tasks
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = tasks.organization_id and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = tasks.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members can view activity in organization" on public.activity_logs;
create policy "members can view activity in organization"
on public.activity_logs
for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = activity_logs.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members can insert activity in organization" on public.activity_logs;
create policy "members can insert activity in organization"
on public.activity_logs
for insert
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = activity_logs.organization_id and om.user_id = auth.uid()
  )
);

create index if not exists idx_organization_members_user_id on public.organization_members(user_id);
create index if not exists idx_organization_members_org_id on public.organization_members(organization_id);
create index if not exists idx_companies_organization_id on public.companies(organization_id);
create index if not exists idx_leads_organization_id on public.leads(organization_id);
create index if not exists idx_tasks_organization_id on public.tasks(organization_id);
create index if not exists idx_activity_logs_organization_id on public.activity_logs(organization_id);

-- Backfill profiles for users who existed before the trigger was installed.
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where u.email is not null
on conflict (id) do update
set email = excluded.email;

-- First organization setup.
-- Replace these three values with your organization name, unique slug, and
-- the email of the user already registered through the app/Supabase Auth.
do $$
declare
  setup_organization_name text := 'GestFors';
  setup_organization_slug text := 'gestfors';
  setup_owner_email text := '<owner-email>';
  target_user_id uuid;
  target_organization_id uuid;
begin
  if setup_owner_email = '<owner-email>' then
    raise notice 'Organização inicial não criada. Edite setup_owner_email, setup_organization_name e setup_organization_slug para criar a organização e associar o usuário proprietário.';
  else
    select id into target_user_id
    from auth.users
    where lower(email) = lower(setup_owner_email)
    limit 1;

    if target_user_id is null then
      raise notice 'Usuário % não encontrado em auth.users. Cadastre-o pelo app e execute novamente o schema.', setup_owner_email;
    else
      insert into public.organizations (name, slug)
      values (setup_organization_name, setup_organization_slug)
      on conflict (slug) do nothing;

      select id into target_organization_id
      from public.organizations
      where slug = setup_organization_slug;

      insert into public.organization_members (organization_id, user_id, role)
      values (target_organization_id, target_user_id, 'owner')
      on conflict (organization_id, user_id) do update
      set role = excluded.role;
    end if;
  end if;
end;
$$;
