alter table public.profiles
  add column if not exists access_status text not null default 'approved'
    check (access_status in ('pending', 'approved', 'rejected')),
  add column if not exists is_platform_admin boolean not null default false;

update public.profiles
set is_platform_admin = true
where id = (
  select id
  from public.profiles
  order by created_at asc, id asc
  limit 1
)
and not exists (
  select 1 from public.profiles where is_platform_admin
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_platform_admin
      and access_status = 'approved'
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_first_user boolean;
begin
  perform pg_advisory_xact_lock(20261005, 1000);

  select not exists (select 1 from public.profiles)
  into v_is_first_user;

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    access_status,
    is_platform_admin
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    case when v_is_first_user then 'approved' else 'pending' end,
    v_is_first_user
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop policy if exists "users can view their profile" on public.profiles;
drop policy if exists "users and platform admins can view profiles" on public.profiles;
create policy "users and platform admins can view profiles"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_platform_admin());

revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

create or replace function public.decide_user_access(
  p_user_id uuid,
  p_access_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma pode revisar cadastros.'
      using errcode = '42501';
  end if;

  if p_access_status not in ('approved', 'rejected') then
    raise exception 'Decisão de acesso inválida.' using errcode = '22023';
  end if;

  update public.profiles
  set access_status = p_access_status
  where id = p_user_id
    and access_status = 'pending'
    and not is_platform_admin;

  if not found then
    raise exception 'O cadastro não existe ou já foi revisado.' using errcode = 'P0002';
  end if;

  if p_access_status = 'rejected' then
    delete from public.organization_members
    where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.decide_user_access(uuid, text) from public, anon;
grant execute on function public.decide_user_access(uuid, text) to authenticated;

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

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and access_status = 'approved'
  ) then
    raise exception 'A conta precisa ser aprovada antes de criar uma organização.'
      using errcode = '42501';
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
