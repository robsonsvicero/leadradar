create or replace function public.create_organization(p_name text, p_slug text default null)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_slug text;
  v_organization public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária para criar uma organização.' using errcode = '42501';
  end if;

  v_name := trim(p_name);
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Informe um nome da organização com 2 a 120 caracteres.' using errcode = '23514';
  end if;

  v_slug := coalesce(trim(p_slug), lower(regexp_replace(v_name, '[^a-z0-9]+', '-', 'g')));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' or length(v_slug) < 2 or length(v_slug) > 60 then
    raise exception 'Informe um slug válido para a organização.' using errcode = '23514';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'O slug só pode conter letras minúsculas, números e hífens.' using errcode = '23514';
  end if;

  insert into public.organizations (name, slug)
  values (v_name, v_slug)
  on conflict (slug) do update
    set name = excluded.name
  returning * into v_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization.id, auth.uid(), 'owner')
  on conflict (organization_id, user_id) do update
    set role = excluded.role;

  return v_organization;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

alter table public.organizations enable row level security;

drop policy if exists "authenticated users can create organizations" on public.organizations;
create policy "authenticated users can create organizations"
on public.organizations
for insert
with check (auth.uid() is not null);

drop policy if exists "authenticated users can create organization memberships" on public.organization_members;
create policy "authenticated users can create organization memberships"
on public.organization_members
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organization_members om
    where om.organization_id = organization_members.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
  )
);
