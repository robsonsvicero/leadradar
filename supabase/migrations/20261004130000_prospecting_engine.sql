create table if not exists public.prospecting_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  location text not null,
  segment text not null,
  keywords text[] not null default '{}',
  target_quantity integer not null check (target_quantity between 1 and 100),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  companies_found integer not null default 0,
  companies_unique integer not null default 0,
  companies_analyzed integer not null default 0,
  hot_leads integer not null default 0,
  warm_leads integer not null default 0,
  cold_leads integer not null default 0,
  error_count integer not null default 0,
  current_step text not null default 'searching'
    check (current_step in ('searching', 'deduplicating', 'enriching', 'analyzing', 'scoring', 'saving', 'completed', 'failed')),
  progress_percentage integer not null default 0 check (progress_percentage between 0 and 100),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospecting_job_companies (
  id uuid primary key default gen_random_uuid(),
  prospecting_job_id uuid not null references public.prospecting_jobs(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  external_id text,
  status text not null default 'discovered'
    check (status in ('discovered', 'deduplicated', 'enriching', 'analyzing', 'scored', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospecting_job_id, external_id)
);

create table if not exists public.digital_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  website_url text not null,
  website_status text not null default 'pending',
  http_status integer,
  has_https boolean,
  redirect_count integer,
  mobile_score integer,
  performance_score integer,
  seo_score integer,
  accessibility_score integer,
  best_practices_score integer,
  core_web_vitals jsonb,
  page_title text,
  meta_description text,
  has_viewport boolean,
  has_analytics boolean,
  has_pixel boolean,
  has_contact_form boolean,
  has_whatsapp boolean,
  has_phone boolean,
  has_email boolean,
  has_social_links boolean,
  has_cta boolean,
  has_ssl boolean,
  analysis jsonb not null default '{}'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  signal text not null,
  weight integer not null,
  evidence text not null,
  source text not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  operation text not null,
  request_count integer not null default 1 check (request_count > 0),
  estimated_cost numeric(12, 6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.companies
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text,
  add column if not exists website_domain text,
  add column if not exists normalized_name text,
  add column if not exists normalized_phone text,
  add column if not exists normalized_domain text,
  add column if not exists website_status text,
  add column if not exists website_last_checked_at timestamptz,
  add column if not exists data_quality_score integer,
  add column if not exists source_reference jsonb not null default '{}'::jsonb;

alter table public.prospecting_jobs
  add column if not exists companies_unique integer not null default 0;

alter table public.leads
  add column if not exists technical_score integer,
  add column if not exists ai_score integer,
  add column if not exists action_score integer,
  add column if not exists icp_match integer,
  add column if not exists opportunity_reason text,
  add column if not exists recommended_service text,
  add column if not exists sales_argument text,
  add column if not exists confidence numeric(4, 3);

create unique index if not exists companies_org_google_place_unique
  on public.companies (organization_id, google_place_id)
  where google_place_id is not null;
create index if not exists companies_org_domain_idx
  on public.companies (organization_id, normalized_domain)
  where normalized_domain is not null;
create index if not exists prospecting_jobs_org_created_idx
  on public.prospecting_jobs (organization_id, created_at desc);
create unique index if not exists prospecting_jobs_one_active_org_idx
  on public.prospecting_jobs (organization_id)
  where status in ('queued', 'running');
create index if not exists prospecting_job_companies_job_idx
  on public.prospecting_job_companies (prospecting_job_id, status);
create index if not exists digital_analyses_org_company_idx
  on public.digital_analyses (organization_id, company_id, analyzed_at desc);
create unique index if not exists digital_analyses_company_website_unique
  on public.digital_analyses (organization_id, company_id, website_url);
create index if not exists lead_signals_org_lead_idx
  on public.lead_signals (organization_id, lead_id);
create unique index if not exists lead_signals_source_unique
  on public.lead_signals (organization_id, lead_id, signal, source);
create index if not exists api_usage_org_created_idx
  on public.api_usage (organization_id, created_at desc);

drop trigger if exists prospecting_jobs_updated_at on public.prospecting_jobs;
create trigger prospecting_jobs_updated_at
before update on public.prospecting_jobs
for each row execute function public.update_updated_at();

drop trigger if exists prospecting_job_companies_updated_at on public.prospecting_job_companies;
create trigger prospecting_job_companies_updated_at
before update on public.prospecting_job_companies
for each row execute function public.update_updated_at();

drop trigger if exists digital_analyses_updated_at on public.digital_analyses;
create trigger digital_analyses_updated_at
before update on public.digital_analyses
for each row execute function public.update_updated_at();

alter table public.prospecting_jobs enable row level security;
alter table public.prospecting_job_companies enable row level security;
alter table public.digital_analyses enable row level security;
alter table public.lead_signals enable row level security;
alter table public.api_usage enable row level security;

drop policy if exists "members can read prospecting jobs" on public.prospecting_jobs;
create policy "members can read prospecting jobs"
on public.prospecting_jobs for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = prospecting_jobs.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "members can read prospecting job companies" on public.prospecting_job_companies;
create policy "members can read prospecting job companies"
on public.prospecting_job_companies for select
using (
  exists (
    select 1
    from public.prospecting_jobs pj
    join public.organization_members om on om.organization_id = pj.organization_id
    where pj.id = prospecting_job_companies.prospecting_job_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "members can read digital analyses" on public.digital_analyses;
create policy "members can read digital analyses"
on public.digital_analyses for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = digital_analyses.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "members can read lead signals" on public.lead_signals;
create policy "members can read lead signals"
on public.lead_signals for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = lead_signals.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "members can read api usage" on public.api_usage;
create policy "members can read api usage"
on public.api_usage for select
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = api_usage.organization_id
      and om.user_id = auth.uid()
  )
);
