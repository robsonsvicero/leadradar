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
    or p_limit is null or p_limit not between 1 and 10000
    or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
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
