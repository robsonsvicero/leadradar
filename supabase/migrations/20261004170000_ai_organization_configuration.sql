alter table public.organization_icp_settings
  add column if not exists target_company_sizes text[] not null default '{}';

drop policy if exists "organization admins can manage ICP settings" on public.organization_icp_settings;
create policy "organization admins can manage ICP settings"
on public.organization_icp_settings for all
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_icp_settings.organization_id
    and om.user_id = auth.uid()
    and om.role in ('owner', 'admin')
))
with check (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_icp_settings.organization_id
    and om.user_id = auth.uid()
    and om.role in ('owner', 'admin')
));

drop policy if exists "organization admins can manage services" on public.organization_services;
create policy "organization admins can manage services"
on public.organization_services for all
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_services.organization_id
    and om.user_id = auth.uid()
    and om.role in ('owner', 'admin')
))
with check (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_services.organization_id
    and om.user_id = auth.uid()
    and om.role in ('owner', 'admin')
));

drop policy if exists "organization admins can manage AI profile" on public.organization_ai_profile;
create policy "organization admins can manage AI profile"
on public.organization_ai_profile for all
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_ai_profile.organization_id
    and om.user_id = auth.uid()
    and om.role in ('owner', 'admin')
))
with check (exists (
  select 1 from public.organization_members om
  where om.organization_id = organization_ai_profile.organization_id
    and om.user_id = auth.uid()
    and om.role in ('owner', 'admin')
));
