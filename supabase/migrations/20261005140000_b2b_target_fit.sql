alter table public.leads
  add column if not exists target_fit text
    check (target_fit in ('matched', 'unconfirmed')),
  add column if not exists target_fit_reason text,
  add column if not exists matched_service text;
