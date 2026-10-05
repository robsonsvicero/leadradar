create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.prospecting_jobs
  add column if not exists is_automatic boolean not null default false,
  add column if not exists automatic_minimum_score integer
    check (automatic_minimum_score between 0 and 100);

create table if not exists public.automatic_prospecting_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  run_time time not null default '08:00',
  timezone text not null default 'America/Sao_Paulo',
  leads_per_day integer not null default 50 check (leads_per_day between 1 and 100),
  minimum_score integer not null default 60 check (minimum_score between 0 and 100),
  alert_score integer not null default 85 check (alert_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automatic_prospecting_alert_score_check check (alert_score >= minimum_score)
);

create table if not exists public.automatic_prospecting_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  local_date date not null,
  status text not null check (status in ('running', 'scheduled', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  prospecting_job_id uuid references public.prospecting_jobs(id) on delete set null,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (organization_id, local_date)
);

alter table public.prospecting_jobs
  add column if not exists automatic_run_id uuid
    references public.automatic_prospecting_runs(id) on delete set null;

create unique index if not exists prospecting_jobs_automatic_run_unique
  on public.prospecting_jobs (automatic_run_id)
  where automatic_run_id is not null;

create index if not exists automatic_prospecting_runs_org_date_idx
  on public.automatic_prospecting_runs (organization_id, local_date desc);

create table if not exists public.organization_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  notification_type text not null,
  company_name text not null,
  score integer not null check (score between 0 and 100),
  classification text not null check (classification in ('hot', 'warm', 'cold')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, lead_id, notification_type)
);

create index if not exists organization_notifications_unread_idx
  on public.organization_notifications (organization_id, created_at desc)
  where read_at is null;

drop trigger if exists automatic_prospecting_settings_updated_at on public.automatic_prospecting_settings;
create trigger automatic_prospecting_settings_updated_at
before update on public.automatic_prospecting_settings
for each row execute function public.update_updated_at();

alter table public.automatic_prospecting_settings enable row level security;
alter table public.automatic_prospecting_runs enable row level security;
alter table public.organization_notifications enable row level security;

drop policy if exists "members can read automatic prospecting settings" on public.automatic_prospecting_settings;
create policy "members can read automatic prospecting settings"
on public.automatic_prospecting_settings for select
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = automatic_prospecting_settings.organization_id
    and member.user_id = auth.uid()
));

drop policy if exists "organization admins can manage automatic prospecting settings" on public.automatic_prospecting_settings;
create policy "organization admins can manage automatic prospecting settings"
on public.automatic_prospecting_settings for all
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = automatic_prospecting_settings.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
))
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = automatic_prospecting_settings.organization_id
    and member.user_id = auth.uid()
    and member.role in ('owner', 'admin')
));

drop policy if exists "members can read automatic prospecting runs" on public.automatic_prospecting_runs;
create policy "members can read automatic prospecting runs"
on public.automatic_prospecting_runs for select
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = automatic_prospecting_runs.organization_id
    and member.user_id = auth.uid()
));

drop policy if exists "members can read organization notifications" on public.organization_notifications;
create policy "members can read organization notifications"
on public.organization_notifications for select
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_notifications.organization_id
    and member.user_id = auth.uid()
));

drop policy if exists "members can mark organization notifications read" on public.organization_notifications;
create policy "members can mark organization notifications read"
on public.organization_notifications for update
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_notifications.organization_id
    and member.user_id = auth.uid()
))
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_notifications.organization_id
    and member.user_id = auth.uid()
));

grant select, insert, update on public.automatic_prospecting_settings to authenticated;
grant select on public.automatic_prospecting_runs to authenticated;
grant select on public.organization_notifications to authenticated;
grant update (read_at) on public.organization_notifications to authenticated;

create or replace function public.claim_automatic_prospecting_run(p_organization_id uuid, p_local_date date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role is required';
  end if;

  insert into public.automatic_prospecting_runs (organization_id, local_date, status, attempts, started_at, finished_at)
  values (p_organization_id, p_local_date, 'running', 1, now(), null)
  on conflict (organization_id, local_date) do update
    set status = 'running',
        attempts = automatic_prospecting_runs.attempts + 1,
        error_message = null,
        started_at = now(),
        finished_at = null
    where automatic_prospecting_runs.status = 'failed'
      and automatic_prospecting_runs.started_at < now() - interval '30 minutes'
  returning id into claimed_id;

  return claimed_id;
end;
$$;

revoke all on function public.claim_automatic_prospecting_run(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_automatic_prospecting_run(uuid, date) to service_role;

create or replace function public.notify_high_score_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alert_threshold integer;
begin
  select settings.alert_score
  into alert_threshold
  from public.automatic_prospecting_settings settings
  where settings.organization_id = new.organization_id
    and settings.enabled = true;

  if alert_threshold is null or new.score < alert_threshold then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.score >= alert_threshold then
    return new;
  end if;

  insert into public.organization_notifications (
    organization_id, lead_id, notification_type, company_name, score, classification
  )
  values (
    new.organization_id, new.id, 'high_score_lead', new.company_name, new.score, new.classification
  )
  on conflict (organization_id, lead_id, notification_type) do nothing;

  return new;
end;
$$;

drop trigger if exists leads_notify_high_score on public.leads;
create trigger leads_notify_high_score
after insert or update of score on public.leads
for each row execute function public.notify_high_score_lead();

do $$
declare
  existing_job_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Vault não está disponível; agendamento automático não foi criado.';
    return;
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'lead-radar-automatic-prospecting';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'lead-radar-automatic-prospecting',
    '* * * * *',
    $cron$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'lead_radar_automatic_prospecting_url'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'lead_radar_automatic_prospecting_service_role_key'
          ),
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'lead_radar_automatic_prospecting_service_role_key'
          )
        ),
        body := '{}'::jsonb
      )
      where exists (
        select 1 from vault.decrypted_secrets
        where name = 'lead_radar_automatic_prospecting_url'
      )
      and exists (
        select 1 from vault.decrypted_secrets
        where name = 'lead_radar_automatic_prospecting_service_role_key'
      );
    $cron$
  );
end;
$$;
