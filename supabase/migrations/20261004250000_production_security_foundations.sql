create or replace function public.create_organization(p_name text, p_slug text default null)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
  v_slug text;
  v_organization public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária para criar uma organização.' using errcode = '42501';
  end if;

  v_name := btrim(p_name);
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Informe um nome da organização com 2 a 120 caracteres.' using errcode = '23514';
  end if;

  v_slug := coalesce(nullif(btrim(p_slug), ''), regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 or length(v_slug) > 60
    or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Informe um slug válido para a organização.' using errcode = '23514';
  end if;

  insert into public.organizations (name, slug)
  values (v_name, v_slug)
  returning * into v_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization.id, auth.uid(), 'owner');

  return v_organization;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

drop policy if exists "authenticated users can create organizations" on public.organizations;
revoke insert, update, delete on public.organizations from public, anon, authenticated;

create or replace function public.is_admin_of_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_admin_of_organization(uuid) from public, anon;
grant execute on function public.is_admin_of_organization(uuid) to authenticated;

revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

drop policy if exists "authenticated users can create organization memberships" on public.organization_members;
revoke insert on public.organization_members from public, anon, authenticated;
grant insert on public.organization_members to authenticated;
create policy "organization admins can add non-owner memberships"
on public.organization_members
for insert
to authenticated
with check (
  public.is_admin_of_organization(organization_id)
  and role in ('admin', 'member')
);

create table if not exists public.rate_limit_buckets (
  subject_type text not null check (subject_type in ('user', 'organization')),
  subject_id text not null check (length(subject_id) between 1 and 120),
  action text not null check (length(action) between 1 and 80),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (subject_type, subject_id, action, window_start)
);

alter table public.rate_limit_buckets enable row level security;

create or replace function public.consume_rate_limit(
  p_subject_type text,
  p_subject_id text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window_start timestamptz;
  v_claimed_count integer;
begin
  if p_subject_type not in ('user', 'organization')
    or p_subject_id is null or length(p_subject_id) not between 1 and 120
    or p_action is null or length(p_action) not between 1 and 80
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 86400 then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  delete from public.rate_limit_buckets
  where subject_type = p_subject_type
    and subject_id = p_subject_id
    and action = p_action
    and window_start < v_window_start - interval '1 day';

  insert into public.rate_limit_buckets (
    subject_type, subject_id, action, window_start, request_count, updated_at
  )
  values (p_subject_type, p_subject_id, p_action, v_window_start, 1, now())
  on conflict (subject_type, subject_id, action, window_start)
  do update set
    request_count = public.rate_limit_buckets.request_count + 1,
    updated_at = now()
  where public.rate_limit_buckets.request_count < p_limit
  returning request_count into v_claimed_count;

  return v_claimed_count is not null;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, text, integer, integer) to service_role;

create index if not exists rate_limit_buckets_updated_at_idx
  on public.rate_limit_buckets (updated_at);
