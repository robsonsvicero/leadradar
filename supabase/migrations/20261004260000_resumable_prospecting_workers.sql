alter table public.prospecting_jobs
  add column if not exists search_query_index integer not null default 0
    check (search_query_index between 0 and 11),
  add column if not exists worker_id uuid,
  add column if not exists worker_lease_until timestamptz;

alter table public.prospecting_job_companies
  add column if not exists place_data jsonb,
  add column if not exists result_classification text
    check (result_classification in ('hot', 'warm', 'cold'));

create or replace function public.claim_prospecting_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_job_id is null or p_worker_id is null or p_lease_seconds is null
    or p_lease_seconds not between 30 and 300 then
    raise exception 'Parâmetros de worker inválidos.' using errcode = '22023';
  end if;

  update public.prospecting_jobs
  set status = 'running',
      worker_id = p_worker_id,
      worker_lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      started_at = coalesce(started_at, clock_timestamp())
  where id = p_job_id
    and status in ('queued', 'running')
    and (worker_lease_until is null or worker_lease_until <= clock_timestamp());

  return found;
end;
$$;

revoke all on function public.claim_prospecting_job(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_prospecting_job(uuid, uuid, integer) to service_role;

create index if not exists prospecting_jobs_worker_lease_idx
  on public.prospecting_jobs (worker_lease_until)
  where status in ('queued', 'running');

comment on column public.prospecting_job_companies.place_data is
  'Google Places payload persisted so prospecting workers can resume without repeating discovery.';
