create or replace function public.detach_cadence_tasks_before_lead_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tasks
  set cadence_enrollment_id = null,
      cadence_step_id = null,
      updated_at = now()
  where organization_id = old.organization_id
    and lead_id = old.id
    and cadence_enrollment_id is not null;

  return old;
end;
$$;

drop trigger if exists detach_cadence_tasks_before_lead_delete on public.leads;
create trigger detach_cadence_tasks_before_lead_delete
before delete on public.leads
for each row execute function public.detach_cadence_tasks_before_lead_delete();
