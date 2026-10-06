alter table public.leads
  add column if not exists opportunity_override text;
