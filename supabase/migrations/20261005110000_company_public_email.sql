alter table public.companies
  add column if not exists email text;

comment on column public.companies.email is
  'Public contact email extracted from the company website.';
